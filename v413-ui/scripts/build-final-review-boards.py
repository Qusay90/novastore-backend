from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "08_review_boards"
NAVY = (5, 24, 53)
WHITE = (250, 252, 255)
MUTED = (188, 202, 222)
HEADER = 60
PANEL_W = 1080
PANEL_H = 2400

SCREENS = [
    ("CAL-01", "login", "Giriş", "EXACT_REFERENCE"),
    ("CAL-02", "home", "Ana Sayfa", "EXACT_REFERENCE"),
    ("CAL-03", "categories", "Kategoriler", "EXACT_REFERENCE"),
    ("CAL-04", "plp", "Ürün Listeleme", "PARTIAL_REFERENCE"),
    ("CAL-05", "filter", "Filtre", "INFERRED_PROTOTYPE"),
    ("CAL-06", "product-detail", "Ürün Detayı", "EXACT_GEOMETRY_WITH_BRAND_PALETTE_DELTA"),
    ("CAL-07", "cart", "Sepet", "INFERRED_PROTOTYPE"),
    ("CAL-08", "checkout", "Checkout", "EXACT_REFERENCE"),
    ("CAL-09", "order-detail", "Sipariş Detayı", "EXACT_REFERENCE"),
    ("CAL-10", "account", "Hesabım", "EXACT_REFERENCE"),
    ("CAL-11", "support-hub", "Support Hub", "EXACT_VISUAL_WITH_ROUTE_DELTA"),
    ("CAL-12", "novabot", "NovaBot", "EXACT_SHELL_WITH_REQUIRED_RICH_STATE"),
]


