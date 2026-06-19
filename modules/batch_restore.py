import argparse
import json
import shutil
from pathlib import Path
from typing import Any

from action_history import append_action_history


RESTORABLE_ACTIONS = {
    "move_to_review": "restore_from_review",
    "move_to_archive": "restore_from_archive",
    "move_to_trash": "restore_from_trash",
}


def safe_result(success: bool, message: str, **extra: Any) -> dict:
    return {"success": success, "message": message, **extra}


def unique_restore_target(original_location: Path) -> Path:
    if not original_location.exists():
        return original_location

    stem = original_location.stem
    suffix = original_location.suffix
    counter = 1

    while True:
        candidate = original_location.parent / f"{stem}_restored_{counter}{suffix}"
        if not candidate.exists():
            return candidate
        counter += 1


def restore_one_entry(entry: dict) -> dict:
    if not isinstance(entry, dict):
        return safe_result(False, "Invalid history entry.")

    action = entry.get("action")
    restore_action_name = RESTORABLE_ACTIONS.get(action)

    if not restore_action_name:
        return safe_result(
            False,
            "Undo is only supported for review, archive, and trash actions.",
            action="restore",
            original_action=action,
            history_id=entry.get("id"),
        )

    source_path = entry.get("source_path")
    destination_path = entry.get("destination_path")
    mode = entry.get("mode", "bulk")

    if not source_path or not destination_path:
        return safe_result(
            False,
            "History entry is missing source or destination path.",
            action="restore",
            original_action=action,
            history_id=entry.get("id"),
        )

    current_location = Path(destination_path).expanduser().resolve()
    original_location = Path(source_path).expanduser().resolve()

    if not current_location.exists():
        return safe_result(
            False,
            "The file is no longer present in its recorded DTM location.",
            action=restore_action_name,
            path=str(current_location),
            source_path=str(current_location),
            destination_path=str(original_location),
            history_id=entry.get("id"),
        )

    if not current_location.is_file():
        return safe_result(
            False,
            "Undo target is not a file.",
            action=restore_action_name,
            path=str(current_location),
            source_path=str(current_location),
            destination_path=str(original_location),
            history_id=entry.get("id"),
        )

    try:
        original_location.parent.mkdir(parents=True, exist_ok=True)
        restore_target = unique_restore_target(original_location)

        shutil.move(str(current_location), str(restore_target))

        history_entry = append_action_history(
            action=restore_action_name,
            source_path=str(current_location),
            destination_path=str(restore_target),
            mode=mode,
            status="success",
            reverts_history_id=entry.get("id"),
        )

        return safe_result(
            True,
            "File restored successfully.",
            action=restore_action_name,
            path=str(current_location),
            source_path=str(current_location),
            destination=str(restore_target),
            destination_path=str(restore_target),
            restored_from_history_id=entry.get("id"),
            history_entry=history_entry,
        )

    except Exception as error:
        try:
            append_action_history(
                action=restore_action_name,
                source_path=str(current_location),
                destination_path=str(original_location),
                mode=mode,
                status="error",
                reverts_history_id=entry.get("id"),
            )
        except Exception:
            pass

        return safe_result(
            False,
            str(error),
            action=restore_action_name,
            path=str(current_location),
            source_path=str(current_location),
            destination_path=str(original_location),
            restored_from_history_id=entry.get("id"),
        )


def run_batch_restore(payload: dict) -> dict:
    entries = payload.get("entries") or []
    mode = payload.get("mode") or "bulk"

    if not isinstance(entries, list) or not entries:
        return safe_result(False, "No history entries provided for batch restore.")

    normalized_entries = []

    for entry in entries:
        if isinstance(entry, dict):
            normalized = {**entry, "mode": mode}
            normalized_entries.append(normalized)

    if not normalized_entries:
        return safe_result(False, "No valid history entries provided for batch restore.")

    results = [restore_one_entry(entry) for entry in normalized_entries]

    success_count = sum(1 for item in results if item.get("success"))
    failure_count = len(results) - success_count

    return {
        "success": failure_count == 0,
        "partial_success": success_count > 0 and failure_count > 0,
        "message": (
            f"Batch restore complete: {success_count} file(s) restored."
            if failure_count == 0
            else f"Batch restore finished with partial success: {success_count} succeeded, {failure_count} failed."
        ),
        "action": "batch_restore",
        "mode": mode,
        "total": len(results),
        "success_count": success_count,
        "failure_count": failure_count,
        "results": results,
    }


def load_payload(args: argparse.Namespace) -> dict:
    if args.payload_file:
        with open(args.payload_file, "r", encoding="utf-8") as file:
            return json.load(file)

    if args.payload_json:
        return json.loads(args.payload_json)

    return {}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--app-data", required=True)
    parser.add_argument("--dtm-root", required=True)
    parser.add_argument("--payload-file", required=False)
    parser.add_argument("payload_json", nargs="?", default="{}")
    args = parser.parse_args()

    try:
        payload = load_payload(args)
        print(json.dumps(run_batch_restore(payload)))
    except Exception as error:
        print(json.dumps({"success": False, "message": str(error)}))


if __name__ == "__main__":
    main()