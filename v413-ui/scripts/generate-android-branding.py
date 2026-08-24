#!/usr/bin/env python3
"""Generate Android launcher fallbacks from the official NovaStore icon."""

from __future__ import annotations

from pathlib import Path
from shutil import copyfile

from PIL import Image, ImageDraw


PROJECT = Path(__file__).resolve().parent.parent
SOURCE = PROJECT / "public/calibration-assets/official/app_icon_foreground.png"
RES = PROJECT / "android/app/src/main/res"
WHITE = (255, 255, 255, 255)

MIPMAP_SIZES = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}

def contain(source: Image.Image, size: tuple[int, int]) -> Image.Image:
    image = source.copy()
    image.thumbnail(size, Image.Resampling.LANCZOS)
    return image


def centered_canvas(
    source: Image.Image,
    size: tuple[int, int],
    content_fraction: float,
    background: tuple[int, int, int, int],
) -> Image.Image:
    canvas = Image.new("RGBA", size, background)
    content = contain(
        source,
        (
            max(1, round(size[0] * content_fraction)),
            max(1, round(size[1] * content_fraction)),
        ),
    )
    canvas.alpha_composite(
        content,
        ((size[0] - content.width) // 2, (size[1] - content.height) // 2),
    )
    return canvas


def round_launcher(source: Image.Image, pixels: int) -> Image.Image:
    canvas = Image.new("RGBA", (pixels, pixels), (0, 0, 0, 0))
    ImageDraw.Draw(canvas).ellipse((0, 0, pixels - 1, pixels - 1), fill=WHITE)
    content = contain(source, (round(pixels * 0.72), round(pixels * 0.72)))
    canvas.alpha_composite(
        content,
        ((pixels - content.width) // 2, (pixels - content.height) // 2),
    )
    return canvas


def main() -> None:
    with Image.open(SOURCE) as raw:
        official = raw.convert("RGBA")

    drawable_nodpi = RES / "drawable-nodpi"
    drawable_nodpi.mkdir(parents=True, exist_ok=True)
    copyfile(SOURCE, drawable_nodpi / "novastore_app_icon.png")

    for density, pixels in MIPMAP_SIZES.items():
        directory = RES / f"mipmap-{density}"
        directory.mkdir(parents=True, exist_ok=True)
        launcher = centered_canvas(official, (pixels, pixels), 0.76, WHITE)
        launcher.save(directory / "ic_launcher.png", format="PNG", optimize=True)
        round_launcher(official, pixels).save(
            directory / "ic_launcher_round.png", format="PNG", optimize=True
        )

    print("ANDROID_BRANDING=GENERATED_FROM_OFFICIAL_ICON")


if __name__ == "__main__":
    main()
