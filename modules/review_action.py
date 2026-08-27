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
from filesystem_actions.core import (
    execute_single_move,
    get_dtm_root,
    parse_action_args as parse_args,
    unique_destination,
)


# =============================================================================
# Review Execution
# =============================================================================
def move_one_to_review(file_path: str, dtm_root=None, mode: str = "single") -> dict:
    review_dir = get_dtm_root(dtm_root) / "Review"

    return execute_single_move(
        file_path,
        destination_dir=review_dir,
        history_action="move_to_review",
        success_message="File moved to DTM Review.",
        mode=mode,
    )


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
