#!/usr/bin/env python3
"""Generate the binding seller SVG source map and normalized layout specs.

The tool intentionally uses only the Python standard library.  It reads the
extracted, local design handoff and never contacts a remote service.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import csv
import hashlib
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import urllib.parse
import xml.etree.ElementTree as ET
import zipfile
import zlib
from pathlib import Path
from typing import Any, Iterable


ACTIVE_REPRESENTATIVES = (
    "001", "055", "057", "066", "069", "074", "089", "124", "142",
    "156", "185", "243", "276", "282", "292",
)
SVG_SPEC_REFERENCES = ("156", "185", "243", "276", "282", "292")

# PNG-only source regions were measured against the binding raster at its
# native IHDR dimensions.  They are kept here so regeneration is deterministic.
PNG_REGION_SPECS: dict[str, list[dict[str, Any]]] = {
    "001": [
        {"id": "top_bar", "kind": "rounded_card", "x": 39, "y": 44, "width": 773, "height": 107, "radius": 53},
        {"id": "brand", "kind": "accepted_owner_asset_slot", "x": 315, "y": 237, "width": 223, "height": 175},
        {"id": "hero_copy", "kind": "text_region", "x": 108, "y": 489, "width": 637, "height": 111},
        {"id": "form_card", "kind": "rounded_card", "x": 39, "y": 665, "width": 773, "height": 581, "radius": 42},
        {"id": "identifier_field", "kind": "input", "x": 91, "y": 780, "width": 668, "height": 99, "radius": 16},
        {"id": "password_field", "kind": "input", "x": 91, "y": 983, "width": 668, "height": 98, "radius": 16},
        {"id": "remember_row", "kind": "control_row", "x": 91, "y": 1137, "width": 668, "height": 43},
        {"id": "primary_cta", "kind": "button", "x": 52, "y": 1306, "width": 744, "height": 106, "radius": 20},
        {"id": "application_action", "kind": "text_action", "x": 216, "y": 1455, "width": 421, "height": 38},
        {"id": "support_row", "kind": "support_action", "x": 319, "y": 1563, "width": 216, "height": 42},
        {"id": "security_footer", "kind": "security_note", "x": 177, "y": 1681, "width": 499, "height": 39},
    ],
    "055": [
        {"id": "brand_header", "kind": "brand_context", "x": 42, "y": 43, "width": 779, "height": 108},
        {"id": "greeting", "kind": "text_region", "x": 42, "y": 190, "width": 475, "height": 94},
        {"id": "sales_hero", "kind": "rounded_card", "x": 30, "y": 314, "width": 792, "height": 460, "radius": 24},
        {"id": "task_orders", "kind": "task_card", "x": 30, "y": 798, "width": 247, "height": 312, "radius": 20},
        {"id": "task_stock", "kind": "task_card", "x": 301, "y": 798, "width": 248, "height": 312, "radius": 20},
        {"id": "task_questions", "kind": "task_card", "x": 573, "y": 798, "width": 249, "height": 312, "radius": 20},
        {"id": "balance", "kind": "summary_card", "x": 30, "y": 1134, "width": 792, "height": 163, "radius": 20},
        {"id": "recent_orders", "kind": "list_card", "x": 30, "y": 1386, "width": 792, "height": 198, "radius": 20},
        {"id": "primary_cta", "kind": "button", "x": 30, "y": 1599, "width": 792, "height": 64, "radius": 13},
        {"id": "bottom_navigation", "kind": "navigation", "x": 27, "y": 1681, "width": 798, "height": 119, "radius": 38},
    ],
}

NUMBER_RE = re.compile(r"[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?")
DEFAULT_HANDOFF_ZIP = "Satıcı teması NovaStore-Seller-Theme-Integration-Handoff.zip"
SVG_DELTA_THRESHOLD_PERCENT = 5.0
EXPECTED_PACKAGE_MANIFEST_SHA256 = "17fcbf0f80509753d3ce2239726ef5fab5a62ae739c85562440b63b6e5ed4e65"

FORBIDDEN_SVG_ELEMENT_RE = re.compile(
    r"<\s*(?:script|foreignObject|iframe|object|embed|audio|video|animate|animateTransform|set)\b",
    re.IGNORECASE,
)
SVG_EVENT_HANDLER_RE = re.compile(r"\son[a-z0-9_-]+\s*=", re.IGNORECASE)
SVG_RESOURCE_ATTRIBUTE_RE = re.compile(
    r"\b(?:href|xlink:href|src)\s*=\s*(['\"])(.*?)\1",
    re.IGNORECASE | re.DOTALL,
)
SVG_CSS_URL_RE = re.compile(r"url\(\s*(['\"]?)(.*?)\1\s*\)", re.IGNORECASE | re.DOTALL)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def png_dimensions(path: Path) -> tuple[int, int]:
    with path.open("rb") as stream:
        signature = stream.read(24)
    if len(signature) != 24 or signature[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"Not a PNG: {path}")
    return struct.unpack(">II", signature[16:24])


def png_rgb(path: Path) -> tuple[int, int, bytes]:
    """Decode an 8-bit RGB/RGBA PNG using only the standard library."""
    payload = path.read_bytes()
    if payload[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"Not a PNG: {path}")
    offset = 8
    width = height = color_type = bit_depth = 0
    compressed = bytearray()
    while offset < len(payload):
        length = struct.unpack(">I", payload[offset:offset + 4])[0]
        kind = payload[offset + 4:offset + 8]
        body = payload[offset + 8:offset + 8 + length]
        offset += 12 + length
        if kind == b"IHDR":
            width, height, bit_depth, color_type = struct.unpack(">IIBB", body[:10])
        elif kind == b"IDAT":
            compressed.extend(body)
        elif kind == b"IEND":
            break
    channels = {2: 3, 6: 4}.get(color_type)
    if bit_depth != 8 or channels is None:
        raise ValueError(f"Unsupported PNG format: bit_depth={bit_depth} color_type={color_type} path={path}")
    packed = zlib.decompress(bytes(compressed))
    stride = width * channels
    previous = bytearray(stride)
    rgb = bytearray(width * height * 3)
    source_offset = target_offset = 0
    for _ in range(height):
        filter_type = packed[source_offset]
        source_offset += 1
        raw = packed[source_offset:source_offset + stride]
        source_offset += stride
        row = bytearray(stride)
        for index, value in enumerate(raw):
            left = row[index - channels] if index >= channels else 0
            up = previous[index]
            upper_left = previous[index - channels] if index >= channels else 0
            if filter_type == 0:
                decoded = value
            elif filter_type == 1:
                decoded = (value + left) & 255
            elif filter_type == 2:
                decoded = (value + up) & 255
            elif filter_type == 3:
                decoded = (value + ((left + up) // 2)) & 255
            elif filter_type == 4:
                predictor = left + up - upper_left
                distances = (abs(predictor - left), abs(predictor - up), abs(predictor - upper_left))
                decoded = (value + (left, up, upper_left)[distances.index(min(distances))]) & 255
            else:
                raise ValueError(f"Unsupported PNG filter {filter_type}: {path}")
            row[index] = decoded
        for index in range(width):
            source = index * channels
            rgb[target_offset:target_offset + 3] = row[source:source + 3]
            target_offset += 3
        previous = row
    return width, height, bytes(rgb)


def find_browser(explicit: Path | None) -> Path:
    candidates = [
        explicit,
        Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
        Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
        Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
    ]
    for candidate in candidates:
        if candidate is not None and candidate.is_file():
            return candidate.resolve()
    raise FileNotFoundError("A local Chromium/Edge renderer is required for SVG-to-PNG verification")


def browser_version(browser: Path) -> str:
    # Reading the executable hash is deterministic and does not attach to an
    # already-running desktop browser process (which can make `--version`
    # hang on Windows).
    return f"{browser.name}:sha256:{sha256(browser)}"


def validate_svg_render_input(
    svg_path: Path,
    handoff_root: Path,
    package_manifest: dict[str, str],
) -> None:
    """Reject active or externally addressable SVG content before browser use."""
    text = svg_path.read_text(encoding="utf-8-sig")
    if "<!DOCTYPE" in text.upper() or "<!ENTITY" in text.upper():
        raise ValueError(f"SVG document/entity declaration is forbidden: {svg_path}")
    if FORBIDDEN_SVG_ELEMENT_RE.search(text):
        raise ValueError(f"Active SVG element is forbidden: {svg_path}")
    if SVG_EVENT_HANDLER_RE.search(text):
        raise ValueError(f"SVG event handler is forbidden: {svg_path}")
    if re.search(r"@import\b", text, re.IGNORECASE):
        raise ValueError(f"SVG stylesheet import is forbidden: {svg_path}")
    def validate_resource(resource: str) -> None:
        resource = resource.strip()
        if resource.startswith("#") or resource.lower().startswith("data:image/"):
            return
        parsed = urllib.parse.urlsplit(resource)
        if parsed.scheme or parsed.netloc or resource.startswith(("/", "\\")):
            raise ValueError(f"External SVG resource is forbidden: {svg_path}: {resource[:80]}")
        local_resource = (svg_path.parent / urllib.parse.unquote(parsed.path)).resolve()
        handoff = handoff_root.resolve()
        if not local_resource.is_relative_to(handoff) or not local_resource.is_file():
            raise ValueError(f"SVG resource escaped or is missing: {svg_path}: {resource[:80]}")
        relative = local_resource.relative_to(handoff).as_posix()
        if package_manifest.get(relative) != sha256(local_resource):
            raise ValueError(f"SVG resource manifest hash mismatch: {relative}")

    for match in SVG_RESOURCE_ATTRIBUTE_RE.finditer(text):
        validate_resource(match.group(2))
    for match in SVG_CSS_URL_RE.finditer(text):
        validate_resource(match.group(2))


def render_svg_delta(svg_path: Path, png_path: Path, browser: Path, temp_root: Path) -> float:
    reference = svg_path.name[13:16]
    output = temp_root / f"{reference}.png"
    profile = temp_root / f"profile-{reference}"
    command = [
        str(browser),
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--no-first-run",
        "--disable-background-networking",
        "--disable-sync",
        "--disable-extensions",
        "--disable-javascript",
        "--disable-component-update",
        "--metrics-recording-only",
        "--safebrowsing-disable-auto-update",
        "--host-resolver-rules=MAP * 0.0.0.0",
        "--no-proxy-server",
        "--force-device-scale-factor=1",
        "--window-size=852,1846",
        f"--screenshot={output}",
        f"--user-data-dir={profile}",
        svg_path.resolve().as_uri(),
    ]
    result = subprocess.run(command, capture_output=True, text=True, timeout=45)
    if result.returncode != 0 or not output.is_file():
        raise RuntimeError(f"SVG renderer failed for {reference}: exit={result.returncode} stderr={result.stderr[-500:]}")
    reference_width, reference_height, reference_rgb = png_rgb(png_path)
    render_width, render_height, render_rgb = png_rgb(output)
    if (reference_width, reference_height) != (render_width, render_height):
        raise ValueError(
            f"SVG render canvas mismatch for {reference}: "
            f"render={render_width}x{render_height} binding={reference_width}x{reference_height}"
        )
    changed = 0
    for index in range(0, len(reference_rgb), 3):
        # Keep the source-render gate identical to sellerWave4VisualEvidence:
        # one changed pixel is an RGB absolute-difference sum above 36.
        if sum(abs(reference_rgb[index + channel] - render_rgb[index + channel]) for channel in range(3)) > 36:
            changed += 1
    return round(changed * 100.0 / (reference_width * reference_height), 6)


def manifest_hashes(path: Path) -> dict[str, str]:
    entries: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        if not line.strip():
            continue
        digest, relative = line.split(None, 1)
        normalized = relative.strip().removeprefix("./").replace("\\", "/")
        if normalized in entries:
            raise ValueError(f"Duplicate package-manifest path: {normalized}")
        entries[normalized] = digest.lower()
    return entries


def extract_binding_archive(archive_path: Path, destination: Path) -> None:
    destination_root = destination.resolve()
    with zipfile.ZipFile(archive_path) as archive:
        for member in archive.infolist():
            candidate = (destination_root / member.filename).resolve()
            if candidate != destination_root and destination_root not in candidate.parents:
                raise ValueError(f"Binding archive path escapes extraction root: {member.filename}")
        archive.extractall(destination_root)


def svg_canvas(path: Path) -> tuple[str, str, str]:
    # One archived source (031) is intentionally retained byte-for-byte even
    # though its trailing XML is malformed. Inventory needs only the root SVG
    # canvas, so read the opening tag without repairing source material.
    source = path.read_text(encoding="utf-8", errors="strict")
    svg_match = re.search(r"<svg\b[^>]*>", source)
    if not svg_match:
        raise ValueError(f"SVG root element missing: {path}")
    opening = svg_match.group(0)
    width_match = re.search(r'\bwidth="([^"]+)"', opening)
    height_match = re.search(r'\bheight="([^"]+)"', opening)
    view_box_match = re.search(r'\bviewBox="([^"]+)"', opening)
    if not width_match or not height_match or not view_box_match:
        raise ValueError(f"SVG canvas metadata missing: {path}")
    return width_match.group(1), height_match.group(1), view_box_match.group(1)


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def numeric(value: str | None, default: float = 0.0) -> float:
    if value is None:
        return default
    match = NUMBER_RE.search(value)
    return float(match.group(0)) if match else default


def normalized_box(x: float, y: float, width: float, height: float, canvas_width: float, canvas_height: float) -> dict[str, float]:
    return {
        "x": round(x / canvas_width, 8),
        "y": round(y / canvas_height, 8),
        "width": round(width / canvas_width, 8),
        "height": round(height / canvas_height, 8),
    }


def path_envelope(path_data: str) -> dict[str, float] | None:
    # Deterministic coordinate envelope for icon/path inspection.  The source
    # generator emits absolute M/L/C commands for the representative screens;
    # control-point extrema are deliberately retained as a conservative bbox.
    tokens = re.findall(r"[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?", path_data)
    command = ""
    cursor_x = cursor_y = 0.0
    origin_x = origin_y = 0.0
    xs: list[float] = []
    ys: list[float] = []
    index = 0
    arities = {"M": 2, "L": 2, "T": 2, "H": 1, "V": 1, "C": 6, "S": 4, "Q": 4, "A": 7, "Z": 0}
    while index < len(tokens):
        if tokens[index].isalpha():
            command = tokens[index]
            index += 1
            if command.upper() == "Z":
                cursor_x, cursor_y = origin_x, origin_y
                xs.append(cursor_x); ys.append(cursor_y)
                continue
        if not command or command.upper() not in arities:
            index += 1
            continue
        arity = arities[command.upper()]
        if arity == 0 or index + arity > len(tokens):
            continue
        try:
            values = [float(value) for value in tokens[index:index + arity]]
        except ValueError:
            index += 1
            continue
        index += arity
        relative = command.islower()
        upper = command.upper()
        points: list[tuple[float, float]] = []
        if upper == "H":
            cursor_x = cursor_x + values[0] if relative else values[0]
            points.append((cursor_x, cursor_y))
        elif upper == "V":
            cursor_y = cursor_y + values[0] if relative else values[0]
            points.append((cursor_x, cursor_y))
        elif upper == "A":
            end_x = values[5] + cursor_x if relative else values[5]
            end_y = values[6] + cursor_y if relative else values[6]
            # Include radii around both endpoints so the envelope cannot
            # under-report an arc.  This is conservative by design.
            rx, ry = abs(values[0]), abs(values[1])
            points.extend([(cursor_x - rx, cursor_y - ry), (cursor_x + rx, cursor_y + ry), (end_x - rx, end_y - ry), (end_x + rx, end_y + ry)])
            cursor_x, cursor_y = end_x, end_y
        else:
            for offset in range(0, len(values), 2):
                px = values[offset] + cursor_x if relative else values[offset]
                py = values[offset + 1] + cursor_y if relative else values[offset + 1]
                points.append((px, py))
            cursor_x, cursor_y = points[-1]
        if upper == "M":
            origin_x, origin_y = cursor_x, cursor_y
            command = "l" if relative else "L"
        for px, py in points:
            xs.append(px); ys.append(py)
    if not xs:
        return None
    return {"x": min(xs), "y": min(ys), "width": max(xs) - min(xs), "height": max(ys) - min(ys)}


def extract_svg_spec(reference: str, svg_path: Path, png_path: Path) -> dict[str, Any]:
    root = ET.parse(svg_path).getroot()
    width = numeric(root.get("width"))
    height = numeric(root.get("height"))
    view_box = [numeric(value) for value in (root.get("viewBox") or "").split()]
    if len(view_box) != 4:
        raise ValueError(f"Invalid viewBox: {svg_path}")
    objects: list[dict[str, Any]] = []
    gradients: list[dict[str, Any]] = []
    filters: list[dict[str, Any]] = []
    for element in root.iter():
        kind = local_name(element.tag)
        attrs = element.attrib
        if kind in {"linearGradient", "radialGradient"}:
            gradients.append({
                "id": attrs.get("id"),
                "type": kind,
                "direction": {key: attrs.get(key) for key in ("x1", "y1", "x2", "y2", "cx", "cy", "r") if attrs.get(key) is not None},
                "stops": [
                    {"offset": child.get("offset"), "color": child.get("stop-color"), "opacity": child.get("stop-opacity", "1")}
                    for child in element if local_name(child.tag) == "stop"
                ],
            })
            continue
        if kind == "filter":
            filters.append({
                "id": attrs.get("id"),
                "bounds": {key: attrs.get(key) for key in ("x", "y", "width", "height")},
                "operations": [
                    {"type": local_name(child.tag), **{key: value for key, value in child.attrib.items() if key in {"dx", "dy", "stdDeviation", "flood-color", "flood-opacity", "operator"}}}
                    for child in element
                ],
            })
            continue
        record: dict[str, Any] | None = None
        if kind == "rect":
            x, y, item_width, item_height = numeric(attrs.get("x")), numeric(attrs.get("y")), numeric(attrs.get("width")), numeric(attrs.get("height"))
            record = {"type": kind, "x": x, "y": y, "width": item_width, "height": item_height, "rx": numeric(attrs.get("rx")), "ry": numeric(attrs.get("ry")), "normalized": normalized_box(x, y, item_width, item_height, width, height)}
        elif kind == "circle":
            cx, cy, radius = numeric(attrs.get("cx")), numeric(attrs.get("cy")), numeric(attrs.get("r"))
            record = {"type": kind, "cx": cx, "cy": cy, "r": radius, "bbox": {"x": cx - radius, "y": cy - radius, "width": radius * 2, "height": radius * 2}, "normalized": normalized_box(cx - radius, cy - radius, radius * 2, radius * 2, width, height)}
        elif kind == "line":
            x1, y1, x2, y2 = (numeric(attrs.get(key)) for key in ("x1", "y1", "x2", "y2"))
            box = {"x": min(x1, x2), "y": min(y1, y2), "width": abs(x2 - x1), "height": abs(y2 - y1)}
            record = {"type": kind, "x1": x1, "y1": y1, "x2": x2, "y2": y2, "bbox": box, "normalized": normalized_box(box["x"], box["y"], box["width"], box["height"], width, height)}
        elif kind == "text":
            x, y = numeric(attrs.get("x")), numeric(attrs.get("y"))
            record = {"type": kind, "x": x, "y": y, "text": "".join(element.itertext()), "anchor": attrs.get("text-anchor", "start"), "font_family": attrs.get("font-family"), "font_size": numeric(attrs.get("font-size")), "font_weight": attrs.get("font-weight"), "fill": attrs.get("fill"), "letter_spacing": attrs.get("letter-spacing"), "opacity": numeric(attrs.get("opacity"), 1.0), "normalized_anchor": {"x": round(x / width, 8), "y": round(y / height, 8)}}
        elif kind == "image":
            x, y, item_width, item_height = numeric(attrs.get("x")), numeric(attrs.get("y")), numeric(attrs.get("width")), numeric(attrs.get("height"))
            href = attrs.get("{http://www.w3.org/1999/xlink}href") or attrs.get("href")
            record = {"type": kind, "x": x, "y": y, "width": item_width, "height": item_height, "referenced_asset": href, "preserve_aspect_ratio": attrs.get("preserveAspectRatio"), "normalized": normalized_box(x, y, item_width, item_height, width, height)}
        elif kind == "path":
            path_data = attrs.get("d", "")
            box = path_envelope(path_data)
            record = {"type": kind, "d": path_data, "bbox": box, "bbox_method": "deterministic_coordinate_envelope", "normalized": normalized_box(box["x"], box["y"], box["width"], box["height"], width, height) if box else None}
        if record is not None:
            record.update({key: attrs.get(key) for key in ("fill", "stroke", "stroke-width", "opacity", "filter") if attrs.get(key) is not None})
            objects.append(record)
    major_regions = []
    for item in objects:
        if item.get("type") != "rect":
            continue
        item_width = float(item.get("width", 0))
        item_height = float(item.get("height", 0))
        if item_width < width * 0.75 or item_height < 50:
            continue
        if item_width >= width * 0.99 and item_height >= height * 0.99:
            continue
        major_regions.append({
            "id": f"svg_major_{len(major_regions) + 1:02d}",
            "kind": "source_rect",
            "x": item["x"],
            "y": item["y"],
            "width": item["width"],
            "height": item["height"],
            "radius": max(float(item.get("rx", 0)), float(item.get("ry", 0))),
            "normalized": item["normalized"],
        })
    png_width, png_height = png_dimensions(png_path)
    return {
        "schema_version": 1,
        "reference_id": reference,
        "authority": "FULL_SCREEN_SVG",
        "source_svg": f"source/svg/{svg_path.name}",
        "source_svg_sha256": sha256(svg_path),
        "binding_png": f"source/phone/{png_path.name}",
        "binding_png_sha256": sha256(png_path),
        "canvas": {"width": width, "height": height, "viewBox": view_box, "background": objects[0].get("fill") if objects and objects[0].get("type") == "rect" else None},
        "binding_png_canvas": {"width": png_width, "height": png_height},
        "gradients": gradients,
        "filters": filters,
        "regions": major_regions,
        "objects": objects,
    }


def png_spec(reference: str, png_path: Path) -> dict[str, Any]:
    width, height = png_dimensions(png_path)
    regions = []
    for source in PNG_REGION_SPECS[reference]:
        region = dict(source)
        region["normalized"] = normalized_box(region["x"], region["y"], region["width"], region["height"], width, height)
        regions.append(region)
    return {
        "schema_version": 1,
        "reference_id": reference,
        "authority": "PNG_ONLY",
        "source_svg": None,
        "binding_png": f"source/phone/{png_path.name}",
        "binding_png_sha256": sha256(png_path),
        "canvas": {"width": width, "height": height, "background": "binding_raster_sampled"},
        "measurement_method": "native-raster region segmentation and edge inspection",
        "regions": regions,
    }


def find_by_reference(directory: Path, reference: str, suffix: str) -> Path | None:
    matches = sorted(directory.glob(f"seller-phone-{reference}-*{suffix}"))
    if len(matches) > 1:
        raise ValueError(f"Duplicate reference {reference} in {directory}: {matches}")
    return matches[0] if matches else None


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8", newline="\n")


def generate(args: argparse.Namespace) -> list[Path]:
    handoff = args.handoff_root.resolve()
    catalog_path = handoff / "docs" / "SCREEN_CATALOG.tsv"
    png_root = handoff / "source" / "phone"
    svg_root = handoff / "source" / "svg"
    manifest_path = handoff / "PACKAGE_MANIFEST.sha256"
    for required in (catalog_path, png_root, svg_root, manifest_path, args.matrix):
        if not required.exists():
            raise FileNotFoundError(required)
    actual_manifest_hash = sha256(manifest_path)
    if actual_manifest_hash != EXPECTED_PACKAGE_MANIFEST_SHA256:
        raise ValueError(
            "Binding package manifest does not match the pinned owner-authorized digest: "
            f"actual={actual_manifest_hash}"
        )
    package_manifest = manifest_hashes(manifest_path)
    with catalog_path.open("r", encoding="utf-8-sig", newline="") as stream:
        catalog_rows = list(csv.DictReader(stream, delimiter="\t"))
    with args.matrix.open("r", encoding="utf-8-sig", newline="") as stream:
        matrix_rows = list(csv.DictReader(stream, delimiter="\t"))
    matrix_by_id = {row["reference_number"]: row for row in matrix_rows}
    catalog_ids = [(row.get("screen_id") or row.get("reference_number") or row.get("id") or "").zfill(3) for row in catalog_rows]
    if len(catalog_rows) != 296 or len(set(catalog_ids)) != 296 or len(matrix_by_id) != 296:
        raise ValueError("Expected exactly 296 catalog and matrix references")
    catalog_relative = "docs/SCREEN_CATALOG.tsv"
    if package_manifest.get(catalog_relative) != sha256(catalog_path):
        raise ValueError(f"Package manifest catalog hash mismatch: {catalog_relative}")

    # Verify every browser input against the pinned package manifest and reject
    # active/external SVG content before locating or starting a browser.
    for reference in catalog_ids:
        png_path = find_by_reference(png_root, reference, ".png")
        if png_path is None:
            raise ValueError(f"Binding PNG missing: {reference}")
        png_relative = f"source/phone/{png_path.name}"
        if package_manifest.get(png_relative) != sha256(png_path):
            raise ValueError(f"Package manifest PNG hash mismatch: {png_relative}")
        svg_path = find_by_reference(svg_root, reference, ".svg")
        if svg_path is not None:
            svg_relative = f"source/svg/{svg_path.name}"
            if package_manifest.get(svg_relative) != sha256(svg_path):
                raise ValueError(f"Package manifest SVG hash mismatch: {svg_relative}")
            validate_svg_render_input(svg_path, handoff, package_manifest)

    browser = find_browser(args.browser)
    renderer_version = browser_version(browser)
    render_deltas: dict[str, float] = {}
    render_jobs: list[tuple[str, Path, Path]] = []
    for svg_path in sorted(svg_root.glob("seller-phone-*.svg")):
        reference = svg_path.name[13:16]
        png_path = find_by_reference(png_root, reference, ".png")
        if png_path is None:
            raise ValueError(f"Binding PNG missing for SVG source: {reference}")
        render_jobs.append((reference, svg_path, png_path))
    with tempfile.TemporaryDirectory(prefix="seller-wave4-svg-render-") as render_temp:
        temp_root = Path(render_temp)
        # Pixel decoding/comparison is CPU-bound. Processes keep the complete
        # 194-screen source verification bounded instead of serializing on the
        # Python GIL while preserving deterministic per-reference results.
        with concurrent.futures.ProcessPoolExecutor(max_workers=max(1, min(args.render_workers, 8))) as executor:
            futures = {
                executor.submit(render_svg_delta, svg_path, png_path, browser, temp_root): reference
                for reference, svg_path, png_path in render_jobs
            }
            for future in concurrent.futures.as_completed(futures):
                reference = futures[future]
                render_deltas[reference] = future.result()

    output_rows: list[dict[str, str]] = []
    svg_count = 0
    for catalog in catalog_rows:
        reference = catalog.get("screen_id") or catalog.get("reference_number") or catalog.get("id")
        if reference is None:
            raise ValueError(f"Catalog reference column not found: {catalog.keys()}")
        reference = reference.zfill(3)
        matrix = matrix_by_id.get(reference)
        if matrix is None:
            raise ValueError(f"Matrix reference missing: {reference}")
        png_path = find_by_reference(png_root, reference, ".png")
        if png_path is None:
            raise ValueError(f"Binding PNG missing: {reference}")
        svg_path = find_by_reference(svg_root, reference, ".svg")
        png_relative = f"source/phone/{png_path.name}"
        png_hash = sha256(png_path)
        if package_manifest.get(png_relative) != png_hash:
            raise ValueError(f"Package manifest PNG hash mismatch: {png_relative}")
        png_width, png_height = png_dimensions(png_path)
        svg_exists = svg_path is not None
        svg_classification = "NONE"
        view_box = width = height = svg_hash = full_svg_path = ""
        if svg_path is not None:
            width, height, view_box = svg_canvas(svg_path)
            svg_classification = "FULL_SCREEN_SVG" if width == "852" and height == "1846" and view_box == "0 0 852 1846" else "OTHER_HELPER"
            svg_count += svg_classification == "FULL_SCREEN_SVG"
            svg_hash = sha256(svg_path)
            full_svg_path = f"source/svg/{svg_path.name}"
            if package_manifest.get(full_svg_path) != svg_hash:
                raise ValueError(f"Package manifest SVG hash mismatch: {full_svg_path}")
        render_delta = render_deltas.get(reference)
        output_rows.append({
            "REFERENCE_ID": reference,
            "PNG_PATH": png_relative,
            "PNG_SHA256": png_hash,
            "PNG_WIDTH": str(png_width),
            "PNG_HEIGHT": str(png_height),
            "FULL_SCREEN_SVG_PATH": full_svg_path,
            "SVG_EXISTS": "YES" if svg_exists else "NO",
            "SVG_CLASSIFICATION": svg_classification,
            "SVG_SHA256": svg_hash,
            "SVG_VIEWBOX": view_box,
            "SVG_WIDTH": width,
            "SVG_HEIGHT": height,
            "MANIFEST_HASH_VERIFIED": "PASS",
            "SVG_RENDERER": renderer_version if svg_exists else "N/A",
            "SVG_TO_PNG_DELTA_PERCENT": f"{render_delta:.6f}" if render_delta is not None else "N/A",
            "SVG_TO_PNG_RESULT": "PASS" if render_delta is not None and render_delta <= SVG_DELTA_THRESHOLD_PERCENT else ("FAIL" if render_delta is not None else "N/A"),
            "DESIGN_TURN/MANIFEST": "BINDING_HANDOFF/PACKAGE_MANIFEST.sha256",
            "CANONICAL_INCLUDED_OR_EXCLUDED": matrix["launch_inclusion_exclusion"],
        })
    if svg_count != 194:
        raise ValueError(f"Expected 194 full-screen SVG sources, found {svg_count}")
    fieldnames = list(output_rows[0])
    lines = ["\t".join(fieldnames)] + ["\t".join(row[field] for field in fieldnames) for row in output_rows]
    source_map_content = "\n".join(lines) + "\n"

    generated: dict[Path, str] = {args.source_map_output: source_map_content}
    for reference in ("001", "055"):
        png_path = find_by_reference(png_root, reference, ".png")
        assert png_path is not None
        generated[args.spec_output_dir / f"{reference}-layout-spec.json"] = json.dumps(png_spec(reference, png_path), ensure_ascii=False, indent=2) + "\n"
    for reference in SVG_SPEC_REFERENCES:
        svg_path = find_by_reference(svg_root, reference, ".svg")
        png_path = find_by_reference(png_root, reference, ".png")
        if svg_path is None or png_path is None:
            raise ValueError(f"Active representative source missing: {reference}")
        spec = extract_svg_spec(reference, svg_path, png_path)
        spec["svg_to_png_verification"] = {
            "renderer": renderer_version,
            "rgb_absolute_difference_sum_threshold": 36,
            "delta_percent": render_deltas[reference],
            "acceptance_threshold_percent": SVG_DELTA_THRESHOLD_PERCENT,
            "result": "PASS" if render_deltas[reference] <= SVG_DELTA_THRESHOLD_PERCENT else "FAIL",
            "package_manifest_hash": "PASS",
        }
        generated[args.spec_output_dir / f"{reference}-layout-spec.json"] = json.dumps(spec, ensure_ascii=False, indent=2) + "\n"

    mismatches: list[Path] = []
    for path, content in generated.items():
        if args.check:
            if not path.exists() or path.read_text(encoding="utf-8") != content:
                mismatches.append(path)
        else:
            write_text(path, content)
    return mismatches


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--handoff-root", type=Path)
    parser.add_argument("--handoff-zip", type=Path)
    parser.add_argument("--browser", type=Path)
    parser.add_argument("--render-workers", type=int, default=8)
    parser.add_argument("--matrix", type=Path, default=Path("docs/seller/wave4/SELLER-WAVE4-CANONICAL-SCREEN-MATRIX.tsv"))
    parser.add_argument("--source-map-output", type=Path, default=Path("docs/seller/wave4/SELLER-WAVE4-SVG-SOURCE-MAP.tsv"))
    parser.add_argument("--spec-output-dir", type=Path, default=Path("docs/seller/wave4/spec"))
    parser.add_argument("--check", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    extraction: tempfile.TemporaryDirectory[str] | None = None
    if args.handoff_root is None:
        handoff_zip = args.handoff_zip or (Path.cwd().parent / DEFAULT_HANDOFF_ZIP)
        if not handoff_zip.is_file():
            raise FileNotFoundError(
                f"Binding handoff not found at {handoff_zip}; pass --handoff-root or --handoff-zip"
            )
        extraction = tempfile.TemporaryDirectory(prefix="seller-wave4-handoff-")
        extraction_root = Path(extraction.name)
        extract_binding_archive(handoff_zip, extraction_root)
        roots = [
            path.parent
            for path in extraction_root.rglob("README_FIRST.md")
            if (path.parent / "docs" / "SCREEN_CATALOG.tsv").is_file()
            and (path.parent / "source" / "phone").is_dir()
        ]
        if len(roots) != 1:
            raise ValueError(f"Expected one extracted binding handoff root, found {len(roots)}")
        args.handoff_root = roots[0]
    try:
        mismatches = generate(args)
    finally:
        if extraction is not None:
            extraction.cleanup()
    if mismatches:
        print("SELLER_WAVE4_SVG_SOURCE_SPEC: FAIL")
        for path in mismatches:
            print(path.as_posix())
        return 1
    print("SELLER_WAVE4_SVG_SOURCE_SPEC: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
