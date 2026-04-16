from datetime import datetime
print(f"📡 Starting scan at {datetime.utcnow().isoformat()}Z")

import os
import json
import hashlib
from datetime import datetime, timezone

DESKTOP_DIR = os.path.expanduser("~/Desktop")

def is_suspicious(file):
    suspicious_exts = ['.dmg', '.zip', '.pkg', '.exe', '.msi', '.part']
    name = file.lower()
    return any(name.endswith(ext) for ext in suspicious_exts) or name.startswith("~") or name.endswith(".DS_Store")

def get_age_days(mtime):
    return (datetime.now(timezone.utc) - datetime.fromtimestamp(mtime, timezone.utc)).days

def hash_file(path):
    try:
        with open(path, "rb") as f:
            return hashlib.md5(f.read()).hexdigest()
    except Exception:
        return None

def walk_desktop():
    file_data = []
    hashes = {}
    duplicates = []

    for root, dirs, files in os.walk(DESKTOP_DIR):
        for file in files:
            try:
                full_path = os.path.join(root, file)
                stat = os.stat(full_path)
                size = stat.st_size
                mtime = stat.st_mtime
                age = get_age_days(mtime)
                ext = os.path.splitext(file)[1].lower() or "no_ext"
                is_sus = is_suspicious(file)
                file_hash = None #hash_file(full_path)

                entry = {
                    "name": file,
                    "path": full_path,
                    "size": size,
                    "age_days": age,
                    "ext": ext,
                    "suspicious": is_sus,
                    "hash": file_hash,
                }

                if file_hash:
                    if file_hash in hashes:
                        duplicates.append((hashes[file_hash], full_path))
                    else:
                        hashes[file_hash] = full_path

                file_data.append(entry)
            except Exception:
                continue

    return file_data, duplicates

if __name__ == "__main__":
    files, dups = walk_desktop()

    result = {
        "scanned_at": datetime.now(timezone.utc).isoformat(),
        "folder": DESKTOP_DIR,
        "total_files": len(files),
        "suspicious_files": [f for f in files if f["suspicious"]],
        "duplicates": dups,
        "age_buckets": {
            "<30d": sum(1 for f in files if f["age_days"] < 30),
            "30-180d": sum(1 for f in files if 30 <= f["age_days"] <= 180),
            ">180d": sum(1 for f in files if f["age_days"] > 180),
        },
        "by_ext": {},
    }

    for f in files:
        ext = f["ext"]
        result["by_ext"][ext] = result["by_ext"].get(ext, 0) + 1

    print(json.dumps(result, indent=2))
