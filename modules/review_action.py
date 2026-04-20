import os
import sys
import json
import shutil
from pathlib import Path
from datetime import datetime, timezone
from action_history import append_action_history


def move_to_review(file_path: str, mode: str = "single") -> dict:
    source = Path(file_path).expanduser().resolve()
    review_dir = Path.home() / "Desktop" / "DTM Review"

    if not source.exists():
        return {
            "success": False,
            "action": "move_to_review",
            "path": str(source),
            "message": "File does not exist."
        }

    if not source.is_file():
        return {
            "success": False,
            "action": "move_to_review",
            "path": str(source),
            "message": "Target is not a file."
        }

    review_dir.mkdir(parents=True, exist_ok=True)

    destination = review_dir / source.name

    if destination.exists():
        stem = destination.stem
        suffix = destination.suffix
        counter = 1

        while True:
            candidate = review_dir / f"{stem}_{counter}{suffix}"
            if not candidate.exists():
                destination = candidate
                break
            counter += 1

    shutil.move(str(source), str(destination))

    timestamp = datetime.now(timezone.utc).isoformat()

    history_entry = append_action_history(
        action="move_to_review",
        source_path=str(source),
        destination_path=str(destination),
        mode=mode,
        status="success",
    )

    return {
        "success": True,
        "action": "move_to_review",
        "path": str(source),
        "destination": str(destination),
        "message": "File moved to DTM Review.",
        "timestamp": timestamp,
        "history_entry": history_entry,
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "action": "move_to_review",
            "message": "No file path provided."
        }))
        sys.exit(1)

    file_path = sys.argv[1]
    mode = sys.argv[2] if len(sys.argv) > 2 else "single"

    result = move_to_review(file_path, mode=mode)
    print(json.dumps(result))
