import sys
import json
import shutil
from pathlib import Path
from datetime import datetime, timezone


def move_to_archive(file_path: str) -> dict:
    source = Path(file_path).expanduser().resolve()
    archive_dir = Path.home() / "Desktop" / "DTM Archive"

    if not source.exists():
        return {
            "success": False,
            "action": "move_to_archive",
            "path": str(source),
            "message": "File does not exist."
        }

    if not source.is_file():
        return {
            "success": False,
            "action": "move_to_archive",
            "path": str(source),
            "message": "Target is not a file."
        }

    archive_dir.mkdir(parents=True, exist_ok=True)
    destination = archive_dir / source.name

    if destination.exists():
        stem = destination.stem
        suffix = destination.suffix
        counter = 1
        while True:
            candidate = archive_dir / f"{stem}_{counter}{suffix}"
            if not candidate.exists():
                destination = candidate
                break
            counter += 1

    shutil.move(str(source), str(destination))

    return {
        "success": True,
        "action": "move_to_archive",
        "path": str(source),
        "destination": str(destination),
        "message": "File moved to DTM Archive.",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "action": "move_to_archive",
            "message": "No file path provided."
        }))
        sys.exit(1)

    result = move_to_archive(sys.argv[1])
    print(json.dumps(result))
