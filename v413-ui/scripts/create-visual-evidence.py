#!/usr/bin/env python3
"""Create deterministic V4.13 reference-versus-APK visual evidence.

The script deliberately fails closed before writing outputs unless both input
directories contain the exact 36-route PNG contract and every image is a
readable, non-blank PNG with the expected dimensions.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import math
import os
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

import numpy as np
from PIL import Image, UnidentifiedImageError, __version__ as PILLOW_VERSION


REFERENCE_SIZE = (411, 914)
RUNTIME_SIZE = (1080, 2400)
TOP_MASK_END_EXCLUSIVE = 63  # Measured Android rows y=0..62.
BOTTOM_MASK_START = 2337  # Measured Android rows y=2337..2399.
MASK_RGB = (127, 127, 127)
CHANGED_PIXEL_THRESHOLD = 16

ROUTE_FILENAMES: tuple[str, ...] = (
    "01-cal01-account-login.png",
    "02-cal01-account-forgot.png",
    "03-cal01-account-register.png",
    "04-cal02-home-root.png",
    "05-cal02-home-search.png",
    "06-cal03-categories-root.png",
    "07-cal04-home-root.png",
    "08-cal04-favorites-root.png",
    "09-cal04-home-store.png",
    "10-cal05-home-root.png",
    "11-cal06-home-root.png",
    "12-cal07-cart-root.png",
    "13-cal08-cart-root.png",
    "14-cal08-cart-address.png",
    "15-cal08-cart-success.png",
    "16-cal09-account-root.png",
    "17-cal09-account-invoice.png",
    "18-cal09-account-tracking.png",
    "19-cal10-account-root.png",
    "20-cal10-account-returns.png",
    "21-cal10-account-faq.png",
    "22-cal10-account-history.png",
    "23-cal10-account-addresses.png",
    "24-cal10-account-notifications.png",
    "25-cal10-account-profile.png",
    "26-cal10-account-payments.png",
    "27-cal10-account-coupons.png",
    "28-cal10-account-reviews.png",
    "29-cal10-account-questions.png",
    "30-cal10-account-security.png",
    "31-cal10-account-settings.png",
    "32-cal11-support-root.png",
    "33-cal11-support-faq.png",
    "34-cal11-support-history.png",
    "35-cal11-support-live.png",
    "36-cal12-support-root.png",
)

OUTPUT_KINDS: tuple[str, ...] = (
    "side-by-side",
    "overlay",
    "absolute-diff",
    "heatmap",
)


class EvidenceError(RuntimeError):
    """Raised for a fail-closed input or output contract violation."""


@dataclass(frozen=True)
class RouteInput:
    filename: str
    reference_path: Path
    runtime_path: Path
    reference: Image.Image
    runtime: Image.Image
    reference_sha256: str
    runtime_sha256: str


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def png_paths(directory: Path) -> dict[str, Path]:
    if not directory.is_dir():
        raise EvidenceError(f"Input directory does not exist: {directory}")

    result: dict[str, Path] = {}
    for path in sorted(directory.rglob("*"), key=lambda item: item.as_posix()):
        if not path.is_file() or path.suffix.lower() != ".png":
            continue
        relative_name = path.relative_to(directory).as_posix()
        if relative_name in result:
            raise EvidenceError(f"Duplicate PNG path: {relative_name}")
        result[relative_name] = path
    return result


def describe_name_delta(label: str, names: Iterable[str]) -> str:
    actual = set(names)
    expected = set(ROUTE_FILENAMES)
    missing = sorted(expected - actual)
    extra = sorted(actual - expected)
    return (
        f"{label} PNG contract mismatch: expected=36 actual={len(actual)} "
        f"missing={missing} extra={extra}"
    )


def validate_name_contract(
    reference_paths: dict[str, Path], runtime_paths: dict[str, Path]
) -> None:
    expected = set(ROUTE_FILENAMES)
    reference_names = set(reference_paths)
    runtime_names = set(runtime_paths)

    if len(reference_paths) != 36 or reference_names != expected:
        raise EvidenceError(describe_name_delta("Reference", reference_names))
    if len(runtime_paths) != 36 or runtime_names != expected:
        raise EvidenceError(describe_name_delta("Runtime", runtime_names))
    if reference_names != runtime_names:
        raise EvidenceError(
            "Reference/runtime PNG names are not in exact one-to-one parity"
        )


def _content_array(image: Image.Image, runtime: bool) -> np.ndarray:
    pixels = np.asarray(image, dtype=np.uint8)
    if runtime:
        pixels = pixels[TOP_MASK_END_EXCLUSIVE:BOTTOM_MASK_START, :, :]
    return pixels


def load_valid_png(path: Path, expected_size: tuple[int, int], runtime: bool) -> Image.Image:
    try:
        with Image.open(path) as probe:
            if probe.format != "PNG":
                raise EvidenceError(f"Not a PNG file: {path}")
            probe.verify()
        with Image.open(path) as source:
            source.load()
            if source.size != expected_size:
                raise EvidenceError(
                    f"Unexpected dimensions for {path}: "
                    f"expected={expected_size[0]}x{expected_size[1]} "
                    f"actual={source.width}x{source.height}"
                )
            if "A" in source.getbands():
                rgba = source.convert("RGBA")
                white = Image.new("RGBA", source.size, (255, 255, 255, 255))
                image = Image.alpha_composite(white, rgba).convert("RGB")
            else:
                image = source.convert("RGB")
    except EvidenceError:
        raise
    except (OSError, UnidentifiedImageError, ValueError) as exc:
        raise EvidenceError(f"Unreadable PNG {path}: {exc}") from exc

    content = _content_array(image, runtime=runtime)
    channel_range = int(np.ptp(content))
    grayscale = (
        content[:, :, 0].astype(np.float32) * 0.299
        + content[:, :, 1].astype(np.float32) * 0.587
        + content[:, :, 2].astype(np.float32) * 0.114
    )
    grayscale_stddev = float(np.std(grayscale, dtype=np.float64))
    if channel_range < 8 or grayscale_stddev < 0.5:
        raise EvidenceError(
            f"Blank or visually unreadable PNG {path}: "
            f"channel_range={channel_range} grayscale_stddev={grayscale_stddev:.6f}"
        )
    return image


def load_all_inputs(reference_dir: Path, runtime_dir: Path) -> list[RouteInput]:
    reference_paths = png_paths(reference_dir)
    runtime_paths = png_paths(runtime_dir)
    validate_name_contract(reference_paths, runtime_paths)

    # Load and validate every input before the caller creates any output path.
    routes: list[RouteInput] = []
    for filename in ROUTE_FILENAMES:
        reference_path = reference_paths[filename]
        runtime_path = runtime_paths[filename]
        routes.append(
            RouteInput(
                filename=filename,
                reference_path=reference_path,
                runtime_path=runtime_path,
                reference=load_valid_png(
                    reference_path, REFERENCE_SIZE, runtime=False
                ),
                runtime=load_valid_png(runtime_path, RUNTIME_SIZE, runtime=True),
                reference_sha256=sha256_file(reference_path),
                runtime_sha256=sha256_file(runtime_path),
            )
        )
    return routes


def scale_reference(image: Image.Image) -> Image.Image:
    return image.resize(RUNTIME_SIZE, resample=Image.Resampling.LANCZOS)


def mask_system_bars(image: Image.Image) -> Image.Image:
    if image.size != RUNTIME_SIZE:
        raise EvidenceError(
            f"System-bar masking requires {RUNTIME_SIZE}, received {image.size}"
        )
    pixels = np.array(image.convert("RGB"), dtype=np.uint8, copy=True)
    pixels[0:TOP_MASK_END_EXCLUSIVE, :, :] = MASK_RGB
    pixels[BOTTOM_MASK_START:RUNTIME_SIZE[1], :, :] = MASK_RGB
    return Image.fromarray(pixels, mode="RGB")


def compute_metrics(
    reference_pixels: np.ndarray, runtime_pixels: np.ndarray
) -> tuple[np.ndarray, dict[str, float | int]]:
    reference_viewport = reference_pixels[
        TOP_MASK_END_EXCLUSIVE:BOTTOM_MASK_START, :, :
    ].astype(np.int16)
    runtime_viewport = runtime_pixels[
        TOP_MASK_END_EXCLUSIVE:BOTTOM_MASK_START, :, :
    ].astype(np.int16)
    difference = np.abs(reference_viewport - runtime_viewport).astype(np.uint8)
    difference_float = difference.astype(np.float64)
    changed_pixels = np.any(difference > CHANGED_PIXEL_THRESHOLD, axis=2)

    metrics: dict[str, float | int] = {
        "mae": round(float(np.mean(difference_float, dtype=np.float64)), 6),
        "rmse": round(
            math.sqrt(float(np.mean(np.square(difference_float), dtype=np.float64))),
            6,
        ),
        "max": int(np.max(difference)),
        "changed_pixel_percent": round(
            float(np.mean(changed_pixels, dtype=np.float64) * 100.0), 6
        ),
    }
    return difference, metrics


def full_absolute_difference(
    reference_pixels: np.ndarray, runtime_pixels: np.ndarray
) -> np.ndarray:
    return np.abs(
        reference_pixels.astype(np.int16) - runtime_pixels.astype(np.int16)
    ).astype(np.uint8)


def heatmap_from_difference(difference: np.ndarray) -> np.ndarray:
    # Deterministic black -> red -> yellow -> white palette using only integer math.
    intensity = np.max(difference, axis=2).astype(np.int16)
    red = np.clip(intensity * 3, 0, 255)
    green = np.clip(intensity * 3 - 255, 0, 255)
    blue = np.clip(intensity * 3 - 510, 0, 255)
    return np.stack((red, green, blue), axis=2).astype(np.uint8)


def validate_existing_outputs(output_dir: Path) -> None:
    expected = set(ROUTE_FILENAMES)
    for kind in OUTPUT_KINDS:
        kind_dir = output_dir / kind
        if not kind_dir.exists():
            continue
        if not kind_dir.is_dir():
            raise EvidenceError(f"Expected output directory, found file: {kind_dir}")
        existing = {
            path.relative_to(kind_dir).as_posix()
            for path in kind_dir.rglob("*")
            if path.is_file() and path.suffix.lower() == ".png"
        }
        unexpected = sorted(existing - expected)
        if unexpected:
            raise EvidenceError(
                f"Unexpected stale PNGs in {kind_dir}; refusing ambiguous output: "
                f"{unexpected}"
            )


def atomic_save_png(image: Image.Image, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{destination.name}.", suffix=".tmp", dir=destination.parent
    )
    os.close(descriptor)
    temporary_path = Path(temporary_name)
    try:
        image.save(temporary_path, format="PNG", optimize=False, compress_level=9)
        os.replace(temporary_path, destination)
    finally:
        if temporary_path.exists():
            temporary_path.unlink()


def atomic_write_bytes(payload: bytes, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{destination.name}.", suffix=".tmp", dir=destination.parent
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, destination)
    finally:
        if temporary_path.exists():
            temporary_path.unlink()


def render_route(route: RouteInput, output_dir: Path) -> dict[str, object]:
    scaled_reference = mask_system_bars(scale_reference(route.reference))
    masked_runtime = mask_system_bars(route.runtime)
    reference_pixels = np.asarray(scaled_reference, dtype=np.uint8)
    runtime_pixels = np.asarray(masked_runtime, dtype=np.uint8)
    _, metrics = compute_metrics(reference_pixels, runtime_pixels)
    absolute_difference = full_absolute_difference(reference_pixels, runtime_pixels)

    side_by_side = Image.new("RGB", (RUNTIME_SIZE[0] * 2, RUNTIME_SIZE[1]))
    side_by_side.paste(scaled_reference, (0, 0))
    side_by_side.paste(masked_runtime, (RUNTIME_SIZE[0], 0))
    overlay = Image.blend(scaled_reference, masked_runtime, alpha=0.5)
    diff_image = Image.fromarray(absolute_difference, mode="RGB")
    heatmap = Image.fromarray(
        heatmap_from_difference(absolute_difference), mode="RGB"
    )

    output_images = {
        "side-by-side": side_by_side,
        "overlay": overlay,
        "absolute-diff": diff_image,
        "heatmap": heatmap,
    }
    output_paths: dict[str, str] = {}
    output_hashes: dict[str, str] = {}
    for kind in OUTPUT_KINDS:
        path = output_dir / kind / route.filename
        atomic_save_png(output_images[kind], path)
        output_paths[kind] = path.relative_to(output_dir).as_posix()
        output_hashes[kind] = sha256_file(path)

    return {
        "route": route.filename.removesuffix(".png"),
        "filename": route.filename,
        "reference_sha256": route.reference_sha256,
        "runtime_sha256": route.runtime_sha256,
        **metrics,
        "outputs": output_paths,
        "output_sha256": output_hashes,
    }


def aggregate_metrics(rows: Sequence[dict[str, object]]) -> dict[str, float | int]:
    return {
        "mean_mae": round(
            sum(float(row["mae"]) for row in rows) / len(rows), 6
        ),
        "mean_rmse": round(
            sum(float(row["rmse"]) for row in rows) / len(rows), 6
        ),
        "max": max(int(row["max"]) for row in rows),
        "mean_changed_pixel_percent": round(
            sum(float(row["changed_pixel_percent"]) for row in rows) / len(rows),
            6,
        ),
    }


def write_reports(rows: list[dict[str, object]], output_dir: Path) -> None:
    report = {
        "schema_version": 1,
        "status": "MEASURED_NOT_HUMAN_APPROVED",
        "route_count": len(rows),
        "reference_dimensions": {
            "width": REFERENCE_SIZE[0],
            "height": REFERENCE_SIZE[1],
        },
        "runtime_dimensions": {
            "width": RUNTIME_SIZE[0],
            "height": RUNTIME_SIZE[1],
        },
        "reference_resampling": "Pillow.Image.Resampling.LANCZOS",
        "system_bar_mask": {
            "top_rows_inclusive": [0, TOP_MASK_END_EXCLUSIVE - 1],
            "bottom_rows_inclusive": [BOTTOM_MASK_START, RUNTIME_SIZE[1] - 1],
            "rgb": list(MASK_RGB),
        },
        "metric_viewport": {
            "x_columns_inclusive": [0, RUNTIME_SIZE[0] - 1],
            "y_rows_inclusive": [TOP_MASK_END_EXCLUSIVE, BOTTOM_MASK_START - 1],
            "width": RUNTIME_SIZE[0],
            "height": BOTTOM_MASK_START - TOP_MASK_END_EXCLUSIVE,
        },
        "changed_pixel_definition": (
            "A viewport pixel is changed when any RGB channel absolute "
            f"difference is > {CHANGED_PIXEL_THRESHOLD}."
        ),
        "toolchain": {
            "python": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
            "pillow": PILLOW_VERSION,
            "numpy": np.__version__,
        },
        "aggregate": aggregate_metrics(rows),
        "routes": rows,
    }
    json_payload = (
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=False) + "\n"
    ).encode("utf-8")
    atomic_write_bytes(json_payload, output_dir / "visual-metrics.json")

    csv_buffer = io.StringIO(newline="")
    fieldnames = [
        "route",
        "filename",
        "mae",
        "rmse",
        "max",
        "changed_pixel_percent",
        "reference_sha256",
        "runtime_sha256",
        "side_by_side_sha256",
        "overlay_sha256",
        "absolute_diff_sha256",
        "heatmap_sha256",
    ]
    writer = csv.DictWriter(
        csv_buffer, fieldnames=fieldnames, lineterminator="\n", extrasaction="ignore"
    )
    writer.writeheader()
    for row in rows:
        output_hashes = row["output_sha256"]
        if not isinstance(output_hashes, dict):
            raise EvidenceError("Internal output hash contract violation")
        writer.writerow(
            {
                **row,
                "side_by_side_sha256": output_hashes["side-by-side"],
                "overlay_sha256": output_hashes["overlay"],
                "absolute_diff_sha256": output_hashes["absolute-diff"],
                "heatmap_sha256": output_hashes["heatmap"],
            }
        )
    atomic_write_bytes(
        csv_buffer.getvalue().encode("utf-8"), output_dir / "visual-metrics.csv"
    )


def create_evidence(reference_dir: Path, runtime_dir: Path, output_dir: Path) -> None:
    routes = load_all_inputs(reference_dir, runtime_dir)
    validate_existing_outputs(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    rows = [render_route(route, output_dir) for route in routes]
    if len(rows) != 36:
        raise EvidenceError(f"Internal route-count violation: {len(rows)}")
    write_reports(rows, output_dir)


def make_nonblank_image(size: tuple[int, int]) -> Image.Image:
    width, height = size
    x = np.arange(width, dtype=np.uint16)[None, :]
    y = np.arange(height, dtype=np.uint16)[:, None]
    pixels = np.empty((height, width, 3), dtype=np.uint8)
    pixels[:, :, 0] = ((x + y) % 256).astype(np.uint8)
    pixels[:, :, 1] = ((x * 3 + y * 5) % 256).astype(np.uint8)
    pixels[:, :, 2] = ((x * 7 + y * 11) % 256).astype(np.uint8)
    return Image.fromarray(pixels, mode="RGB")


def run_self_test() -> None:
    if len(ROUTE_FILENAMES) != 36 or len(set(ROUTE_FILENAMES)) != 36:
        raise EvidenceError("Route contract must contain 36 unique filenames")

    reference = np.zeros((RUNTIME_SIZE[1], RUNTIME_SIZE[0], 3), dtype=np.uint8)
    runtime = reference.copy()
    runtime[0, 0, :] = 255  # Must be removed by the system-bar mask.
    runtime[TOP_MASK_END_EXCLUSIVE, 0, 0] = CHANGED_PIXEL_THRESHOLD + 1
    reference_image = mask_system_bars(Image.fromarray(reference, mode="RGB"))
    runtime_image = mask_system_bars(Image.fromarray(runtime, mode="RGB"))
    reference_pixels = np.asarray(reference_image, dtype=np.uint8)
    runtime_pixels = np.asarray(runtime_image, dtype=np.uint8)
    difference, metrics = compute_metrics(reference_pixels, runtime_pixels)
    viewport_pixels = (
        RUNTIME_SIZE[0] * (BOTTOM_MASK_START - TOP_MASK_END_EXCLUSIVE)
    )
    expected_changed_percent = round(100.0 / viewport_pixels, 6)
    if int(metrics["max"]) != CHANGED_PIXEL_THRESHOLD + 1:
        raise EvidenceError(f"Self-test max mismatch: {metrics['max']}")
    if float(metrics["changed_pixel_percent"]) != expected_changed_percent:
        raise EvidenceError(
            "Self-test changed-pixel percentage mismatch: "
            f"expected={expected_changed_percent} "
            f"actual={metrics['changed_pixel_percent']}"
        )
    if np.any(reference_pixels[0:TOP_MASK_END_EXCLUSIVE] != MASK_RGB):
        raise EvidenceError("Self-test top-mask mismatch")
    if np.any(runtime_pixels[BOTTOM_MASK_START:] != MASK_RGB):
        raise EvidenceError("Self-test bottom-mask mismatch")
    if heatmap_from_difference(difference).shape != difference.shape:
        raise EvidenceError("Self-test heatmap shape mismatch")

    with tempfile.TemporaryDirectory(prefix="novastore-visual-self-test-") as temp:
        temp_dir = Path(temp)
        reference_path = temp_dir / "reference.png"
        runtime_path = temp_dir / "runtime.png"
        blank_path = temp_dir / "blank.png"
        make_nonblank_image(REFERENCE_SIZE).save(reference_path, format="PNG")
        make_nonblank_image(RUNTIME_SIZE).save(runtime_path, format="PNG")
        Image.new("RGB", REFERENCE_SIZE, "white").save(blank_path, format="PNG")
        load_valid_png(reference_path, REFERENCE_SIZE, runtime=False)
        load_valid_png(runtime_path, RUNTIME_SIZE, runtime=True)
        try:
            load_valid_png(blank_path, REFERENCE_SIZE, runtime=False)
        except EvidenceError:
            pass
        else:
            raise EvidenceError("Self-test blank-image validation did not fail closed")


def parse_args() -> argparse.Namespace:
    project_dir = Path(__file__).resolve().parent.parent
    artifact_dir = project_dir / "artifacts" / "android-customer-v413-owner-preview"
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--reference-dir",
        type=Path,
        default=artifact_dir / "reference",
        help="Directory containing the 36 authoritative 411x914 PNGs",
    )
    parser.add_argument(
        "--runtime-dir",
        type=Path,
        default=artifact_dir / "runtime",
        help="Directory containing the 36 APK 1080x2400 PNGs",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=artifact_dir / "comparisons",
        help="Destination for visual evidence and metrics",
    )
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="Run deterministic internal checks without consuming project artifacts",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        if args.self_test:
            run_self_test()
            print("SELF_TEST=PASS")
            return 0
        create_evidence(
            args.reference_dir.resolve(),
            args.runtime_dir.resolve(),
            args.output_dir.resolve(),
        )
        print("VISUAL_EVIDENCE=PASS")
        print("ROUTE_COUNT=36")
        print(f"OUTPUT_DIR={args.output_dir.resolve()}")
        return 0
    except EvidenceError as exc:
        print(f"VISUAL_EVIDENCE=FAIL: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
