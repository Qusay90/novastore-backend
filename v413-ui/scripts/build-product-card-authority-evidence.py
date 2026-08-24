#!/usr/bin/env python3
"""Build the CAL-04 product-card component authority evidence package.

This routine is intentionally separate from full-screen parity. SRC-09 is the
detailed Home/Favorites product-card authority, SRC-12 supplies the compact
top-left Favorites cross-check, and the final CAL-04 phone capture supplies the
integrated card. SRC-09 is never used as a CAL-06/PDP source.
"""

from __future__ import annotations

import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont, ImageOps, ImageStat


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "04_source_native_parity" / "product-card-authority"
SOURCE_DETAILED = ROOT / "00_sources" / "SRC-09__ürün kartı tasarımı.png"
SOURCE_COMPACT = ROOT / "00_sources" / "SRC-12__favori kısmı.png"
INTEGRATED = ROOT / "02_phone_1080x2400" / "CAL-04.png"
CAPTURE_MANIFEST = ROOT / "02_phone_1080x2400" / "capture-manifest.json"
CARD_MEASUREMENT = ROOT / "01_measurements" / "product-card-authority-measurement.json"

EXPECTED_SOURCE_SHA256 = {
    SOURCE_DETAILED: "ec00daa543fc8f0a11659ee545d018dec5288f4b81d9650aa830e374a6f63b7f",
    SOURCE_COMPACT: "31c891bdc7685e983be0fdad2bc67ff3b1379446e3641d6ffd9ef82f877a7b04",
}

