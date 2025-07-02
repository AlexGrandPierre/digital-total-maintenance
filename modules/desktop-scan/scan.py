import os
import json
from datetime import datetime

desktop_path = os.path.expanduser("~/Desktop")

summary = {
    "scanned_at": datetime.utcnow().isoformat() + "Z",
    "folder": desktop_path,
    "total_files": 0,
    "file_types": {},
    "duplicates": [],
    "age_summary": {
        "under_30_days": 0,
        "over_180_days": 0
    }
}

signatures = {}

for root, _, files in os.walk(desktop_path):
    for file in files:
        full_path = os.path.join(root, file)
        summary["total_files"] += 1

        ext = os.path.splitext(file)[1].lower() or "no_extension"
        summary["file_types"][ext] = summary["file_types"].get(ext, 0) + 1

        try:
            mtime = os.path.getmtime(full_path)
            days = (datetime.utcnow() - datetime.utcfromtimestamp(mtime)).days
            if days < 30:
                summary["age_summary"]["under_30_days"] += 1
            if days > 180:
                summary["age_summary"]["over_180_days"] += 1
        except: pass

        try:
            size = os.path.getsize(full_path)
            sig = (file, size)
            if sig in signatures:
                summary["duplicates"].append(full_path)
            else:
                signatures[sig] = full_path
        except: pass

print(json.dumps(summary, indent=2))
