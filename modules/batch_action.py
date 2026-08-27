"""
batch_action.py

Batch execution engine for Digital Total Maintenance.

Responsibilities:
- Execute bulk filesystem actions
- Coordinate archive, review, and trash operations
- Record action history
- Produce batch execution summaries

This module DOES NOT:
- Classify files
- Decide recommended actions
- Scan folders
- Restore previous actions

Called by:
Electron IPC batch actions.

Outputs:
Structured batch execution results and per-file outcomes.
"""

import argparse
import json
from pathlib import Path
from typing import Any

from action_history import append_action_history
from filesystem_actions.core import (
    execute_prepared_move,
    get_trash_dir,
    unique_destination,
)


# =============================================================================
# Configuration
# =============================================================================
SUPPORTED_ACTIONS = {"review", "archive", "remove"}


# =============================================================================
# Batch Utility Helpers
# =============================================================================
def safe_result(success: bool, message: str, **extra: Any) -> dict:
    return {"success": success, "message": message, **extra}


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


# =============================================================================
# Action Configuration
# =============================================================================
def get_action_config(action: str, dtm_root: Path) -> dict:
    if action == "review":
        return {
            "history_action": "move_to_review",
            "target_dir": ensure_dir(dtm_root / "Review"),
            "message": "File moved to DTM Review.",
        }

    if action == "archive":
        return {
            "history_action": "move_to_archive",
            "target_dir": ensure_dir(dtm_root / "Archive"),
            "message": "File moved to DTM Archive.",
        }

    if action == "remove":
        return {
            "history_action": "move_to_trash",
            "target_dir": ensure_dir(get_trash_dir()),
            "message": "File moved to Trash.",
        }

    raise ValueError(f"Unsupported action: {action}")


# =============================================================================
# Batch File Execution
# =============================================================================
def move_one_file(action: str, file_path: str, dtm_root: Path, mode: str) -> dict:
    if not file_path or not isinstance(file_path, str):
        return safe_result(False, "Invalid file path.", source_path=file_path, path=file_path)

    source = Path(file_path).expanduser().resolve()

    if not source.exists():
        return safe_result(
            False,
            "File does not exist.",
            action=get_action_config(action, dtm_root)["history_action"],
            source_path=str(source),
            path=str(source),
        )

    if not source.is_file():
        return safe_result(
            False,
            "Target is not a file.",
            action=get_action_config(action, dtm_root)["history_action"],
            source_path=str(source),
            path=str(source),
        )

    config = get_action_config(action, dtm_root)
    action_destination = unique_destination(config["target_dir"], source.name)

    try:
        execution = execute_prepared_move(
            source,
            action_destination,
            history_action=config["history_action"],
            mode=mode,
        )

        return safe_result(
            True,
            config["message"],
            action=config["history_action"],
            path=str(source),
            source_path=str(source),
            destination=str(action_destination),
            destination_path=str(action_destination),
            history_entry=execution["history_entry"],
        )

    except Exception as error:
        try:
            append_action_history(
                action=config["history_action"],
                source_path=str(source),
                destination_path=str(action_destination),
                mode=mode,
                status="error",
            )
        except Exception:
            pass

        return safe_result(
            False,
            str(error),
            action=config["history_action"],
            path=str(source),
            source_path=str(source),
            destination=str(action_destination),
            destination_path=str(action_destination),
        )


def run_batch(payload: dict, dtm_root: Path) -> dict:
    action = payload.get("action")
    paths = payload.get("paths") or []
    mode = payload.get("mode") or "bulk"

    if action not in SUPPORTED_ACTIONS:
        return safe_result(False, f"Unsupported batch action: {action}")

    if not isinstance(paths, list) or not paths:
        return safe_result(False, "No file paths provided for batch action.")

    results = [move_one_file(action, path, dtm_root, mode) for path in paths]

    success_count = sum(1 for item in results if item.get("success"))
    failure_count = len(results) - success_count

    ACTION_LABELS = {
        "review": "sent to review",
        "archive": "archived",
        "remove": "moved to Trash",
        }

    action_label = ACTION_LABELS[action]

    return {
        "success": failure_count == 0,
        "partial_success": success_count > 0 and failure_count > 0,
        "message": (
            f"Batch action complete: {success_count} file(s) {action_label}."
            if failure_count == 0
            else f"Batch action finished with partial success: {success_count} succeeded, {failure_count} failed."
        ),
        "action": action,
        "mode": mode,
        "total": len(results),
        "success_count": success_count,
        "failure_count": failure_count,
        "results": results,
    }


# =============================================================================
# Payload Loading
# =============================================================================
def load_payload(args: argparse.Namespace) -> dict:
    if args.payload_file:
        with open(args.payload_file, "r", encoding="utf-8") as file:
            return json.load(file)

    if args.payload_json:
        return json.loads(args.payload_json)

    return {}


# =============================================================================
# CLI Entry Point
# =============================================================================
def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--app-data", required=True)
    parser.add_argument("--dtm-root", required=True)
    parser.add_argument("--payload-file", required=False)
    parser.add_argument("payload_json", nargs="?", default="{}")
    args = parser.parse_args()

    try:
        payload = load_payload(args)
        dtm_root = Path(args.dtm_root).expanduser().resolve()
        print(json.dumps(run_batch(payload, dtm_root)))
    except Exception as error:
        print(json.dumps({"success": False, "message": str(error)}))


if __name__ == "__main__":
    main()
