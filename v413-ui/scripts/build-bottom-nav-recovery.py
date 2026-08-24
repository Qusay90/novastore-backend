#!/usr/bin/env python3
"""Build the rejected baseline -> accepted Tur 1 -> V4 PENDING nav evidence.

The accepted target is deliberately limited to the human-approved
``tur1-painted-single-surface-v1-*`` artifact family.  This script does not
read or write production Android sources and never treats earlier radial-only
or diagnostic fixtures as an accepted visual target.
"""

from __future__ import annotations

import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image, ImageFilter, ImageFont, ImageOps, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parent
OUTPUT = ROOT / "06_iteration_history" / "resolved-differences" / "bottom-nav-recovery"
V2_ROOT = WORKSPACE / "android-customer-visual-calibration-v2" / "screens" / "phone_1080x2400"
V4_ROOT = ROOT / "02_phone_1080x2400"
ACCEPTED_ROOT = WORKSPACE / "evidence" / "tur1"
CROP_BOX = (0, 2088, 1080, 2338)

ACCEPTED = {
    "home": {
        "file": "tur1-painted-single-surface-v1-app-home-1080x250.png",
        "sha256": "72cdad8fcdca54c8bf83f9ffdc9096c92b961722c90555522f71491bfb90f200",
    },
    "account": {
        "file": "tur1-painted-single-surface-v1-app-account-1080x250.png",
        "sha256": "26eea63a01101ae083b34e8c6246042c4acd2cc8124c64d279dbd7c2e81dd30c",
    },
}

ACCEPTED_PROVENANCE = {
    "tur1-painted-single-surface-v1-manifest.json":
        "4cc0fd2ea764eff319e08e5f81f4b1466f28dd5c89b09720b0f449defb8e48d1",
    "tur1-painted-single-surface-v1-painted-surface-manifest.json":
        "bce92e4d4e4e9cb7b7c1387bd58bb94ecabe7e58fbf9abc6271a3a6da1dcfa7e",
}

