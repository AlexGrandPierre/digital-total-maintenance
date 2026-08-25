"""
trash_action.py

Trash execution layer for Digital Total Maintenance.

Responsibilities:
- Move files into the operating system trash location
- Prevent destination filename collisions
- Support single and batch trash actions
- Record successful moves in action history

This module DOES NOT:
- Classify files
- Decide whether a file should be removed
- Permanently delete files
- Restore trashed files

Called by:
Electron IPC and batch filesystem actions.

Outputs:
Structured action results including destination paths and history entries.
"""


import os
import sys
import json
import shutil
import platform
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
# Trash Path Helpers
# =============================================================================
def get_trash_dir(dtm_root=None):
    system = platform.system().lower()

    if system == "darwin":
        return Path.home() / ".Trash"

    if system == "windows":
        return Path.home() / "Desktop" / "Digital Total Maintenance" / "Trash Review"

    return Path.home() / ".local" / "share" / "Trash" / "files"


def unique_destination(directory: Path, filename: str) -> Path:
    destination = directory / filename

    if not destination.exists():
        return destination

    stem = destination.stem
    suffix = destination.suffix
    counter = 1

    while True:
        candidate = directory / f"{stem}_{counter}{suffix}"

        if not candidate.exists():
            return candidate

        counter += 1


# =============================================================================
# Trash Execution
# =============================================================================
def move_one_to_trash(file_path, dtm_root=None, mode="single") -> dict:
    source = Path(file_path).expanduser().resolve()
    trash_dir = get_trash_dir(dtm_root)

    if not source.exists():
        return {
            "success": False,
            "action": "move_to_trash",
            "path": str(source),
            "message": "File does not exist.",
        }

    if not source.is_file():
        return {
            "success": False,
            "action": "move_to_trash",
            "path": str(source),
            "message": "Target is not a file.",
        }

    trash_dir.mkdir(parents=True, exist_ok=True)
    trash_destination = unique_destination(trash_dir, source.name)

    shutil.move(str(source), str(trash_destination))

    history_entry = append_action_history(
        action="move_to_trash",
        source_path=str(source),
        destination_path=str(trash_destination),
        mode=mode,
        status="success",
    )

    return {
        "success": True,
        "action": "move_to_trash",
        "path": str(source),
        "destination": str(trash_destination),
        "message": "File moved to Trash.",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "history_entry": history_entry,
    }


def move_to_trash(file_path, dtm_root=None, mode="single") -> dict:
    if mode == "batch":
        try:
            file_paths = json.loads(file_path)
        except Exception:
            file_paths = []

        results = [
            move_one_to_trash(
                path,
                dtm_root=dtm_root,
                mode="batch",
            )
            for path in file_paths
        ]

        succeeded = sum(1 for result in results if result.get("success"))
        failed = len(results) - succeeded

        return {
            "success": failed == 0,
            "partial_success": succeeded > 0 and failed > 0,
            "action": "move_to_trash",
            "mode": "batch",
            "succeeded": succeeded,
            "failed": failed,
            "results": results,
            "message": f"Batch trash action completed: {succeeded} succeeded, {failed} failed.",
        }

    return move_one_to_trash(
        file_path,
        dtm_root=dtm_root,
        mode=mode,
    )


# =============================================================================
# CLI Entry Point
# =============================================================================
if __name__ == "__main__":
    parsed = parse_args(sys.argv[1:])
    args = parsed["remaining"]

    file_path = args[0] if len(args) >= 1 else ""
    mode = args[1] if len(args) >= 2 else "single"

    result = move_to_trash(file_path, dtm_root=parsed["dtm_root"], mode=mode,)

    print(json.dumps(result))