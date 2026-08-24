#!/usr/bin/env python3
"""Capture the exact V4.13 Android route evidence contract.

The route filenames and expected image dimensions come from
``create-visual-evidence.py`` so capture and comparison cannot silently drift.
The final runtime directory is published only after all 36 screenshots pass
package, activity, PNG, dimension, and uniqueness checks.
"""

from __future__ import annotations

import argparse
import ast
import binascii
import hashlib
import json
import os
import re
import shlex
import shutil
import struct
import subprocess
import sys
import tempfile
import time
import zlib
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Sequence
from urllib.parse import urlencode


PROJECT_DIR = Path(__file__).resolve().parent.parent
EVIDENCE_SCRIPT = Path(__file__).with_name("create-visual-evidence.py")


def read_evidence_constants() -> tuple[tuple[str, ...], tuple[int, int]]:
    """Read literal evidence constants without importing its optional libraries."""
    tree = ast.parse(EVIDENCE_SCRIPT.read_text(encoding="utf-8"), EVIDENCE_SCRIPT.name)
    values: dict[str, object] = {}
    for statement in tree.body:
        name: str | None = None
        value: ast.expr | None = None
        if isinstance(statement, ast.Assign) and len(statement.targets) == 1:
            target = statement.targets[0]
            if isinstance(target, ast.Name):
                name = target.id
                value = statement.value
        elif isinstance(statement, ast.AnnAssign):
            if isinstance(statement.target, ast.Name):
                name = statement.target.id
                value = statement.value
        if name in {"ROUTE_FILENAMES", "RUNTIME_SIZE"} and value is not None:
            values[name] = ast.literal_eval(value)

    filenames = values.get("ROUTE_FILENAMES")
    runtime_size = values.get("RUNTIME_SIZE")
    if not isinstance(filenames, tuple) or not all(
        isinstance(item, str) for item in filenames
    ):
        raise RuntimeError("ROUTE_FILENAMES is not a literal tuple of strings")
    if (
        not isinstance(runtime_size, tuple)
        or len(runtime_size) != 2
        or not all(isinstance(item, int) for item in runtime_size)
    ):
        raise RuntimeError("RUNTIME_SIZE is not a literal width/height tuple")
    return filenames, runtime_size


ROUTE_FILENAMES, RUNTIME_SIZE = read_evidence_constants()

DEFAULT_OUTPUT_DIR = (
    PROJECT_DIR / "artifacts" / "android-customer-v413-owner-preview" / "runtime"
)
DEFAULT_PACKAGE = "com.novastore.app.v413preview"
DEFAULT_COMPONENT = (
    "com.novastore.app.v413preview/com.novastore.app.MainActivity"
)
ROUTE_PATTERN = re.compile(
    r"^(?P<index>\d{2})-cal(?P<cal>\d{2})-"
    r"(?P<tab>account|home|categories|favorites|cart|support)-"
    r"(?P<view>[a-z-]+)\.png$"
)


class CaptureError(RuntimeError):
    """Raised when capture cannot prove the exact evidence contract."""


