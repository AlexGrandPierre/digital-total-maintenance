import sys
import json
import shutil
from pathlib import Path
from datetime import datetime, timezone
from action_history import append_action_history

def strip_app_data_args(args: list[str]) -> list[str]:
    if len(args) >= 2 and args[0] == "--app-data":
        return args[2:]
    return args

def move_to_archive(file_path: str, mode: str = "single") -> dict:
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

    timestamp = datetime.now(timezone.utc).isoformat()

    history_entry = append_action_history(
        action="move_to_archive",
        source_path=str(source),
        destination_path=str(destination),
        mode=mode,
        status="success",
    )

    return {
        "success": True,
        "action": "move_to_archive",
        "path": str(source),
        "destination": str(destination),
        "message": "File moved to DTM Archive.",
        "timestamp": timestamp,
        "history_entry": history_entry,
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "action": "move_to_archive",
            "message": "No file path provided."
        }))
        sys.exit(1)

    args = strip_app_data_args(sys.argv[1:])
    file_path = args[0] if len(args) >= 1 else ""
    mode = args[1] if len(args) >= 2 else "single"

    result = move_to_archive(file_path, mode=mode)
    print(json.dumps(result))
