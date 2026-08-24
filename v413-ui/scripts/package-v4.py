from __future__ import annotations

import hashlib
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORKSPACE = ROOT.parent
ZIP_PATH = WORKSPACE / "android-customer-visual-calibration-v4.zip"
SIDECAR = WORKSPACE / "android-customer-visual-calibration-v4.zip.sha256"
CHECKSUMS = ROOT / "checksums.sha256"


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_manifest() -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = []
    for line in CHECKSUMS.read_text(encoding="utf-8").splitlines():
        if not line:
            continue
        expected, relative = line.split("  ", 1)
        if len(expected) != 64 or not relative:
            raise RuntimeError(f"Malformed checksum entry: {line}")
        rows.append((expected, relative))
    if len(rows) != len({relative for _, relative in rows}):
        raise RuntimeError("Duplicate checksum path")
    return rows


def create_zip() -> None:
    rows = load_manifest()
    for expected, relative in rows:
        payload = (ROOT / Path(relative)).read_bytes()
        if digest(payload) != expected:
            raise RuntimeError(f"Pre-package checksum mismatch: {relative}")
    if ZIP_PATH.exists():
        ZIP_PATH.unlink()
    with zipfile.ZipFile(ZIP_PATH, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
        for _, relative in rows:
            info = zipfile.ZipInfo(relative, date_time=(2026, 8, 10, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, (ROOT / Path(relative)).read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=6)
        checksum_info = zipfile.ZipInfo("checksums.sha256", date_time=(2026, 8, 10, 0, 0, 0))
        checksum_info.compress_type = zipfile.ZIP_DEFLATED
        checksum_info.external_attr = 0o100644 << 16
        archive.writestr(checksum_info, CHECKSUMS.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=6)
    zip_sha = digest(ZIP_PATH.read_bytes())
    SIDECAR.write_text(f"{zip_sha}  {ZIP_PATH.name}\n", encoding="ascii")
    print({"status": "CREATED", "entries": len(rows) + 1, "bytes": ZIP_PATH.stat().st_size, "sha256": zip_sha})


def verify_zip() -> None:
    rows = load_manifest()
    expected = {relative: sha for sha, relative in rows}
    expected_names = set(expected) | {"checksums.sha256"}
    with zipfile.ZipFile(ZIP_PATH, "r") as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise RuntimeError("Duplicate ZIP entries")
        if set(names) != expected_names:
            missing = sorted(expected_names - set(names))
            extra = sorted(set(names) - expected_names)
            raise RuntimeError(f"ZIP allowlist mismatch missing={missing} extra={extra}")
        bad_crc = archive.testzip()
        if bad_crc:
            raise RuntimeError(f"ZIP CRC failure: {bad_crc}")
        embedded = archive.read("checksums.sha256")
        if embedded != CHECKSUMS.read_bytes():
            raise RuntimeError("Embedded checksums.sha256 is not byte-equal")
        for relative, expected_sha in expected.items():
            if digest(archive.read(relative)) != expected_sha:
                raise RuntimeError(f"ZIP entry checksum mismatch: {relative}")
    sidecar_sha, sidecar_name = SIDECAR.read_text(encoding="ascii").strip().split("  ", 1)
    actual_sha = digest(ZIP_PATH.read_bytes())
    if sidecar_name != ZIP_PATH.name or sidecar_sha != actual_sha:
        raise RuntimeError("ZIP sidecar mismatch")
    print({"status": "PASS", "entries": len(expected_names), "bytes": ZIP_PATH.stat().st_size, "sha256": actual_sha})


if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in {"create", "verify"}:
        raise SystemExit("usage: package-v4.py create|verify")
    create_zip() if sys.argv[1] == "create" else verify_zip()
