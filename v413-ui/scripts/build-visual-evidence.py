#!/usr/bin/env python3
"""Build deterministic visual-parity evidence from source and integrated PNGs.

Pillow is intentionally the only required third-party import. If NumPy and
scikit-image are already available, the report also contains windowed SSIM;
the script never installs or changes dependencies.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageOps, ImageStat
except ImportError as exc:  # pragma: no cover - environment-specific failure path
    raise SystemExit(
        "Pillow is required for visual evidence generation and is not installed in this runtime. "
        "No package installation was attempted."
    ) from exc


CALIBRATIONS = tuple(f"CAL-{index:02d}" for index in range(1, 13))
DEFAULT_SOURCE_MAP = {
    "CAL-01": "SRC-03__Giriş, kayıt ve şifre sıfırlama.png",
    "CAL-02": "SRC-01__Anasayfa teması.png",
    "CAL-03": "SRC-05__kategoriler kısmı.jpg",
    "CAL-04": "SRC-02__arama kısmı 2.png",
    "CAL-05": "SRC-02__arama kısmı 2.png",
    "CAL-06": "SRC-13__ürün-detayı-bağlayıcı.png",
    "CAL-07": "SRC-07__ödeme ekranı.png",
    "CAL-08": "SRC-07__ödeme ekranı.png",
    "CAL-09": "SRC-08__Sipariş detayı.png",
    "CAL-10": "SRC-04__hesabım kısmı.png",
    "CAL-11": "SRC-10__Yardım, NovaBot, canlı destek ve SSS.png",
    "CAL-12": "SRC-06__NovaBot sohbet.png",
}
SOURCE_CONTRACT = {
    "CAL-01": ("SRC-03", "EXACT_REFERENCE", "NONE", "GENERATED_DIAGNOSTIC_HUMAN_PENDING"),
    "CAL-02": ("SRC-01", "EXACT_REFERENCE", "REPORT_ACCEPTED_SIX_TAB_SHELL_SEPARATELY", "GENERATED_DIAGNOSTIC_HUMAN_PENDING"),
    "CAL-03": ("SRC-05", "EXACT_REFERENCE", "REPORT_ACCEPTED_SIX_TAB_SHELL_SEPARATELY", "GENERATED_DIAGNOSTIC_HUMAN_PENDING"),
    "CAL-04": ("SRC-02", "PARTIAL_REFERENCE", "PARTIAL_FULL_SCREEN_WITH_EXACT_PRODUCT_CARD_COMPONENT_EVIDENCE", "GENERATED_REFERENCE_FAMILY_DIAGNOSTIC"),
    "CAL-05": ("SRC-02", "INFERRED_PROTOTYPE", "INFERRED_FILTER_NO_EXACT_GATE", "GENERATED_REFERENCE_FAMILY_DIAGNOSTIC"),
    "CAL-06": ("SRC-13", "EXACT_GEOMETRY_WITH_BRAND_PALETTE_DELTA", "GEOMETRY_IA_COMPOSITION_EXACT_BRAND_PALETTE_DELTA_NO_COLOR_PIXEL_GATE", "GENERATED_GEOMETRY_DIAGNOSTIC_HUMAN_PENDING"),
    "CAL-07": ("SRC-07", "INFERRED_PROTOTYPE", "INFERRED_CART_NO_EXACT_GATE", "GENERATED_REFERENCE_FAMILY_DIAGNOSTIC"),
    "CAL-08": ("SRC-07", "EXACT_REFERENCE", "NAV_VISIBLE_CART_SELECTED_NO_HIDE", "GENERATED_DIAGNOSTIC_HUMAN_PENDING"),
    "CAL-09": ("SRC-08", "EXACT_REFERENCE", "REPORT_ACCEPTED_SIX_TAB_SHELL_SEPARATELY", "GENERATED_DIAGNOSTIC_HUMAN_PENDING"),
    "CAL-10": ("SRC-04", "EXACT_REFERENCE", "REPORT_ACCEPTED_SIX_TAB_SHELL_SEPARATELY", "GENERATED_DIAGNOSTIC_HUMAN_PENDING"),
    "CAL-11": ("SRC-10", "EXACT_VISUAL_WITH_ROUTE_DELTA", "EXACT_VISUAL_WITH_ROUTE_AND_OFFICIAL_ASSET_DELTA", "GENERATED_DIAGNOSTIC_HUMAN_PENDING"),
    "CAL-12": ("SRC-06", "EXACT_SHELL_WITH_REQUIRED_RICH_STATE", "INITIAL_SHELL_WITH_REQUIRED_RICH_STATE_DELTA", "GENERATED_DIAGNOSTIC_HUMAN_PENDING"),
}
HEATMAP_BANDS = (
    (0, 0, (0, 0, 0)),
    (1, 7, (0, 32, 128)),
    (8, 15, (0, 190, 255)),
    (16, 31, (0, 220, 120)),
    (32, 63, (255, 225, 0)),
    (64, 127, (255, 112, 0)),
    (128, 255, (255, 0, 48)),
)


@dataclass(frozen=True)
class Artifact:
    path: Path
    width: int
    height: int
    size: int
    sha256: str

    def json(self, root: Path) -> dict[str, Any]:
        return {
            "relativePath": self.path.resolve().relative_to(root.resolve()).as_posix(),
            "width": self.width,
            "height": self.height,
            "bytes": self.size,
            "sha256": self.sha256,
        }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source-dir",
        type=Path,
        default=Path("00_sources"),
        help="Directory containing source screenshots (default: %(default)s)",
    )
    parser.add_argument(
        "--integrated-dir",
        type=Path,
        default=Path("02_phone_1080x2400"),
        help="Directory containing CAL-XX.png integrated captures (default: %(default)s)",
    )
    parser.add_argument(
        "--output-root",
        type=Path,
        default=Path("04_source_native_parity"),
        help="Output root for comparisons (default: %(default)s)",
    )
    parser.add_argument(
        "--mapping",
        type=Path,
        help="Optional JSON object mapping CAL-XX to a source filename",
    )
    parser.add_argument(
        "--cal",
        help="Optional comma-separated CAL ids; defaults to every mapped calibration",
    )
    parser.add_argument(
        "--source-fit",
        choices=("width-fit", "contain", "cover"),
        default="width-fit",
        help="Aspect-preserving source normalization method (default: %(default)s)",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Fail instead of recording a skip when a mapped source or integrated capture is missing",
    )
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def describe(path: Path) -> Artifact:
    with Image.open(path) as image:
        width, height = image.size
    return Artifact(path=path, width=width, height=height, size=path.stat().st_size, sha256=sha256_file(path))


def load_mapping(path: Path | None) -> dict[str, str]:
    mapping = dict(DEFAULT_SOURCE_MAP)
    if path is None:
        return mapping
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or not all(isinstance(key, str) and isinstance(value, str) for key, value in payload.items()):
        raise ValueError("--mapping must contain one JSON object of string CAL ids to string filenames")
    mapping.update({key.upper(): value for key, value in payload.items()})
    return mapping


def sampled_background(image: Image.Image) -> tuple[int, int, int]:
    rgb = image.convert("RGB")
    width, height = rgb.size
    sample = max(1, min(width, height) // 32)
    corners = Image.new("RGB", (sample * 4, sample))
    boxes = (
        (0, 0, sample, sample),
        (width - sample, 0, width, sample),
        (0, height - sample, sample, height),
        (width - sample, height - sample, width, height),
    )
    for index, box in enumerate(boxes):
        corners.paste(rgb.crop(box), (sample * index, 0))
    means = ImageStat.Stat(corners).mean
    return tuple(round(value) for value in means)


def normalize_source(
    source: Image.Image,
    target_size: tuple[int, int],
    method: str,
) -> tuple[Image.Image, dict[str, Any]]:
    source = ImageOps.exif_transpose(source).convert("RGB")
    source_width, source_height = source.size
    target_width, target_height = target_size
    background = sampled_background(source)

    if method == "width-fit":
        scale = target_width / source_width
    elif method == "contain":
        scale = min(target_width / source_width, target_height / source_height)
    else:
        scale = max(target_width / source_width, target_height / source_height)

    scaled_size = (max(1, round(source_width * scale)), max(1, round(source_height * scale)))
    scaled = source.resize(scaled_size, Image.Resampling.LANCZOS)
    offset_x = (target_width - scaled_size[0]) // 2
    offset_y = (target_height - scaled_size[1]) // 2

    canvas = Image.new("RGB", target_size, background)
    if offset_x >= 0 and offset_y >= 0:
        canvas.paste(scaled, (offset_x, offset_y))
    else:
        crop_left = max(0, -offset_x)
        crop_top = max(0, -offset_y)
        crop_right = crop_left + min(target_width, scaled_size[0])
        crop_bottom = crop_top + min(target_height, scaled_size[1])
        cropped = scaled.crop((crop_left, crop_top, crop_right, crop_bottom))
        canvas.paste(cropped, (max(0, offset_x), max(0, offset_y)))

    operation = {
        "method": method,
        "originalSize": {"width": source_width, "height": source_height},
        "targetSize": {"width": target_width, "height": target_height},
        "uniformScale": scale,
        "scaledSize": {"width": scaled_size[0], "height": scaled_size[1]},
        "placementOffset": {"x": offset_x, "y": offset_y},
        "paddingColorRgb": list(background),
        "resampling": "Pillow.Image.Resampling.LANCZOS",
        "nonUniformResize": False,
    }
    return canvas, operation


def max_channel_image(diff: Image.Image) -> Image.Image:
    red, green, blue = diff.convert("RGB").split()
    return ImageChops.lighter(ImageChops.lighter(red, green), blue)


def threshold_ratio(maximum_channel: Image.Image, threshold: int) -> float:
    histogram = maximum_channel.histogram()
    total = maximum_channel.width * maximum_channel.height
    return sum(histogram[threshold + 1 :]) / total


def global_ssim(reference: Image.Image, candidate: Image.Image) -> float:
    reference_bytes = ImageOps.grayscale(reference).tobytes()
    candidate_bytes = ImageOps.grayscale(candidate).tobytes()
    count = len(reference_bytes)
    mean_reference = sum(reference_bytes) / count
    mean_candidate = sum(candidate_bytes) / count
    variance_reference = sum((value - mean_reference) ** 2 for value in reference_bytes) / max(1, count - 1)
    variance_candidate = sum((value - mean_candidate) ** 2 for value in candidate_bytes) / max(1, count - 1)
    covariance = sum(
        (left - mean_reference) * (right - mean_candidate)
        for left, right in zip(reference_bytes, candidate_bytes)
    ) / max(1, count - 1)
    constant_1 = (0.01 * 255) ** 2
    constant_2 = (0.03 * 255) ** 2
    numerator = (2 * mean_reference * mean_candidate + constant_1) * (2 * covariance + constant_2)
    denominator = (mean_reference**2 + mean_candidate**2 + constant_1) * (
        variance_reference + variance_candidate + constant_2
    )
    return numerator / denominator if denominator else 1.0


def windowed_ssim(reference: Image.Image, candidate: Image.Image) -> tuple[float | None, str]:
    try:
        import numpy as np  # type: ignore
        from skimage.metrics import structural_similarity  # type: ignore
    except ImportError:
        return None, "unavailable: NumPy and/or scikit-image not present; no installation attempted"

    left = np.asarray(ImageOps.grayscale(reference), dtype=np.uint8)
    right = np.asarray(ImageOps.grayscale(candidate), dtype=np.uint8)
    score = structural_similarity(left, right, data_range=255)
    return float(score), "scikit-image grayscale windowed SSIM"


def compute_metrics(reference: Image.Image, candidate: Image.Image, diff: Image.Image) -> dict[str, Any]:
    statistics = ImageStat.Stat(diff)
    mean_absolute_channels = statistics.mean
    rms_channels = statistics.rms
    maximum_channel = max_channel_image(diff)
    histogram = maximum_channel.histogram()
    total = reference.width * reference.height
    equal_ratio = histogram[0] / total
    mean_absolute_error = sum(mean_absolute_channels) / 3
    root_mean_square_error = math.sqrt(sum(value**2 for value in rms_channels) / 3)
    psnr = None if root_mean_square_error == 0 else 20 * math.log10(255 / root_mean_square_error)
    ssim, ssim_status = windowed_ssim(reference, candidate)

    return {
        "pixelCount": total,
        "exactPixelRatio": equal_ratio,
        "meanAbsoluteError": mean_absolute_error,
        "meanAbsoluteErrorByChannel": {
            "red": mean_absolute_channels[0],
            "green": mean_absolute_channels[1],
            "blue": mean_absolute_channels[2],
        },
        "rootMeanSquareError": root_mean_square_error,
        "maxAbsoluteChannelDifference": max(extrema[1] for extrema in statistics.extrema),
        "maxChannelDifferenceRatios": {
            "gt4": threshold_ratio(maximum_channel, 4),
            "gt8": threshold_ratio(maximum_channel, 8),
            "gt15": threshold_ratio(maximum_channel, 15),
            "gt31": threshold_ratio(maximum_channel, 31),
            "gt63": threshold_ratio(maximum_channel, 63),
            "gt127": threshold_ratio(maximum_channel, 127),
        },
        "psnrDb": psnr,
        "ssim": ssim,
        "ssimStatus": ssim_status,
        "ssimGlobalFallback": global_ssim(reference, candidate),
        "ssimGlobalFallbackNote": "single-window luminance SSIM; reported separately from windowed SSIM",
    }


def heatmap(maximum_channel: Image.Image) -> Image.Image:
    red_lookup = [0] * 256
    green_lookup = [0] * 256
    blue_lookup = [0] * 256
    for start, end, color in HEATMAP_BANDS:
        for value in range(start, end + 1):
            red_lookup[value], green_lookup[value], blue_lookup[value] = color
    return Image.merge(
        "RGB",
        (
            maximum_channel.point(red_lookup),
            maximum_channel.point(green_lookup),
            maximum_channel.point(blue_lookup),
        ),
    )


def font_for(size: int) -> ImageFont.ImageFont:
    candidates = (
        Path("public/calibration-assets/official/fonts/inter_medium.ttf"),
        Path("C:/Windows/Fonts/arial.ttf"),
    )
    for candidate in candidates:
        if candidate.is_file():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def caption(image: Image.Image, title: str) -> Image.Image:
    result = image.copy()
    overlay = Image.new("RGBA", (result.width, 64), (4, 18, 40, 220))
    result.paste(overlay.convert("RGB"), (0, 0))
    ImageDraw.Draw(result).text((24, 15), title, fill=(255, 255, 255), font=font_for(28))
    return result


def metrics_panel(size: tuple[int, int], calibration: str, metrics: dict[str, Any]) -> Image.Image:
    panel = Image.new("RGB", size, (5, 17, 39))
    draw = ImageDraw.Draw(panel)
    title_font = font_for(42)
    body_font = font_for(27)
    lines = (
        calibration,
        "UNMASKED FULL-FRAME METRICS",
        f"Exact pixels: {metrics['exactPixelRatio']:.6%}",
        f"MAE: {metrics['meanAbsoluteError']:.6f} / 255",
        f"RMSE: {metrics['rootMeanSquareError']:.6f} / 255",
        f"Max channel delta: {metrics['maxAbsoluteChannelDifference']}",
        f">15 ratio: {metrics['maxChannelDifferenceRatios']['gt15']:.6%}",
        f"PSNR: {metrics['psnrDb'] if metrics['psnrDb'] is not None else 'infinite'}",
        f"SSIM: {metrics['ssim'] if metrics['ssim'] is not None else 'unavailable'}",
        f"Global SSIM fallback: {metrics['ssimGlobalFallback']:.9f}",
        "Heatmap D=max(|Rs-Ri|,|Gs-Gi|,|Bs-Bi|)",
        "0 black | 1-7 blue | 8-15 cyan | 16-31 green",
        "32-63 yellow | 64-127 orange | 128-255 red",
    )
    y = 80
    for index, line in enumerate(lines):
        draw.text((54, y), line, fill=(255, 255, 255) if index < 2 else (205, 218, 236), font=title_font if index == 0 else body_font)
        y += 66 if index == 0 else 50
    return panel


def save_png(image: Image.Image, path: Path) -> Artifact:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", compress_level=9, optimize=False)
    return describe(path)


def build_one(
    calibration: str,
    source_path: Path,
    integrated_path: Path,
    output_root: Path,
    source_fit: str,
) -> dict[str, Any]:
    with Image.open(source_path) as opened_source, Image.open(integrated_path) as opened_integrated:
        integrated = ImageOps.exif_transpose(opened_integrated).convert("RGB")
        target_size = integrated.size
        source, normalization = normalize_source(opened_source, target_size, source_fit)

    difference = ImageChops.difference(source, integrated)
    maximum_channel = max_channel_image(difference)
    overlay = Image.blend(source, integrated, 0.5)
    difference_heatmap = heatmap(maximum_channel)
    metrics = compute_metrics(source, integrated, difference)

    side_by_side = Image.new("RGB", (target_size[0] * 2, target_size[1]), (255, 255, 255))
    side_by_side.paste(source, (0, 0))
    side_by_side.paste(integrated, (target_size[0], 0))

    board = Image.new("RGB", (target_size[0] * 3, target_size[1] * 2), (5, 17, 39))
    board.paste(caption(source, "SOURCE — normalized, aspect preserved"), (0, 0))
    board.paste(caption(integrated, "INTEGRATED — exact capture"), (target_size[0], 0))
    board.paste(caption(overlay, "50% OVERLAY"), (target_size[0] * 2, 0))
    board.paste(caption(difference, "ABSOLUTE RGB DIFFERENCE — unmasked"), (0, target_size[1]))
    board.paste(caption(difference_heatmap, "HEATMAP — unmasked max-channel delta"), (target_size[0], target_size[1]))
    board.paste(metrics_panel(target_size, calibration, metrics), (target_size[0] * 2, target_size[1]))

    stem = calibration.lower()
    artifacts = {
        "normalizedSource": save_png(source, output_root / "source-normalized" / f"{stem}-source-{target_size[0]}x{target_size[1]}.png"),
        "sideBySide": save_png(side_by_side, output_root / "side-by-side" / f"{stem}-side-by-side-{target_size[0] * 2}x{target_size[1]}.png"),
        "overlay50": save_png(overlay, output_root / "overlay-50" / f"{stem}-overlay-50-{target_size[0]}x{target_size[1]}.png"),
        "absoluteDifference": save_png(difference, output_root / "absolute-diff" / f"{stem}-absolute-diff-{target_size[0]}x{target_size[1]}.png"),
        "heatmap": save_png(difference_heatmap, output_root / "heatmap" / f"{stem}-heatmap-{target_size[0]}x{target_size[1]}.png"),
        "reviewBoard": save_png(board, output_root / "review-boards" / f"{stem}-review-board-{target_size[0] * 3}x{target_size[1] * 2}.png"),
    }

    return {
        "calibration": calibration,
        "source": describe(source_path),
        "integrated": describe(integrated_path),
        "normalization": normalization,
        "differenceFormula": {
            "absoluteRgb": "(|Rs-Ri|, |Gs-Gi|, |Bs-Bi|)",
            "heatmapScalar": "D=max(|Rs-Ri|, |Gs-Gi|, |Bs-Bi|)",
            "masking": "none; every pixel in the normalized frame is included",
            "bands": [
                {"minimum": start, "maximum": end, "rgb": list(color)}
                for start, end, color in HEATMAP_BANDS
            ],
        },
        "metrics": metrics,
        "artifacts": artifacts,
    }


def main() -> int:
    args = parse_args()
    source_dir = args.source_dir.resolve()
    integrated_dir = args.integrated_dir.resolve()
    output_root = args.output_root.resolve()
    mapping = load_mapping(args.mapping)
    requested = tuple(value.strip().upper() for value in args.cal.split(",")) if args.cal else tuple(mapping)

    unknown = sorted(set(requested) - set(CALIBRATIONS))
    if unknown:
        raise ValueError(f"Unknown calibration id(s): {', '.join(unknown)}")

    output_root.mkdir(parents=True, exist_ok=True)
    completed: list[dict[str, Any]] = []
    skipped: list[dict[str, str]] = []

    for calibration in requested:
        source_name = mapping.get(calibration)
        source_path = source_dir / source_name if source_name else None
        integrated_path = integrated_dir / f"{calibration}.png"
        problems = []
        if source_path is None:
            problems.append("no source mapping")
        elif not source_path.is_file():
            problems.append(f"source missing: {source_path}")
        if not integrated_path.is_file():
            problems.append(f"integrated capture missing: {integrated_path}")
        if problems:
            record = {"calibration": calibration, "reason": "; ".join(problems)}
            if args.strict:
                raise FileNotFoundError(record["reason"])
            skipped.append(record)
            continue

        result = build_one(calibration, source_path, integrated_path, output_root, args.source_fit)
        source_id, classification, roi_policy, status = SOURCE_CONTRACT[calibration]
        result["sourceContract"] = {
            "sourceId": source_id,
            "classification": classification,
            "shellRoiPolicy": roi_policy,
            "status": status,
        }
        completed.append(result)

    manifest_path = output_root / "visual-evidence-manifest.json"
    manifest = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "sourceDirectory": str(source_dir),
        "integratedDirectory": str(integrated_dir),
        "outputRoot": str(output_root),
        "sourceFit": args.source_fit,
        "requestedCount": len(requested),
        "completedCount": len(completed),
        "skippedCount": len(skipped),
        "skipped": skipped,
        "comparisons": [],
    }
    for result in completed:
        manifest["comparisons"].append(
            {
                **{key: value for key, value in result.items() if key not in {"source", "integrated", "artifacts"}},
                "source": result["source"].json(source_dir),
                "integrated": result["integrated"].json(integrated_dir),
                "artifacts": {
                    key: artifact.json(output_root)
                    for key, artifact in result["artifacts"].items()
                },
            }
        )
    manifest_path.write_text(f"{json.dumps(manifest, ensure_ascii=False, indent=2)}\n", encoding="utf-8")
    plan_path = output_root / "normalization-plan.csv"
    plan_headers = [
        "cal_id", "source_id", "source_filename", "classification", "native_width_px", "native_height_px",
        "target_width_px", "target_height_px", "fit_mode", "scale", "rendered_height_px", "top_offset_px",
        "bottom_offset_px", "shell_roi_policy", "status",
    ]
    with plan_path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=plan_headers)
        writer.writeheader()
        for comparison in manifest["comparisons"]:
            operation = comparison["normalization"]
            contract = comparison["sourceContract"]
            top = operation["placementOffset"]["y"]
            rendered_height = operation["scaledSize"]["height"]
            target_height = operation["targetSize"]["height"]
            writer.writerow({
                "cal_id": comparison["calibration"],
                "source_id": contract["sourceId"],
                "source_filename": comparison["source"]["relativePath"],
                "classification": contract["classification"],
                "native_width_px": operation["originalSize"]["width"],
                "native_height_px": operation["originalSize"]["height"],
                "target_width_px": operation["targetSize"]["width"],
                "target_height_px": target_height,
                "fit_mode": args.source_fit.upper().replace("-", "_"),
                "scale": f"{operation['uniformScale']:.16f}",
                "rendered_height_px": rendered_height,
                "top_offset_px": top,
                "bottom_offset_px": target_height - top - rendered_height,
                "shell_roi_policy": contract["shellRoiPolicy"],
                "status": contract["status"],
            })
    print(f"Built {len(completed)} comparison package(s); skipped {len(skipped)}. Manifest: {manifest_path}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1) from error
