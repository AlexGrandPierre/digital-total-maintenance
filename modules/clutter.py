# modules/desktop-scan/clutter.py

import os
import json
from datetime import datetime

# Optionally import functions from scan.py if you want to reuse scan output
from scan import scan_desktop  # You can modularize scan.py to support this

def detect_clutter(report):
    clutter_report = {
        "total_files": report["total_files"],
        "delete_candidates": [],
        "archive_candidates": [],
        "manual_review": [],
    }

    for path in report["all_files"]:
        ext = os.path.splitext(path)[-1].lower()
        days_old = report["file_days"].get(path, 0)

        # Simple rules to start
        if ext in ['.log', '.tmp', '.aux'] and days_old > 30:
            clutter_report["delete_candidates"].append(path)
        elif ext in ['.zip', '.tar', '.7z'] and days_old > 60:
            clutter_report["archive_candidates"].append(path)
        elif ext in ['.exe', '.sh', '.bat'] and days_old > 180:
            clutter_report["manual_review"].append(path)

    return clutter_report

if __name__ == "__main__":
    print(f"🧹 Running smart clutter analysis at {datetime.utcnow().isoformat()}Z")

    scan_output_path = os.path.join(os.path.dirname(__file__), "report.json")
    with open(scan_output_path, "r") as f:
        report = json.load(f)

    result = detect_clutter(report)
    print(json.dumps(result, indent=2))
