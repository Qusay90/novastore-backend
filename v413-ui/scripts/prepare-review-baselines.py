#!/usr/bin/env python3
"""Copy immutable V2 rejected captures into the portable V3 review package."""

from __future__ import annotations

import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / "android-customer-visual-calibration-v2" / "screens" / "phone_1080x2400"
DESTINATION = ROOT / "05_comparisons" / "v2-rejected-phone"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    DESTINATION.mkdir(parents=True, exist_ok=True)
    records = []
    for index in range(1, 13):
        name = f"CAL-{index:02d}.png"
        source = SOURCE / name
        destination = DESTINATION / name
        if not source.is_file():
            raise FileNotFoundError(source)
        with Image.open(source) as image:
            if image.size != (1080, 2400):
                raise ValueError(f"V2 baseline is not 1080x2400: {source} -> {image.size}")
        shutil.copyfile(source, destination)
        source_hash = sha256(source)
        destination_hash = sha256(destination)
        if source_hash != destination_hash:
            raise ValueError(f"Copy hash mismatch: {name}")
        records.append(
            {
                "calibration": f"CAL-{index:02d}",
                "decision": "V2 HUMAN VISUAL DECISION: REJECTED",
                "sourceAbsolutePath": str(source.resolve()),
                "destinationRelativePath": destination.resolve().relative_to(ROOT.resolve()).as_posix(),
                "width": 1080,
                "height": 2400,
                "bytes": destination.stat().st_size,
                "sha256": destination_hash,
                "byteExactCopy": True,
            }
        )

    manifest = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "sourcePolicy": "read-only V2 baseline; copied byte-for-byte for portable review",
        "v2HumanVisualDecision": "REJECTED",
        "v2RejectionScope": "CAL-01–CAL-12",
        "v2BottomNav": "VISUAL_REGRESSION",
        "captures": records,
    }
    manifest_path = DESTINATION / "v2-rejected-baseline-manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Prepared {len(records)} byte-exact V2 rejected baselines: {manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
