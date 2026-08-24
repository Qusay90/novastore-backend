from __future__ import annotations

import csv
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageStat


ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "09_machine"
MASKS = OUT / "declared-delta-masks"
NAV_CALS = {"CAL-02", "CAL-03", "CAL-08", "CAL-09", "CAL-10", "CAL-11", "CAL-12"}
EXACT_PIXEL_CALS = {"CAL-01", "CAL-02", "CAL-03", "CAL-08", "CAL-09", "CAL-10", "CAL-11", "CAL-12"}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def describe(path: Path) -> dict[str, object]:
    with Image.open(path) as image:
        width, height = image.size
    return {
        "relativePath": path.relative_to(ROOT).as_posix(),
        "width": width,
        "height": height,
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def clamp_box(box: list[float], expand: int = 0) -> tuple[int, int, int, int]:
    x, y, width, height = box
    return (
        max(0, math.floor(x) - expand),
        max(0, math.floor(y) - expand),
        min(1080, math.ceil(x + width) + expand),
        min(2400, math.ceil(y + height) + expand),
    )


def metrics(source: Image.Image, application: Image.Image, mask: Image.Image) -> dict[str, object]:
    difference = ImageChops.difference(source, application)
    red, green, blue = difference.split()
    maximum = ImageChops.lighter(ImageChops.lighter(red, green), blue)
    histogram = maximum.histogram(mask=mask)
    pixel_count = sum(histogram)
    if pixel_count <= 0:
        raise RuntimeError("Declared-delta mask excluded the complete frame.")
    channel = ImageStat.Stat(difference, mask=mask)
    channel_mean = channel.mean
    channel_rms = channel.rms
    mae = sum(channel_mean) / 3
    rmse = math.sqrt(sum(value * value for value in channel_rms) / 3)
    return {
        "includedPixelCount": pixel_count,
        "excludedPixelCount": 1080 * 2400 - pixel_count,
        "excludedPixelRatio": (1080 * 2400 - pixel_count) / (1080 * 2400),
        "exactPixelRatio": histogram[0] / pixel_count,
        "meanAbsoluteError": mae,
        "meanAbsoluteErrorByChannel": {"red": channel_mean[0], "green": channel_mean[1], "blue": channel_mean[2]},
        "rootMeanSquareError": rmse,
        "maxChannelDifferenceRatios": {
            "gt4": sum(histogram[5:]) / pixel_count,
            "gt8": sum(histogram[9:]) / pixel_count,
            "gt15": sum(histogram[16:]) / pixel_count,
            "gt31": sum(histogram[32:]) / pixel_count,
            "gt63": sum(histogram[64:]) / pixel_count,
            "gt127": sum(histogram[128:]) / pixel_count,
        },
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    MASKS.mkdir(parents=True, exist_ok=True)
    parity = json.loads((ROOT / "04_source_native_parity" / "visual-evidence-manifest.json").read_text(encoding="utf-8"))
    geometry = json.loads((OUT / "v4-geometry-measurements.json").read_text(encoding="utf-8"))
    product_card = json.loads((ROOT / "04_source_native_parity" / "product-card-authority" / "product-card-authority-manifest.json").read_text(encoding="utf-8"))
    phone = {record["calibration"]: record for record in geometry["records"] if record["profile"] == "phone"}
    parity_by_cal = {record["calibration"]: record for record in parity["comparisons"]}
    records: list[dict[str, object]] = []

    for index in range(1, 13):
        calibration = f"CAL-{index:02d}"
        comparison = parity_by_cal[calibration]
        record: dict[str, object] = {
            "calibration": calibration,
            "classification": comparison["sourceContract"]["classification"],
            "unmaskedMetrics": comparison["metrics"],
            "declaredRegions": [],
        }
        if calibration in EXACT_PIXEL_CALS:
            source_path = ROOT / "04_source_native_parity" / comparison["artifacts"]["normalizedSource"]["relativePath"]
            application_path = ROOT / "02_phone_1080x2400" / f"{calibration}.png"
            with Image.open(source_path) as opened:
                source_image = opened.convert("RGB")
            with Image.open(application_path) as opened:
                application_image = opened.convert("RGB")
            if source_image.size != (1080, 2400) or application_image.size != (1080, 2400):
                raise RuntimeError(f"{calibration}: expected 1080x2400 inputs")
            mask = Image.new("L", (1080, 2400), 255)
            draw = ImageDraw.Draw(mask)
            declared: list[dict[str, object]] = []
            measurements = phone[calibration]["measurements"]
            if calibration == "CAL-01" and measurements.get("logo"):
                box = clamp_box(measurements["logo"], 8)
                draw.rectangle(box, fill=0)
                declared.append({"kind": "OFFICIAL_LOGO_AUTHORITY_DELTA", "boxLTRB": list(box)})
            if calibration in NAV_CALS and measurements.get("nav"):
                box = clamp_box(measurements["nav"], 14)
                draw.rectangle(box, fill=0)
                declared.append({"kind": "ACCEPTED_TUR1_SIX_TAB_NAV_DELTA", "boxLTRB": list(box)})
            if calibration in {"CAL-11", "CAL-12"} and measurements.get("bot"):
                box = clamp_box(measurements["bot"], 8)
                draw.rectangle(box, fill=0)
                declared.append({"kind": "OFFICIAL_NOVABOT_ASSET_DELTA", "boxLTRB": list(box)})
            mask_path = MASKS / f"{calibration.lower()}-declared-delta-mask-1080x2400.png"
            mask.save(mask_path, "PNG", optimize=True)
            record["declaredRegions"] = declared
            record["declaredDeltaAwareMode"] = "LOCAL_EXCLUSION_MASK"
            record["declaredDeltaAwareMetrics"] = metrics(source_image, application_image, mask)
            record["mask"] = describe(mask_path)
        elif calibration == "CAL-06":
            record["declaredRegions"] = [{"kind": "OWNER_APPROVED_BRAND_PALETTE_DELTA", "scope": "color only; geometry is not masked"}]
            record["declaredDeltaAwareMode"] = "GEOMETRY_ONLY_NO_FULL_FRAME_COLOR_MASK"
            record["declaredDeltaAwareMetrics"] = {
                "bboxMatchPercent": phone[calibration]["bboxMatchPercent"],
                "anchorComparisons": phone[calibration]["comparisons"],
                "note": "The owner rejected SRC-13 purple. Unmasked pixel metrics are reported separately; palette pixels are not presented as an acceptance gate.",
            }
        elif calibration == "CAL-04":
            record["declaredDeltaAwareMode"] = "EXACT_COMPONENT_AUTHORITY_ONLY"
            record["declaredDeltaAwareMetrics"] = product_card["metrics"]
            record["componentManifest"] = "04_source_native_parity/product-card-authority/product-card-authority-manifest.json"
        else:
            record["declaredDeltaAwareMode"] = "NOT_APPLICABLE_NO_EXACT_FULL_SCREEN_REFERENCE"
            record["declaredDeltaAwareMetrics"] = None
        records.append(record)

    output = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "status": "PASS — UNMASKED AND DECLARED-DELTA-AWARE METRICS REPORTED SEPARATELY",
        "humanDecisions": {"v2": "REJECTED", "v3": "REJECTED", "v4": "PENDING"},
        "maskRule": "Only the local official-logo, official-NovaBot, and accepted-six-tab-nav rectangles are excluded. No full screen or broad layout region is masked.",
        "pixelFormula": "RGB absolute difference; MAE is the mean of absolute R/G/B deltas; max-channel threshold ratios use D=max(|Rs-Ra|,|Gs-Ga|,|Bs-Ba|).",
        "records": records,
    }
    output_path = OUT / "v4-declared-delta-metrics.json"
    output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    csv_path = OUT / "v4-declared-delta-metrics.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(["calibration", "classification", "mode", "unmasked_mae", "aware_mae", "unmasked_gt15", "aware_gt15", "excluded_pixel_ratio", "bbox_match_percent"])
        for record in records:
            unmasked = record["unmaskedMetrics"]
            aware = record["declaredDeltaAwareMetrics"] or {}
            writer.writerow([
                record["calibration"], record["classification"], record["declaredDeltaAwareMode"],
                unmasked.get("meanAbsoluteError", "NOT_APPLICABLE"),
                aware.get("meanAbsoluteError", "NOT_APPLICABLE"),
                unmasked.get("maxChannelDifferenceRatios", {}).get("gt15", "NOT_APPLICABLE"),
                aware.get("maxChannelDifferenceRatios", {}).get("gt15", "NOT_APPLICABLE"),
                aware.get("excludedPixelRatio", "NOT_APPLICABLE"),
                phone[record["calibration"]]["bboxMatchPercent"],
            ])
    print(f"Built declared-delta evidence for {len(records)} screens: {output_path}")


if __name__ == "__main__":
    main()
