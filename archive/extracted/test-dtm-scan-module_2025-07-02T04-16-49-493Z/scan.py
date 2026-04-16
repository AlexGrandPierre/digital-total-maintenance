import os
import json
from pathlib import Path
from datetime import datetime

# Configuration
SCAN_DIRS = [str(Path.home() / "Downloads"), str(Path.home() / "Desktop")]
OUTPUT_FILE = Path(__file__).parent / "scan-report.json"

# Helpers
def classify(ext):
    ext = ext.lower()
    if ext in ['.exe', '.dmg', '.pkg']: return 'installer'
    if ext in ['.pdf', '.docx', '.txt']: return 'document'
    if ext in ['.jpg', '.png', '.gif']: return 'image'
    if ext in ['.zip', '.rar']: return 'archive'
    if ext in ['.mp4', '.mov']: return 'video'
    return 'other'

def scan_folder(folder):
    data = []
    for root, _, files in os.walk(folder):
        for file in files:
            path = Path(root) / file
            try:
                stat = path.stat()
                data.append({
                    "path": str(path),
                    "name": path.name,
                    "extension": path.suffix,
                    "type": classify(path.suffix),
                    "size_bytes": stat.st_size,
                    "last_modified": datetime.utcfromtimestamp(stat.st_mtime).isoformat() + "Z"
                })
            except Exception as e:
                data.append({
                    "path": str(path),
                    "error": str(e)
                })
    return data

# Main
all_results = []
for folder in SCAN_DIRS:
    if os.path.exists(folder):
        all_results.extend(scan_folder(folder))

with open(OUTPUT_FILE, "w") as f:
    json.dump(all_results, f, indent=2)

print(f"Scan complete. {len(all_results)} files written to", OUTPUT_FILE)
