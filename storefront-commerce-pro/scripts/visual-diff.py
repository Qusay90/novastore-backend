import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image


def main():
    parser = argparse.ArgumentParser(description="Create deterministic Commerce Pro visual diff artifacts.")
    parser.add_argument("canonical")
    parser.add_argument("integrated")
    parser.add_argument("output_prefix")
    parser.add_argument("--ignore-right", type=int, default=0)
    args = parser.parse_args()

    canonical = Image.open(args.canonical).convert("RGBA")
    integrated = Image.open(args.integrated).convert("RGBA")
    if canonical.size != integrated.size:
        raise SystemExit(f"image size mismatch: canonical={canonical.size}, integrated={integrated.size}")

    output_prefix = Path(args.output_prefix)
    output_prefix.parent.mkdir(parents=True, exist_ok=True)

    canonical_array = np.asarray(canonical, dtype=np.int16)
    integrated_array = np.asarray(integrated, dtype=np.int16)
    delta = np.abs(canonical_array[:, :, :3] - integrated_array[:, :, :3])
    ignored_right = max(0, min(canonical.width, args.ignore_right))
    if ignored_right:
        delta[:, canonical.width - ignored_right :, :] = 0
    max_channel_delta = delta.max(axis=2)

    exact_changed = max_channel_delta > 0
    changed_over_2 = max_channel_delta > 2
    changed_over_8 = max_channel_delta > 8
    pixel_count = exact_changed.size

    overlay_integrated = integrated_array.copy()
    if ignored_right:
        overlay_integrated[:, canonical.width - ignored_right :, :] = canonical_array[:, canonical.width - ignored_right :, :]
    Image.blend(canonical, Image.fromarray(overlay_integrated.astype(np.uint8), mode="RGBA"), 0.5).save(f"{output_prefix}-overlay.png")
    diff_rgba = np.dstack([delta.astype(np.uint8), np.full(delta.shape[:2], 255, dtype=np.uint8)])
    Image.fromarray(diff_rgba, mode="RGBA").save(f"{output_prefix}-diff.png")

    heatmap = np.asarray(canonical.convert("RGB"), dtype=np.uint8).copy()
    heatmap = (heatmap.astype(np.float32) * 0.28).astype(np.uint8)
    heatmap[changed_over_8] = np.array([255, 42, 42], dtype=np.uint8)
    Image.fromarray(heatmap, mode="RGB").save(f"{output_prefix}-heatmap.png")

    changed_positions = np.argwhere(exact_changed)
    bbox = None
    if changed_positions.size:
        y_min, x_min = changed_positions.min(axis=0)
        y_max, x_max = changed_positions.max(axis=0)
        bbox = [int(x_min), int(y_min), int(x_max + 1), int(y_max + 1)]

    result = {
        "canonical": str(Path(args.canonical).resolve()),
        "integrated": str(Path(args.integrated).resolve()),
        "size": {"width": canonical.width, "height": canonical.height},
        "pixelCount": int(pixel_count),
        "ignoredRightPixels": int(ignored_right),
        "changedPixelsExact": int(exact_changed.sum()),
        "changedRatioExact": float(exact_changed.mean()),
        "changedPixelsOver2": int(changed_over_2.sum()),
        "changedRatioOver2": float(changed_over_2.mean()),
        "changedPixelsOver8": int(changed_over_8.sum()),
        "changedRatioOver8": float(changed_over_8.mean()),
        "meanAbsoluteChannelDelta": float(delta.mean()),
        "maxChannelDelta": int(delta.max()),
        "differenceBoundingBox": bbox,
        "artifacts": {
            "overlay": str(output_prefix.resolve()) + "-overlay.png",
            "diff": str(output_prefix.resolve()) + "-diff.png",
            "heatmap": str(output_prefix.resolve()) + "-heatmap.png",
        },
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
