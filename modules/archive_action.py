"""
archive_action.py

Archive execution layer for Digital Total Maintenance.

Responsibilities:
- Move files into the DTM Archive
- Prevent destination filename collisions
- Support single and batch archive actions
- Record successful moves in action history

This module DOES NOT:
- Classify files
- Decide whether a file should be archived
- Delete files
- Restore archived files

Called by:
Electron IPC and batch filesystem actions.

Outputs:
Structured action results including destination paths and history entries.
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
# Archive Path Helpers
# =============================================================================
def get_dtm_root(dtm_root=None) -> Path:
    if dtm_root:
        return Path(dtm_root).expanduser().resolve()

    return Path.home() / "Desktop" / "Digital Total Maintenance"


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
# Archive Execution
# =============================================================================
def move_one_to_archive(file_path: str, dtm_root=None, mode: str = "single") -> dict:
    source = Path(file_path).expanduser().resolve()
    archive_dir = get_dtm_root(dtm_root) / "Archive"

    if not source.exists():
        return {
            "success": False,
            "action": "move_to_archive",
            "path": str(source),
            "message": "File does not exist.",
        }

    if not source.is_file():
        return {
            "success": False,
            "action": "move_to_archive",
            "path": str(source),
            "message": "Target is not a file.",
        }

    archive_dir.mkdir(parents=True, exist_ok=True)
    archive_destination = unique_destination(archive_dir, source.name)

    shutil.move(str(source), str(archive_destination))

    history_entry = append_action_history(
        action="move_to_archive",
        source_path=str(source),
        destination_path=str(archive_destination),
        mode=mode,
        status="success",
    )

    return {
        "success": True,
        "action": "move_to_archive",
        "path": str(source),
        "destination": str(archive_destination),
        "message": "File moved to DTM Archive.",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "history_entry": history_entry,
    }


def move_to_archive(file_path: str, dtm_root=None, mode: str = "single") -> dict:
    if mode == "batch":
        try:
            file_paths = json.loads(file_path)
        except Exception:
            file_paths = []

        results = [
            move_one_to_archive(path, dtm_root=dtm_root, mode="batch")
            for path in file_paths
        ]

        succeeded = sum(1 for result in results if result.get("success"))
        failed = len(results) - succeeded

        return {
            "success": failed == 0,
            "partial_success": succeeded > 0 and failed > 0,
            "action": "move_to_archive",
            "mode": "batch",
            "succeeded": succeeded,
            "failed": failed,
            "results": results,
            "message": f"Batch archive action completed: {succeeded} succeeded, {failed} failed.",
        }

    return move_one_to_archive(file_path, dtm_root=dtm_root, mode=mode)


# =============================================================================
# CLI Entry Point
# =============================================================================
if __name__ == "__main__":
    parsed = parse_args(sys.argv[1:])
    args = parsed["remaining"]

    file_path = args[0] if len(args) >= 1 else ""
    mode = args[1] if len(args) >= 2 else "single"

    result = move_to_archive(
        file_path,
        dtm_root=parsed["dtm_root"],
        mode=mode,
    )

    print(json.dumps(result))