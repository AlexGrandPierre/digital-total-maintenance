import os
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_TARGET = os.path.expanduser("~/Desktop")


def is_suspicious(filename: str) -> bool:
    suspicious_exts = {'.dmg', '.zip', '.pkg', '.exe', '.msi', '.part', '.tmp', '.log'}
    name = filename.lower()
    ext = os.path.splitext(name)[1]
    return (
        ext in suspicious_exts
        or name.startswith("~")
        or name.endswith(".ds_store")
    )


def get_age_days(mtime: float) -> int:
    now = datetime.now(timezone.utc)
    modified = datetime.fromtimestamp(mtime, timezone.utc)
    return (now - modified).days


def scan_folder(target_dir: str) -> dict:
    files = []
    signatures = {}
    duplicates = []

    for root, _, filenames in os.walk(target_dir):
        for filename in filenames:
            full_path = os.path.join(root, filename)

            try:
                stat = os.stat(full_path)
                size = stat.st_size
                age_days = get_age_days(stat.st_mtime)
                ext = os.path.splitext(filename)[1].lower() or "no_ext"
                suspicious = is_suspicious(filename)

                entry = {
                    "name": filename,
                    "path": full_path,
                    "size": size,
                    "age_days": age_days,
                    "ext": ext,
                    "suspicious": suspicious,
                    "hash": None,  # paused for dev speed
                }

                # fast duplicate heuristic for dev mode
                sig = (filename.lower(), size)
                if sig in signatures:
                    duplicates.append([signatures[sig], full_path])
                else:
                    signatures[sig] = full_path

                files.append(entry)

            except Exception as e:
                files.append({
                    "name": filename,
                    "path": full_path,
                    "error": str(e),
                })

    by_ext = {}
    suspicious_files = []

    for f in files:
        ext = f.get("ext")
        if ext:
            by_ext[ext] = by_ext.get(ext, 0) + 1
        if f.get("suspicious"):
            suspicious_files.append(f)

    result = {
        "scanned_at": datetime.now(timezone.utc).isoformat(),
        "folder": target_dir,
        "mode": "dev-fast",
        "total_files": len([f for f in files if "error" not in f]),
        "files": files,
        "suspicious_files": suspicious_files,
        "duplicates": duplicates,
        "age_buckets": {
            "<30d": sum(1 for f in files if f.get("age_days", -1) >= 0 and f["age_days"] < 30),
            "30-180d": sum(1 for f in files if f.get("age_days", -1) >= 30 and f["age_days"] <= 180),
            ">180d": sum(1 for f in files if f.get("age_days", -1) > 180),
        },
        "by_ext": dict(sorted(by_ext.items(), key=lambda item: item[1], reverse=True)),
        "errors": [f for f in files if "error" in f],
    }

    return result


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_TARGET
    target = str(Path(target).expanduser())

    print(json.dumps(scan_folder(target), indent=2))
