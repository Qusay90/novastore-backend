from __future__ import annotations

import hashlib
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DELIVERY_ROOT = ROOT.parent
ZIP_PATH = DELIVERY_ROOT / "NovaStore-Android-Customer-Visual-Calibration-V4.10.zip"
ZIP_SIDECAR = DELIVERY_ROOT / "NovaStore-Android-Customer-Visual-Calibration-V4.10.zip.sha256"
MANIFEST_PATH = ROOT / "SHA256SUMS_V4_10.txt"
ARCHIVE_TIMESTAMP = (2026, 8, 11, 0, 0, 0)

TOP_LEVEL_FILES = (
    ".openai/hosting.json",
    "AGENTS.md",
    "README_V4_10.md",
    "V4_10_STATUS.md",
    "design-qa.md",
    "index.html",
    "mobile-runtime.lock.json",
    "package-lock.json",
    "package.json",
    "playwright.config.ts",
    "tsconfig.json",
    "vite.config.ts",
)

INCLUDED_DIRECTORIES = (
    "04_source_native_parity/product-card-authority",
    "dist",
    "public",
    "qa_v4_5/sources",
    "qa_v4_8",
    "qa_v4_10",
    "scripts",
    "src",
    "tests",
    "worker",
)


def sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def collect_entries() -> list[str]:
    paths: set[str] = set()
    for relative in TOP_LEVEL_FILES:
        path = ROOT / relative
        if not path.is_file():
            raise RuntimeError(f"Required delivery file is missing: {relative}")
        paths.add(relative)
    for relative_root in INCLUDED_DIRECTORIES:
        directory = ROOT / relative_root
        if not directory.is_dir():
            raise RuntimeError(f"Required delivery directory is missing: {relative_root}")
        for path in directory.rglob("*"):
            if path.is_file() and not path.is_symlink():
                paths.add(path.relative_to(ROOT).as_posix())
    paths.discard(MANIFEST_PATH.relative_to(ROOT).as_posix())
    return sorted(paths)


def build_manifest(entries: list[str]) -> bytes:
    rows = [f"{sha256((ROOT / relative).read_bytes())}  {relative}" for relative in entries]
    return ("\n".join(rows) + "\n").encode("utf-8")


def write_zip_entry(archive: zipfile.ZipFile, name: str, payload: bytes) -> None:
    info = zipfile.ZipInfo(name, date_time=ARCHIVE_TIMESTAMP)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o100644 << 16
    archive.writestr(info, payload, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)


def create_and_verify() -> None:
    entries = collect_entries()
    manifest = build_manifest(entries)
    MANIFEST_PATH.write_bytes(manifest)

    if ZIP_PATH.exists():
        ZIP_PATH.unlink()
    if ZIP_SIDECAR.exists():
        ZIP_SIDECAR.unlink()

    with zipfile.ZipFile(ZIP_PATH, "w", allowZip64=True) as archive:
        for relative in entries:
            write_zip_entry(archive, relative, (ROOT / relative).read_bytes())
        write_zip_entry(archive, MANIFEST_PATH.name, manifest)

    expected_names = set(entries) | {MANIFEST_PATH.name}
    expected_hashes = {
        line.split("  ", 1)[1]: line.split("  ", 1)[0]
        for line in manifest.decode("utf-8").splitlines()
    }
    with zipfile.ZipFile(ZIP_PATH, "r") as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise RuntimeError("Delivery ZIP contains duplicate entries")
        if set(names) != expected_names:
            raise RuntimeError("Delivery ZIP allowlist does not match the manifest")
        if archive.testzip() is not None:
            raise RuntimeError("Delivery ZIP CRC verification failed")
        if archive.read(MANIFEST_PATH.name) != manifest:
            raise RuntimeError("Embedded delivery manifest is not byte-identical")
        for relative, expected in expected_hashes.items():
            if sha256(archive.read(relative)) != expected:
                raise RuntimeError(f"Delivery checksum mismatch: {relative}")

    zip_digest = sha256(ZIP_PATH.read_bytes())
    ZIP_SIDECAR.write_text(f"{zip_digest}  {ZIP_PATH.name}\n", encoding="ascii")
    print(
        {
            "status": "PASS",
            "entries": len(expected_names),
            "bytes": ZIP_PATH.stat().st_size,
            "sha256": zip_digest,
        }
    )


if __name__ == "__main__":
    create_and_verify()