@dataclass(frozen=True)
class Route:
    index: int
    filename: str
    cal: str
    tab: str
    view: str

    @property
    def uri(self) -> str:
        query: dict[str, str] = {"cal": self.cal, "tab": self.tab}
        if self.view:
            query["view"] = self.view
        return f"novastore://customer?{urlencode(query)}"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_png(path: Path, expected_size: tuple[int, int]) -> tuple[int, int]:
    """Validate PNG structure, CRCs, dimensions, and compressed pixel payload."""
    payload = path.read_bytes()
    if not payload.startswith(b"\x89PNG\r\n\x1a\n"):
        raise CaptureError(f"Not a PNG file: {path}")

    offset = 8
    width = height = 0
    idat = bytearray()
    saw_iend = False
    while offset < len(payload):
        if offset + 12 > len(payload):
            raise CaptureError(f"Truncated PNG chunk header: {path}")
        length = struct.unpack(">I", payload[offset : offset + 4])[0]
        chunk_type = payload[offset + 4 : offset + 8]
        data_start = offset + 8
        data_end = data_start + length
        crc_end = data_end + 4
        if crc_end > len(payload):
            raise CaptureError(f"Truncated PNG chunk payload: {path}")
        chunk_data = payload[data_start:data_end]
        expected_crc = struct.unpack(">I", payload[data_end:crc_end])[0]
        actual_crc = binascii.crc32(chunk_type + chunk_data) & 0xFFFFFFFF
        if actual_crc != expected_crc:
            raise CaptureError(f"PNG CRC mismatch in {chunk_type!r}: {path}")
        if chunk_type == b"IHDR":
            if length != 13:
                raise CaptureError(f"Invalid PNG IHDR length: {path}")
            width, height = struct.unpack(">II", chunk_data[:8])
        elif chunk_type == b"IDAT":
            idat.extend(chunk_data)
        elif chunk_type == b"IEND":
            saw_iend = True
            if crc_end != len(payload):
                raise CaptureError(f"Unexpected bytes after PNG IEND: {path}")
            break
        offset = crc_end

    if not saw_iend or not idat:
        raise CaptureError(f"PNG is missing IDAT or IEND: {path}")
    if (width, height) != expected_size:
        raise CaptureError(
            f"Unexpected dimensions for {path}: expected={expected_size} "
            f"actual={(width, height)}"
        )
    try:
        decompressed = zlib.decompress(bytes(idat))
    except zlib.error as exc:
        raise CaptureError(f"Unreadable PNG pixel payload: {path}: {exc}") from exc
    if len(decompressed) <= height:
        raise CaptureError(f"PNG pixel payload is empty or incomplete: {path}")
    return width, height


def routes_from_evidence_contract() -> tuple[Route, ...]:
    routes: list[Route] = []
    for expected_index, filename in enumerate(ROUTE_FILENAMES, start=1):
        match = ROUTE_PATTERN.fullmatch(filename)
        if match is None:
            raise CaptureError(f"Unparseable ROUTE_FILENAMES entry: {filename}")
        index = int(match.group("index"))
        if index != expected_index:
            raise CaptureError(
                f"Non-contiguous route index: expected={expected_index:02d} "
                f"actual={index:02d} filename={filename}"
            )
        raw_view = match.group("view")
        routes.append(
            Route(
                index=index,
                filename=filename,
                cal=f"CAL-{match.group('cal')}",
                tab=match.group("tab"),
                view="" if raw_view == "root" else raw_view,
            )
        )
    if len(routes) != 36 or len({route.filename for route in routes}) != 36:
        raise CaptureError("Capture contract must contain exactly 36 unique routes")
    return tuple(routes)


def resolve_adb(explicit: Path | None) -> Path:
    candidates: list[Path] = []
    if explicit is not None:
        candidates.append(explicit.expanduser())
    for variable in ("ANDROID_SDK_ROOT", "ANDROID_HOME"):
        value = os.environ.get(variable)
        if value:
            candidates.append(Path(value) / "platform-tools" / "adb.exe")
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        candidates.append(
            Path(local_app_data) / "Android" / "Sdk" / "platform-tools" / "adb.exe"
        )
    path_adb = shutil.which("adb")
    if path_adb:
        candidates.append(Path(path_adb))

    for candidate in candidates:
        resolved = candidate.resolve()
        if resolved.is_file():
            return resolved
    raise CaptureError("adb executable was not found; pass --adb explicitly")


def run_adb(
    adb: Path,
    serial: str,
    arguments: Sequence[str],
    timeout_seconds: float,
) -> str:
    command = [str(adb), "-s", serial, *arguments]
    try:
        completed = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_seconds,
        )
    except subprocess.TimeoutExpired as exc:
        raise CaptureError(
            f"adb command timed out after {timeout_seconds}s: {' '.join(arguments)}"
        ) from exc
    output = "\n".join(part.strip() for part in (completed.stdout, completed.stderr) if part.strip())
    if completed.returncode != 0:
        raise CaptureError(
            f"adb command failed ({completed.returncode}): {' '.join(arguments)}"
            + (f"\n{output}" if output else "")
        )
    return output


