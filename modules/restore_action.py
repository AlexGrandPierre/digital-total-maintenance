"""
restore_action.py

Restore execution layer for Digital Total Maintenance.

Responsibilities:
- Restore files from previous DTM move actions
- Reconstruct original filesystem destinations
- Prevent filename collisions during restoration
- Record successful restores in action history

This module DOES NOT:
- Classify files
- Decide whether a file should be restored
- Permanently delete files
- Restore actions that were not recorded by DTM

Called by:
Electron IPC and action-history workflows.

Outputs:
Structured restore results including restored paths and history entries.
"""

import sys
import json
import shutil
from pathlib import Path
from datetime import datetime, timezone
from action_history import append_action_history


# =============================================================================
# Argument Parsing
# =============================================================================
def parse_args(args: list[str]) -> dict:
    parsed = {
        "app_data": None,
        "dtm_root": None,
        "remaining": [],
    }

    index = 0

    while index < len(args):
        arg = args[index]

        if arg == "--app-data" and index + 1 < len(args):
            parsed["app_data"] = args[index + 1]
            index += 2
            continue

        if arg == "--dtm-root" and index + 1 < len(args):
            parsed["dtm_root"] = args[index + 1]
            index += 2
            continue

        parsed["remaining"].append(arg)
        index += 1

    return parsed


# =============================================================================
# Restore Execution
# =============================================================================
def restore_from_history(entry: dict) -> dict:
    action = entry.get("action")
    source_path = entry.get("source_path")
    destination_path = entry.get("destination_path")
    mode = entry.get("mode", "single")

    if action not in {"move_to_review", "move_to_archive", "move_to_trash"}:
        return {
            "success": False,
            "action": "restore",
            "message": "Undo is only supported for review, archive, and trash actions."
        }

    if not source_path or not destination_path:
        return {
            "success": False,
            "action": "restore",
            "message": "History entry is missing source or destination path."
        }

    current_location = Path(destination_path).expanduser().resolve()
    original_location = Path(source_path).expanduser().resolve()

    if not current_location.exists():
        return {
            "success": False,
            "action": "restore",
            "path": str(current_location),
            "message": "The file is no longer present in its recorded DTM location."
        }

    if not current_location.is_file():
        return {
            "success": False,
            "action": "restore",
            "path": str(current_location),
            "message": "Undo target is not a file."
        }

    original_location.parent.mkdir(parents=True, exist_ok=True)

    # Resolve a collision-safe restore destination.
    restore_target = original_location

    if restore_target.exists():
        stem = restore_target.stem
        suffix = restore_target.suffix
        counter = 1

        while True:
            candidate = restore_target.parent / f"{stem}_restored_{counter}{suffix}"
            if not candidate.exists():
                restore_target = candidate
                break
            counter += 1

    shutil.move(str(current_location), str(restore_target))

    if action == "move_to_review":
        restore_action_name = "restore_from_review"
    elif action == "move_to_archive":
        restore_action_name = "restore_from_archive"
    else:
        restore_action_name = "restore_from_trash"

    timestamp = datetime.now(timezone.utc).isoformat()

    history_entry = append_action_history(
        action=restore_action_name,
        source_path=str(current_location),
        destination_path=str(restore_target),
        mode=mode,
        status="success",
        reverts_history_id=entry.get("id"),
    )

    return {
        "success": True,
        "action": restore_action_name,
        "path": str(current_location),
        "destination": str(restore_target),
        "message": "File restored successfully.",
        "timestamp": timestamp,
        "history_entry": history_entry,
    }


# =============================================================================
# CLI Entry Point
# =============================================================================
if __name__ == "__main__":
    parsed = parse_args(sys.argv[1:])
    args = parsed["remaining"]

    if len(args) < 1:
        print(json.dumps({
            "success": False,
            "action": "restore",
            "message": "No history entry provided."
        }))
        sys.exit(1)

    try:
        entry = json.loads(args[0])
    except Exception as e:
        print(json.dumps({
            "success": False,
            "action": "restore",
            "message": f"Invalid history entry payload: {str(e)}"
        }))
        sys.exit(1)

    try:
        result = restore_from_history(entry)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({
            "success": False,
            "action": "restore",
            "message": f"Restore script error: {str(e)}"
        }))
        sys.exit(1)
