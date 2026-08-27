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


import sys
import json
from filesystem_actions.core import (
    execute_single_move,
    get_trash_dir,
    parse_action_args as parse_args,
    unique_destination,
)


# =============================================================================
# Trash Execution
# =============================================================================
def move_one_to_trash(file_path, dtm_root=None, mode="single") -> dict:
    trash_dir = get_trash_dir(dtm_root)

    return execute_single_move(
        file_path,
        destination_dir=trash_dir,
        history_action="move_to_trash",
        success_message="File moved to Trash.",
        mode=mode,
    )


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
