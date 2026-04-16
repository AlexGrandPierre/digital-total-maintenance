import os
import json
import hashlib
from pathlib import Path
from datetime import datetime

desktop = Path.home() / "Desktop"
report = {
    "scanned_at": datetime.utcnow().isoformat() + "Z",
    "folder": str(desktop),
    "total_files": 0,
    "file_types": {},
    "suspicious_files": [],
    "file_age_summary": {
        "newer_than_30_days": 0,
        "older_than_180_days": 0
    },
    "duplicates": []
}

seen = {}

def hash_file(path):
    try:
        with open(path, 'rb') as f:
            return hashlib.md5(f.read()).hexdigest()
    except Exception:
        return None

if desktop.exists():
    for file in desktop.rglob("*"):
        if file.is_file():
            report["total_files"] += 1
            ext = file.suffix.lower() or "no_extension"
            report["file_types"][ext] = report["file_types"].get(ext, 0) + 1

            # Suspicious extensions
            if ext in ['.dmg', '.pkg', '.zip', '.tmp', '.log']:
                report["suspicious_files"].append(str(file))

            # Age classification
            try:
                mtime = file.stat().st_mtime
                days_old = (datetime.utcnow() - datetime.utcfromtimestamp(mtime)).days
                if days_old < 30:
                    report["file_age_summary"]["newer_than_30_days"] += 1
                if days_old > 180:
                    report["file_age_summary"]["older_than_180_days"] += 1
            except Exception:
                pass

            # Duplicate detection by name and size
            sig = (file.name, file.stat().st_size)
            if sig in seen:
                report["duplicates"].append(str(file))
            else:
                seen[sig] = file

print(json.dumps(report, indent=2))