# Native source coordinates measured from the binding rasters. Pillow crop
# boxes are left/top inclusive and right/bottom exclusive.
SOURCE_DETAILED_BOX = (39, 200, 811, 1667)
SOURCE_COMPACT_BOX = (49, 359, 407, 984)
CANVAS = (720, 1260)
HEATMAP_BANDS = (
    (0, 0, (0, 0, 0)),
    (1, 7, (0, 32, 128)),
    (8, 15, (0, 190, 255)),
    (16, 31, (0, 220, 120)),
    (32, 63, (255, 225, 0)),
    (64, 127, (255, 112, 0)),
    (128, 255, (255, 0, 48)),
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def describe(path: Path) -> dict[str, Any]:
    record: dict[str, Any] = {
        "relativePath": path.resolve().relative_to(ROOT.resolve()).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }
    if path.suffix.lower() in {".png", ".jpg", ".jpeg"}:
        with Image.open(path) as image:
            record.update({"width": image.width, "height": image.height})
    return record


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def parse_box(value: str) -> tuple[tuple[float, float, float, float], tuple[int, int, int, int]]:
    values = tuple(float(item) for item in value.split(";"))
    require(len(values) == 4, f"Expected x;y;w;h, received {value!r}")
    x, y, width, height = values
    require(width > 0 and height > 0, f"Invalid card box: {value!r}")
    left = math.floor(x)
    top = math.floor(y)
    right = math.ceil(x + width)
    bottom = math.ceil(y + height)
    return values, (left, top, right, bottom)


def integrated_card_box(capture_record: dict[str, Any]) -> tuple[tuple[float, float, float, float], tuple[int, int, int, int], str]:
    measurement = capture_record.get("componentMeasurements", {}).get("productCardFirst", {})
    values = measurement.get("boundingBoxXywh")
    if isinstance(values, list) and len(values) == 4:
        measured, integer = parse_box(";".join(str(value) for value in values))
        return measured, integer, "02_phone_1080x2400/capture-manifest.json CAL-04 componentMeasurements.productCardFirst.boundingBoxXywh"

    require(CARD_MEASUREMENT.is_file(), "CAL-04 capture manifest lacks the product-card DOM box and no frozen measurement fallback exists")
    fallback = json.loads(CARD_MEASUREMENT.read_text(encoding="utf-8"))
    require(fallback.get("status", "").startswith("PASS"), "Frozen CAL-04 product-card measurement is not PASS")
    require(fallback["capture"]["sha256"] == capture_record["sha256"], "Frozen CAL-04 product-card measurement belongs to another capture")
    values = fallback["productCardFirst"]["boundingBoxXywh"]
    measured, integer = parse_box(";".join(str(value) for value in values))
    require(list(integer) == fallback["productCardFirst"]["integerCropBoxLTRB"], "Frozen product-card integer crop contract drift")
    return measured, integer, "01_measurements/product-card-authority-measurement.json productCardFirst.boundingBoxXywh"


def load_crop(path: Path, box: tuple[int, int, int, int]) -> Image.Image:
    with Image.open(path) as opened:
        image = ImageOps.exif_transpose(opened).convert("RGB")
    require(box[0] >= 0 and box[1] >= 0 and box[2] <= image.width and box[3] <= image.height, f"Crop outside {path}: {box}")
    return image.crop(box)


def sampled_background(image: Image.Image) -> tuple[int, int, int]:
    sample = max(1, min(image.size) // 24)
    corners = Image.new("RGB", (sample * 4, sample))
    boxes = (
        (0, 0, sample, sample),
        (image.width - sample, 0, image.width, sample),
        (0, image.height - sample, sample, image.height),
        (image.width - sample, image.height - sample, image.width, image.height),
    )
    for index, box in enumerate(boxes):
        corners.paste(image.crop(box), (sample * index, 0))
    return tuple(round(value) for value in ImageStat.Stat(corners).mean)


def contain(image: Image.Image) -> tuple[Image.Image, dict[str, Any]]:
    scale = min(CANVAS[0] / image.width, CANVAS[1] / image.height)
    scaled_size = (round(image.width * scale), round(image.height * scale))
    scaled = image.resize(scaled_size, Image.Resampling.LANCZOS)
    offset = ((CANVAS[0] - scaled.width) // 2, (CANVAS[1] - scaled.height) // 2)
    canvas = Image.new("RGB", CANVAS, sampled_background(image))
    canvas.paste(scaled, offset)
    return canvas, {
        "method": "ASPECT_PRESERVING_CONTAIN",
        "sourceSize": {"width": image.width, "height": image.height},
        "targetSize": {"width": CANVAS[0], "height": CANVAS[1]},
        "uniformScale": scale,
        "scaledSize": {"width": scaled.width, "height": scaled.height},
        "placementOffset": {"x": offset[0], "y": offset[1]},
        "nonUniformResize": False,
        "resampling": "Pillow.Image.Resampling.LANCZOS",
    }


def save(image: Image.Image, name: str) -> dict[str, Any]:
    path = OUT / name
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", compress_level=9, optimize=False)
    return describe(path)


def max_channel(diff: Image.Image) -> Image.Image:
    red, green, blue = diff.split()
    return ImageChops.lighter(ImageChops.lighter(red, green), blue)


def heatmap(maximum: Image.Image) -> Image.Image:
    lookups = [[0] * 256 for _ in range(3)]
    for start, end, color in HEATMAP_BANDS:
        for value in range(start, end + 1):
            for channel in range(3):
                lookups[channel][value] = color[channel]
    return Image.merge("RGB", tuple(maximum.point(lookup) for lookup in lookups))


def threshold_ratio(maximum: Image.Image, threshold: int) -> float:
    histogram = maximum.histogram()
    return sum(histogram[threshold + 1 :]) / (maximum.width * maximum.height)


def metrics(diff: Image.Image) -> dict[str, Any]:
    statistics = ImageStat.Stat(diff)
    maximum = max_channel(diff)
    histogram = maximum.histogram()
    pixel_count = maximum.width * maximum.height
    return {
        "pixelCount": pixel_count,
        "exactPixelRatio": histogram[0] / pixel_count,
        "meanAbsoluteError": sum(statistics.mean) / 3,
        "maxAbsoluteChannelDifference": max(extrema[1] for extrema in statistics.extrema),
        "maxChannelDifferenceRatios": {
            "gt4": threshold_ratio(maximum, 4),
            "gt8": threshold_ratio(maximum, 8),
            "gt15": threshold_ratio(maximum, 15),
            "gt31": threshold_ratio(maximum, 31),
            "gt63": threshold_ratio(maximum, 63),
            "gt127": threshold_ratio(maximum, 127),
        },
        "acceptanceUse": "DIAGNOSTIC_ONLY_HUMAN_VISUAL_DECISION_PENDING",
    }


def edge_mask(image: Image.Image) -> Image.Image:
    edges = ImageOps.grayscale(image).filter(ImageFilter.FIND_EDGES)
    return edges.point(lambda value: 255 if value >= 28 else 0, mode="1")


def edge_overlay(source: Image.Image, integrated: Image.Image) -> Image.Image:
    left = edge_mask(source)
    right = edge_mask(integrated)
    overlap = ImageChops.logical_and(left, right)
    source_only = ImageChops.subtract(left.convert("L"), overlap.convert("L"))
    integrated_only = ImageChops.subtract(right.convert("L"), overlap.convert("L"))
    canvas = Image.new("RGB", CANVAS, (5, 17, 39))
    canvas.paste((255, 72, 72), mask=source_only)
    canvas.paste((0, 220, 255), mask=integrated_only)
    canvas.paste((255, 255, 255), mask=overlap)
    return canvas


def font(size: int, semibold: bool = False) -> ImageFont.ImageFont:
    path = ROOT / "public" / "calibration-assets" / "official" / "fonts" / ("inter_semibold.ttf" if semibold else "inter_regular.ttf")
    try:
        return ImageFont.truetype(str(path), size=size)
    except OSError:
        return ImageFont.load_default()


def panel(image: Image.Image, title: str, detail: str) -> Image.Image:
    header = 66
    canvas = Image.new("RGB", (CANVAS[0], CANVAS[1] + header), (5, 24, 53))
    draw = ImageDraw.Draw(canvas)
    draw.text((22, 10), title, fill=(250, 252, 255), font=font(23, True))
    draw.text((22, 38), detail, fill=(188, 202, 222), font=font(15))
    canvas.paste(image, (0, header))
    return canvas


def main() -> None:
    for path, expected in EXPECTED_SOURCE_SHA256.items():
        require(path.is_file(), f"Source missing: {path}")
        require(sha256(path) == expected, f"Binding source hash changed: {path}")
    require(INTEGRATED.is_file(), f"Integrated CAL-04 capture missing: {INTEGRATED}")

    capture_manifest = json.loads(CAPTURE_MANIFEST.read_text(encoding="utf-8"))
    capture_record = next((entry for entry in capture_manifest.get("files", []) if entry.get("calibration") == "CAL-04"), None)
    require(capture_record is not None, "CAL-04 capture manifest record missing")
    require(capture_record["sha256"] == sha256(INTEGRATED), "CAL-04 capture is stale relative to capture manifest")

    measured_box, integrated_box, measurement_source = integrated_card_box(capture_record)
    detailed_crop = load_crop(SOURCE_DETAILED, SOURCE_DETAILED_BOX)
    compact_crop = load_crop(SOURCE_COMPACT, SOURCE_COMPACT_BOX)
    integrated_crop = load_crop(INTEGRATED, integrated_box)

    detailed_normalized, detailed_normalization = contain(detailed_crop)
    compact_normalized, compact_normalization = contain(compact_crop)
    integrated_normalized, integrated_normalization = contain(integrated_crop)

    difference = ImageChops.difference(compact_normalized, integrated_normalized)
    maximum = max_channel(difference)
    overlay = Image.blend(compact_normalized, integrated_normalized, 0.5)
    difference_heatmap = heatmap(maximum)
    edges = edge_overlay(compact_normalized, integrated_normalized)

    side_by_side = Image.new("RGB", (CANVAS[0] * 2, CANVAS[1]), (255, 255, 255))
    side_by_side.paste(compact_normalized, (0, 0))
    side_by_side.paste(integrated_normalized, (CANVAS[0], 0))

    three_way = Image.new("RGB", (CANVAS[0] * 3, CANVAS[1] + 66), (5, 24, 53))
    three_way.paste(panel(detailed_normalized, "SRC-09 — ayrıntılı kart", "Home/Favoriler component authority"), (0, 0))
    three_way.paste(panel(compact_normalized, "SRC-12 — sol üst kart", "compact/grid cross-check"), (CANVAS[0], 0))
    three_way.paste(panel(integrated_normalized, "V4 CAL-04 — ilk kart", "final capture + measured DOM bbox"), (CANVAS[0] * 2, 0))

    artifacts = {
        "sourceDetailedNativeCrop": save(detailed_crop, "source-detailed-card-native-crop.png"),
        "sourceCompactNativeCrop": save(compact_crop, "source-favorites-top-left-native-crop.png"),
        "integratedNativeCrop": save(integrated_crop, "integrated-cal-04-first-card-native-crop.png"),
        "sourceDetailedNormalized": save(detailed_normalized, "source-detailed-card-normalized-720x1260.png"),
        "sourceCompactNormalized": save(compact_normalized, "source-favorites-top-left-normalized-720x1260.png"),
        "integratedNormalized": save(integrated_normalized, "integrated-cal-04-first-card-normalized-720x1260.png"),
        "sideBySide": save(side_by_side, "compact-source-v4-side-by-side-1440x1260.png"),
        "overlay50": save(overlay, "compact-source-v4-overlay-50-720x1260.png"),
        "absoluteDifference": save(difference, "compact-source-v4-absolute-diff-720x1260.png"),
        "heatmap": save(difference_heatmap, "compact-source-v4-heatmap-720x1260.png"),
        "edgeOverlay": save(edges, "compact-source-v4-edge-overlay-720x1260.png"),
        "threeWayAuthorityBoard": save(three_way, "product-card-authority-three-way-2160x1326.png"),
    }

    manifest = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "status": "COMPLETE — HUMAN VISUAL DECISION PENDING",
        "humanVisualDecision": "PENDING",
        "authorityContract": {
            "screen": "CAL-04",
            "classification": "PARTIAL_REFERENCE_WITH_EXACT_PRODUCT_CARD_COMPONENT_AUTHORITY",
            "detailedComponentAuthority": "SRC-09",
            "compactCrossCheckAuthority": "SRC-12 top-left product card",
            "integratedSubject": "CAL-04 first product card",
            "explicitExclusion": "SRC-09 is not a Product Detail/PDP source and is not mapped to CAL-06",
            "cal06Authority": "SRC-13 exact geometry/IA/composition with owner-approved NovaStore brand palette delta",
        },
        "brandPaletteContract": {
            "purpleFromSRC13Authoritative": False,
            "authoritativePalette": "NovaStore navy/orange/warm-neutral from the current accepted product-card language",
        },
        "inputs": {
            "sourceDetailed": describe(SOURCE_DETAILED),
            "sourceCompact": describe(SOURCE_COMPACT),
            "integratedCal04": describe(INTEGRATED),
            "captureManifest": describe(CAPTURE_MANIFEST),
            "productCardMeasurement": describe(CARD_MEASUREMENT),
        },
        "cropContract": {
            "sourceDetailed": {"nativeBoxLTRB": list(SOURCE_DETAILED_BOX)},
            "sourceCompact": {"nativeBoxLTRB": list(SOURCE_COMPACT_BOX)},
            "integratedCal04": {
                "measuredXywh": list(measured_box),
                "integerBoxLTRB": list(integrated_box),
                "measurementSource": measurement_source,
            },
        },
        "normalization": {
            "sourceDetailed": detailed_normalization,
            "sourceCompact": compact_normalization,
            "integratedCal04": integrated_normalization,
        },
        "differenceFormula": {
            "absoluteRgb": "(|Rs-Ri|, |Gs-Gi|, |Bs-Bi|)",
            "heatmapScalar": "D=max(|Rs-Ri|, |Gs-Gi|, |Bs-Bi|)",
            "masking": "none; every pixel in the normalized component canvas is included",
            "bands": [{"minimum": start, "maximum": end, "rgb": list(color)} for start, end, color in HEATMAP_BANDS],
            "edgeOverlay": "source-only red; integrated-only cyan; overlapping thresholded edges white",
        },
        "metrics": metrics(difference),
        "artifacts": artifacts,
    }
    manifest_path = OUT / "product-card-authority-manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUT / "README.md").write_text(
        "# Ürün kartı kaynak otoritesi\n\n"
        "Bu kanıt CAL-04 içindeki ürün kartı alt bileşenine aittir; full-screen PLP veya PDP pixel-parity kapısı değildir. "
        "`SRC-09` ayrıntılı Home/Favoriler ürün kartı otoritesidir, `SRC-12` sol üst kartı compact/grid çapraz doğrulamasıdır. "
        "CAL-06 Ürün Detayı için kullanılmaz; CAL-06 kaynağı `SRC-13`'tür.\n\n"
        "Compact source ve final CAL-04 kartı aspect-preserving `720×1260` tuvale normalize edilir. Side-by-side, %50 overlay, "
        "maskesiz absolute diff/heatmap ve edge overlay yalnız tanısaldır; insan görsel kararının yerine geçmez.\n",
        encoding="utf-8",
    )
    print(f"Built product-card authority package: {manifest_path}")


if __name__ == "__main__":
    main()