def font(size: int, semibold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidate = ROOT / "public" / "calibration-assets" / "official" / "fonts" / (
        "inter_semibold.ttf" if semibold else "inter_regular.ttf"
    )
    try:
        return ImageFont.truetype(str(candidate), size=size)
    except OSError:
        return ImageFont.load_default()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def image_record(path: Path) -> dict[str, object]:
    with Image.open(path) as image:
        width, height = image.size
    return {
        "relativePath": path.relative_to(ROOT).as_posix(),
        "width": width,
        "height": height,
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def load_rgb(path: Path) -> Image.Image:
    with Image.open(path) as image:
        return image.convert("RGB")


def panel(image: Image.Image, label: str, detail: str = "") -> Image.Image:
    canvas = Image.new("RGB", (PANEL_W, HEADER + PANEL_H), NAVY)
    draw = ImageDraw.Draw(canvas)
    draw.text((24, 14), label, fill=WHITE, font=font(24, semibold=True))
    if detail:
        bbox = draw.textbbox((0, 0), detail, font=font(19))
        draw.text((PANEL_W - 24 - (bbox[2] - bbox[0]), 17), detail, fill=MUTED, font=font(19))

    if image.size != (PANEL_W, PANEL_H):
        scale = min(PANEL_W / image.width, PANEL_H / image.height)
        target = (round(image.width * scale), round(image.height * scale))
        fitted = image.resize(target, Image.Resampling.LANCZOS)
        surface = Image.new("RGB", (PANEL_W, PANEL_H), (243, 245, 248))
        surface.paste(fitted, ((PANEL_W - target[0]) // 2, (PANEL_H - target[1]) // 2))
        image = surface
    canvas.paste(image, (0, HEADER))
    return canvas


def build_board(cal_id: str, slug: str, title: str, classification: str) -> tuple[Path, dict[str, object]]:
    lower = cal_id.lower()
    paths = {
        "source": ROOT / "04_source_native_parity" / "source-normalized" / f"{lower}-source-1080x2400.png",
        "v2": ROOT / "05_comparisons" / "v2-rejected-phone" / f"{cal_id}.png",
        "phone": ROOT / "02_phone_1080x2400" / f"{cal_id}.png",
        "tablet": ROOT / "03_tablet_1600x2560" / f"{cal_id}.png",
        "overlay": ROOT / "04_source_native_parity" / "overlay-50" / f"{lower}-overlay-50-1080x2400.png",
        "heatmap": ROOT / "04_source_native_parity" / "heatmap" / f"{lower}-heatmap-1080x2400.png",
    }
    missing = [key for key, path in paths.items() if not path.is_file()]
    if missing:
        raise FileNotFoundError(f"{cal_id}: missing board inputs: {', '.join(missing)}")

    panels = [
        panel(load_rgb(paths["source"]), "SOURCE — aspect preserved", classification),
        panel(load_rgb(paths["v2"]), "V2 — REJECTED baseline", "not an authority"),
        panel(load_rgb(paths["phone"]), "V4 PHONE — 1080×2400", "HUMAN PENDING"),
        panel(load_rgb(paths["tablet"]), "V4 TABLET — 1600×2560", "aspect-fit preview; original linked"),
        panel(load_rgb(paths["overlay"]), "50% OVERLAY — unmasked", "diagnostic only"),
        panel(load_rgb(paths["heatmap"]), "HEATMAP — max-channel delta", "unmasked"),
    ]
    board = Image.new("RGB", (PANEL_W * 3, (PANEL_H + HEADER) * 2), NAVY)
    for index, item in enumerate(panels):
        board.paste(item, ((index % 3) * PANEL_W, (index // 3) * (PANEL_H + HEADER)))

    destination = OUT / f"{cal_id}-{slug}.png"
    board.save(destination, "PNG", optimize=True)
    return destination, {
        "calibration": cal_id,
        "title": title,
        "classification": classification,
        "board": image_record(destination),
        "inputs": {key: image_record(value) for key, value in paths.items()},
        "humanDecision": "PENDING",
    }


def build_contact_sheet() -> Path:
    thumb_w, thumb_h, label_h = 540, 1200, 72
    sheet = Image.new("RGB", (thumb_w * 4, (thumb_h + label_h) * 3), NAVY)
    draw = ImageDraw.Draw(sheet)
    for index, (cal_id, _slug, title, classification) in enumerate(SCREENS):
        phone = load_rgb(ROOT / "02_phone_1080x2400" / f"{cal_id}.png")
        thumb = phone.resize((thumb_w, thumb_h), Image.Resampling.LANCZOS)
        x = (index % 4) * thumb_w
        y = (index // 4) * (thumb_h + label_h)
        sheet.paste(thumb, (x, y + label_h))
        draw.text((x + 16, y + 10), f"{cal_id} · {title}", fill=WHITE, font=font(21, semibold=True))
        draw.text((x + 16, y + 39), classification, fill=MUTED, font=font(14))
    destination = OUT / "calibration-contact-sheet.png"
    sheet.save(destination, "PNG", optimize=True)
    return destination


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    records = [build_board(*screen)[1] for screen in SCREENS]
    contact_sheet = build_contact_sheet()
    manifest = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "status": "COMPLETE — HUMAN VISUAL DECISION PENDING",
        "v2HumanDecision": "REJECTED",
        "v3HumanDecision": "REJECTED",
        "v4HumanDecision": "PENDING",
        "boardCount": len(records),
        "boards": records,
        "contactSheet": image_record(contact_sheet),
        "componentAuthorityEvidence": {
            "CAL-04": "04_source_native_parity/product-card-authority/product-card-authority-manifest.json",
            "contract": "SRC-09 detailed Home/Favorites card + SRC-12 top-left compact card cross-check; never a CAL-06/PDP source",
        },
        "reviewRule": "Full-resolution source, phone, tablet, overlay, and heatmap artifacts must be opened; thumbnails are not an approval surface.",
    }
    manifest_path = OUT / "review-board-manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    readme = """# V4 review panoları

Bu klasörde CAL-01–CAL-12 için kaynak, V2 reddedilmiş baseline, V4 telefon, V4 tablet, %50 overlay ve maskesiz heatmap panoları bulunur. `calibration-contact-sheet.png` yalnız hızlı yönlendirme içindir; insan kararı tam çözünürlüklü özgün dosyalar açılarak verilmelidir.

- V2 insan kararı: **REJECTED**
- V3 insan kararı: **REJECTED**
- V4 insan kararı: **PENDING**
- CAL-04 tam ekranı `PARTIAL_REFERENCE`tır; ürün kartı alt bileşeni için SRC-09 + SRC-12 kanıtı `04_source_native_parity/product-card-authority/` altındadır.
- CAL-06, `SRC-13` geometri/bilgi mimarisi/kompozisyon otoritesiyle `EXACT_GEOMETRY_WITH_BRAND_PALETTE_DELTA`dır. Kaynaktaki mor palet bağlayıcı değildir; NovaStore lacivert/turuncu/sıcak-nötr paleti korunur.
- Exact full-screen kaynak bulunmayan ekranlar yalnız CAL-05 ve CAL-07'dir (`INFERRED_PROTOTYPE`).
- CAL-11 görsel kaynak açısından exact, production route sözleşmesi açısından ayrı migration delta taşır.
- CAL-12 kaynak ilk shell/state açısından exact; zorunlu çalışan konuşma state’i bilinçli ve test edilmiş bir deltadır.
"""
    (OUT / "README.md").write_text(readme, encoding="utf-8")


if __name__ == "__main__":
    main()