def assert_device_ready(adb: Path, serial: str, timeout_seconds: float) -> None:
    try:
        completed = subprocess.run(
            [str(adb), "devices"],
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_seconds,
        )
    except subprocess.TimeoutExpired as exc:
        raise CaptureError("adb devices timed out") from exc
    states = {
        fields[0]: fields[1]
        for line in completed.stdout.splitlines()
        if len(fields := line.split()) >= 2 and not line.startswith("List of devices")
    }
    if states.get(serial) != "device":
        raise CaptureError(
            f"Target serial is not ready: serial={serial} state={states.get(serial, 'missing')}"
        )


def log_line(handle, message: str) -> None:
    timestamp = datetime.now(timezone.utc).isoformat()
    line = f"{timestamp} {message}"
    print(line, flush=True)
    handle.write(line + "\n")
    handle.flush()
    os.fsync(handle.fileno())


def capture(args: argparse.Namespace) -> Path:
    routes = routes_from_evidence_contract()
    adb = resolve_adb(args.adb)
    output_dir = args.output_dir.resolve()
    output_dir.parent.mkdir(parents=True, exist_ok=True)
    if output_dir.exists() and any(output_dir.iterdir()):
        raise CaptureError(
            f"Runtime target must be empty before capture; refusing overwrite: {output_dir}"
        )

    staging_dir = Path(
        tempfile.mkdtemp(prefix=".runtime-capture-", dir=output_dir.parent)
    )
    log_path = staging_dir / "runtime-capture.log"
    remote_path = "/sdcard/novastore-v413-route-capture.png"
    entries: list[dict[str, object]] = []

    try:
        with log_path.open("w", encoding="utf-8", newline="\n") as log:
            log_line(log, f"CAPTURE_START serial={args.serial} package={args.package}")
            log_line(log, f"ADB={adb}")
            log_line(log, f"STAGING_DIR={staging_dir}")
            assert_device_ready(adb, args.serial, args.command_timeout_seconds)

            run_adb(
                adb,
                args.serial,
                ["shell", "am", "force-stop", args.package],
                args.command_timeout_seconds,
            )

            for route in routes:
                # adb shell reparses the remote command. Keep the complete URI in
                # one quoted shell word so '&tab=...' and '&view=...' are not
                # treated as background-command separators on the device.
                start_command = (
                    "am start -W -a android.intent.action.VIEW -d "
                    f"{shlex.quote(route.uri)}"
                )
                start_output = run_adb(
                    adb,
                    args.serial,
                    ["shell", start_command],
                    args.command_timeout_seconds,
                )
                if "Error:" in start_output:
                    raise CaptureError(
                        f"Route {route.index:02d} start returned an error: {start_output}"
                    )
                settle_ms = (
                    args.cold_settle_ms if route.index == 1 else args.settle_ms
                )
                time.sleep(settle_ms / 1000)

                activity_output = run_adb(
                    adb,
                    args.serial,
                    ["shell", "dumpsys", "activity", "activities"],
                    args.command_timeout_seconds,
                )
                top_lines = [
                    line.strip()
                    for line in activity_output.splitlines()
                    if "topResumedActivity" in line
                ]
                if len(top_lines) != 1 or args.component not in top_lines[0]:
                    raise CaptureError(
                        f"Route {route.index:02d} has the wrong top activity: {top_lines}"
                    )
                preview_pid = run_adb(
                    adb,
                    args.serial,
                    ["shell", "pidof", args.package],
                    args.command_timeout_seconds,
                ).strip()
                if not preview_pid.isdigit():
                    raise CaptureError(
                        f"Route {route.index:02d} has no single preview PID: {preview_pid!r}"
                    )

                run_adb(
                    adb,
                    args.serial,
                    ["shell", "screencap", "-p", remote_path],
                    args.command_timeout_seconds,
                )
                destination = staging_dir / route.filename
                run_adb(
                    adb,
                    args.serial,
                    ["pull", remote_path, str(destination)],
                    args.command_timeout_seconds,
                )

                width, height = validate_png(destination, RUNTIME_SIZE)
                file_hash = sha256_file(destination)
                stat = destination.stat()
                entry = {
                    "index": route.index,
                    "cal": route.cal,
                    "tab": route.tab,
                    "view": route.view,
                    "route_uri": route.uri,
                    "filename": route.filename,
                    "package": args.package,
                    "preview_pid": int(preview_pid),
                    "top_resumed_activity": top_lines[0],
                    "width": width,
                    "height": height,
                    "bytes": stat.st_size,
                    "sha256": file_hash,
                    "captured_at_utc": datetime.now(timezone.utc).isoformat(),
                }
                entries.append(entry)
                log_line(
                    log,
                    f"CAPTURED {route.index:02d}/36 {route.filename} "
                    f"pid={preview_pid} bytes={stat.st_size} sha256={file_hash}",
                )

            duplicate_hashes = sorted(
                file_hash
                for file_hash in {entry["sha256"] for entry in entries}
                if sum(entry["sha256"] == file_hash for entry in entries) > 1
            )
            if duplicate_hashes:
                raise CaptureError(
                    f"Duplicate route screenshot hashes detected: {duplicate_hashes}"
                )
            if len(entries) != 36:
                raise CaptureError(f"Expected 36 captures, received {len(entries)}")

            manifest = {
                "schema_version": 1,
                "evidence": "NovaStore V4.13 installed APK exact route capture",
                "serial": args.serial,
                "package": args.package,
                "component": args.component,
                "route_count": len(entries),
                "expected_dimensions": {
                    "width": RUNTIME_SIZE[0],
                    "height": RUNTIME_SIZE[1],
                },
                "filename_contract_source": str(EVIDENCE_SCRIPT),
                "capture_method": "adb screencap to device plus binary-safe adb pull",
                "captured_at_utc": datetime.now(timezone.utc).isoformat(),
                "entries": entries,
            }
            manifest_path = staging_dir / "runtime-route-manifest.json"
            manifest_path.write_text(
                json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
                newline="\n",
            )
            log_line(log, "CAPTURE_COMPLETE route_count=36 unique_sha256=36")

        if output_dir.exists():
            output_dir.rmdir()
        os.replace(staging_dir, output_dir)
        return output_dir
    except Exception:
        print(f"CAPTURE_STAGING_PRESERVED={staging_dir}", file=sys.stderr)
        raise
    finally:
        try:
            run_adb(
                adb,
                args.serial,
                ["shell", "rm", "-f", remote_path],
                args.command_timeout_seconds,
            )
        except Exception:
            pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--serial", help="Exact dedicated customer emulator serial")
    parser.add_argument("--adb", type=Path, help="Path to adb.exe")
    parser.add_argument("--package", default=DEFAULT_PACKAGE)
    parser.add_argument("--component", default=DEFAULT_COMPONENT)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--cold-settle-ms", type=int, default=11_000)
    parser.add_argument("--settle-ms", type=int, default=3_400)
    parser.add_argument("--command-timeout-seconds", type=float, default=25.0)
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="Validate only the shared 36-route filename/parser contract",
    )
    args = parser.parse_args()
    if not args.self_test and not args.serial:
        parser.error("--serial is required unless --self-test is used")
    if args.cold_settle_ms < 0 or args.settle_ms < 0:
        parser.error("settle durations must be non-negative")
    if args.command_timeout_seconds <= 0:
        parser.error("--command-timeout-seconds must be positive")
    return args


def main() -> int:
    args = parse_args()
    try:
        routes = routes_from_evidence_contract()
        if args.self_test:
            print("CAPTURE_CONTRACT_SELF_TEST=PASS")
            print(f"ROUTE_COUNT={len(routes)}")
            print(f"OUTPUT_DIR={DEFAULT_OUTPUT_DIR}")
            return 0
        output_dir = capture(args)
        print("ANDROID_ROUTE_CAPTURE=PASS")
        print("ROUTE_COUNT=36")
        print(f"OUTPUT_DIR={output_dir}")
        return 0
    except CaptureError as exc:
        print(f"ANDROID_ROUTE_CAPTURE=FAIL: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
