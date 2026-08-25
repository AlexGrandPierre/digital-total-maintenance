"""
review_action.py

Review execution layer for Digital Total Maintenance.

Responsibilities:
- Move files into the DTM Review workspace
- Prevent destination filename collisions
- Support single and batch review actions
- Record successful moves in action history

This module DOES NOT:
- Classify files
- Decide whether a file should be reviewed
- Delete files
- Restore reviewed files

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
# Review Path Helpers
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
# Review Execution
# =============================================================================
def move_one_to_review(file_path: str, dtm_root=None, mode: str = "single") -> dict:
    source = Path(file_path).expanduser().resolve()
    review_dir = get_dtm_root(dtm_root) / "Review"

    if not source.exists():
        return {
            "success": False,
            "action": "move_to_review",
            "path": str(source),
            "message": "File does not exist.",
        }

    if not source.is_file():
        return {
            "success": False,
            "action": "move_to_review",
            "path": str(source),
            "message": "Target is not a file.",
        }

    review_dir.mkdir(parents=True, exist_ok=True)
    review_destination = unique_destination(review_dir, source.name)

    shutil.move(str(source), str(review_destination))

    history_entry = append_action_history(
        action="move_to_review",
        source_path=str(source),
        destination_path=str(review_destination),
        mode=mode,
        status="success",
    )

    return {
        "success": True,
        "action": "move_to_review",
        "path": str(source),
        "destination": str(review_destination),
        "message": "File moved to DTM Review.",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "history_entry": history_entry,
    }


def move_to_review(file_path: str, dtm_root=None, mode: str = "single") -> dict:
    if mode == "batch":
        try:
            file_paths = json.loads(file_path)
        except Exception:
            file_paths = []

        results = [
            move_one_to_review(path, dtm_root=dtm_root, mode="batch")
            for path in file_paths
        ]

        succeeded = sum(1 for result in results if result.get("success"))
        failed = len(results) - succeeded

        return {
            "success": failed == 0,
            "partial_success": succeeded > 0 and failed > 0,
            "action": "move_to_review",
            "mode": "batch",
            "succeeded": succeeded,
            "failed": failed,
            "results": results,
            "message": f"Batch review action completed: {succeeded} succeeded, {failed} failed.",
        }

    return move_one_to_review(file_path, dtm_root=dtm_root, mode=mode)


# =============================================================================
# CLI Entry Point
# =============================================================================
if __name__ == "__main__":
    parsed = parse_args(sys.argv[1:])
    args = parsed["remaining"]

    file_path = args[0] if len(args) >= 1 else ""
    mode = args[1] if len(args) >= 2 else "single"

    result = move_to_review(
        file_path,
        dtm_root=parsed["dtm_root"],
        mode=mode,
    )

    print(json.dumps(result))