STATES = {
    "home": {"cal": "CAL-02", "label": "Ana Sayfa"},
    "account": {"cal": "CAL-10", "label": "Hesabım"},
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require_file(path: Path) -> None:
    if not path.is_file():
        raise FileNotFoundError(path)


def describe(path: Path) -> dict[str, Any]:
    with Image.open(path) as image:
        width, height = image.size
    return {
        "relativePath": path.resolve().relative_to(ROOT.resolve()).as_posix(),
        "width": width,
        "height": height,
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def save(image: Image.Image, name: str) -> Path:
    path = OUTPUT / name
    image.convert("RGB").save(path, "PNG", compress_level=9, optimize=False)
    return path


def crop_full(path: Path) -> Image.Image:
    require_file(path)
    with Image.open(path) as opened:
        image = ImageOps.exif_transpose(opened).convert("RGB")
        if image.size != (1080, 2400):
            raise ValueError(f"Expected 1080x2400 capture, got {image.size}: {path}")
        return image.crop(CROP_BOX)


def load_accepted(state: str) -> tuple[Image.Image, Path]:
    contract = ACCEPTED[state]
    source = ACCEPTED_ROOT / contract["file"]
    require_file(source)
    actual = sha256(source)
    if actual != contract["sha256"]:
        raise ValueError(f"Accepted {state} artifact hash mismatch: {actual}")
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened).convert("RGB")
        if image.size != (1080, 250):
            raise ValueError(f"Accepted {state} target is not 1080x250: {source}")
        return image.copy(), source


def font(size: int) -> ImageFont.ImageFont:
    for candidate in (Path("C:/Windows/Fonts/seguisb.ttf"), Path("C:/Windows/Fonts/arialbd.ttf")):
        if candidate.is_file():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def annotated_triptych(images: tuple[Image.Image, Image.Image, Image.Image], state_label: str) -> Image.Image:
    board = Image.new("RGB", (3240, 320), (6, 23, 50))
    labels = (
        "V2 — HUMAN REJECTED",
        "ACCEPTED TUR 1 — PAINTED SINGLE SURFACE",
        "V4 — HUMAN DECISION PENDING",
    )
    draw = ImageDraw.Draw(board)
    for index, (image, label) in enumerate(zip(images, labels)):
        x = index * 1080
        board.paste(image, (x, 70))
        draw.text((x + 24, 18), f"{state_label} · {label}", fill=(255, 255, 255), font=font(25))
    return board


def edge_mask(image: Image.Image, threshold: int = 24) -> Image.Image:
    # FIND_EDGES after a light Gaussian blur suppresses isolated raster noise.
    edges = ImageOps.grayscale(image).filter(ImageFilter.GaussianBlur(0.7)).filter(ImageFilter.FIND_EDGES)
    return edges.point(lambda value: 255 if value >= threshold else 0, mode="1").convert("L")


def edge_overlay(accepted: Image.Image, v4: Image.Image) -> Image.Image:
    left = edge_mask(accepted)
    right = edge_mask(v4)
    result = Image.new("RGB", accepted.size, (4, 18, 40))
    left_pixels = left.load()
    right_pixels = right.load()
    pixels = result.load()
    for y in range(result.height):
        for x in range(result.width):
            accepted_edge = left_pixels[x, y] > 0
            v3_edge = right_pixels[x, y] > 0
            if accepted_edge and v3_edge:
                pixels[x, y] = (255, 255, 255)
            elif accepted_edge:
                pixels[x, y] = (0, 218, 255)
            elif v3_edge:
                pixels[x, y] = (255, 95, 38)
    return result


def main() -> int:
    OUTPUT.mkdir(parents=True, exist_ok=True)

    provenance: dict[str, dict[str, Any]] = {}
    for name, expected in ACCEPTED_PROVENANCE.items():
        path = ACCEPTED_ROOT / name
        require_file(path)
        actual = sha256(path)
        if actual != expected:
            raise ValueError(f"Accepted provenance hash mismatch for {name}: {actual}")
        provenance[name] = {
            "absolutePath": str(path.resolve()),
            "bytes": path.stat().st_size,
            "sha256": actual,
        }

    artifact_paths: list[Path] = []
    inputs: dict[str, Any] = {}
    for state, state_contract in STATES.items():
        cal = state_contract["cal"]
        v2_path = V2_ROOT / f"{cal}.png"
        v4_path = V4_ROOT / f"{cal}.png"
        v2 = crop_full(v2_path)
        v4 = crop_full(v4_path)
        accepted, accepted_path = load_accepted(state)

        v2_output = save(v2, f"v2-rejected-{state}-1080x250.png")
        accepted_output = OUTPUT / f"accepted-tur1-{state}-1080x250.png"
        shutil.copyfile(accepted_path, accepted_output)
        v4_output = save(v4, f"v4-pending-{state}-1080x250.png")
        triptych = Image.new("RGB", (3240, 250), (255, 255, 255))
        triptych.paste(v2, (0, 0))
        triptych.paste(accepted, (1080, 0))
        triptych.paste(v4, (2160, 0))
        triptych_output = save(triptych, f"v2-accepted-v4-{state}-side-by-side-3240x250.png")
        annotated_output = save(
            annotated_triptych((v2, accepted, v4), state_contract["label"]),
            f"v2-accepted-v4-{state}-annotated-3240x320.png",
        )
        overlay_output = save(
            Image.blend(accepted, v4, 0.5),
            f"accepted-v4-{state}-overlay-50-1080x250.png",
        )
        accepted_v4 = Image.new("RGB", (2160, 250), (255, 255, 255))
        accepted_v4.paste(accepted, (0, 0))
        accepted_v4.paste(v4, (1080, 0))
        accepted_v4_output = save(
            accepted_v4,
            f"accepted-v4-{state}-side-by-side-2160x250.png",
        )
        edges_output = save(
            edge_overlay(accepted, v4),
            f"accepted-v4-{state}-edge-overlay-1080x250.png",
        )

        artifact_paths.extend(
            (
                v2_output,
                accepted_output,
                v4_output,
                triptych_output,
                annotated_output,
                overlay_output,
                accepted_v4_output,
                edges_output,
            )
        )
        inputs[state] = {
            "v2Rejected": {
                "absolutePath": str(v2_path.resolve()),
                "bytes": v2_path.stat().st_size,
                "sha256": sha256(v2_path),
                "cropBox": list(CROP_BOX),
            },
            "acceptedTur1": {
                "absolutePath": str(accepted_path.resolve()),
                "bytes": accepted_path.stat().st_size,
                "sha256": sha256(accepted_path),
                "authorityFamily": "tur1-painted-single-surface-v1-*",
            },
            "v4Pending": {
                "absolutePath": str(v4_path.resolve()),
                "bytes": v4_path.stat().st_size,
                "sha256": sha256(v4_path),
                "cropBox": list(CROP_BOX),
            },
        }

    manifest = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "decisionContract": {
            "v2HumanVisualDecision": "REJECTED",
            "v2RejectionScope": "CAL-01–CAL-12",
            "v2BottomNav": "VISUAL_REGRESSION",
            "acceptedTarget": "tur1-painted-single-surface-v1-*",
            "v3HumanVisualDecision": "REJECTED",
            "v4HumanVisualDecision": "PENDING",
        },
        "acceptedTargetSafety": {
            "requiredPrefix": "tur1-painted-single-surface-v1-",
            "verifiedProvenance": provenance,
            "rejectedAsAuthority": [
                "tur1-radial-symmetric-*",
                "V1 or V2 generic/radial-only bottom bars",
                "any artifact outside the painted-single-surface-v1 family",
            ],
        },
        "crop": {
            "box": list(CROP_BOX),
            "coordinateConvention": "left, top, rightExclusive, bottomExclusive",
            "resize": "none",
        },
        "edgeOverlay": {
            "input": "accepted Tur 1 and V4 1080x250 RGB crops",
            "method": "grayscale -> GaussianBlur(radius=0.7) -> FIND_EDGES -> threshold >=24",
            "colors": {
                "acceptedOnly": "#00DAFF",
                "v4Only": "#FF5F26",
                "overlap": "#FFFFFF",
                "background": "#041228",
            },
            "masking": "none; the complete 1080x250 crop participates",
        },
        "inputs": inputs,
        "artifacts": [describe(path) for path in artifact_paths],
    }
    manifest_path = OUTPUT / "bottom-nav-recovery-manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Built {len(artifact_paths)} bottom-nav artifacts: {manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
