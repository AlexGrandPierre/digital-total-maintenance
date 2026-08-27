"""
core.py

Shared execution mechanisms for DTM filesystem move actions.

Responsibilities:
- Parse the common filesystem-action CLI path arguments
- Resolve DTM and operating-system Trash destinations
- Validate file sources and select collision-safe destinations
- Execute successful moves and record their action history
- Construct the existing single-action result contract

This module DOES NOT:
- Choose actions for users
- Define batch failure or summary behavior
- Restore files
- Redesign platform Trash policy
"""

import platform
import shutil
from datetime import datetime, timezone
from pathlib import Path

from action_history import append_action_history


def parse_action_args(args: list[str]) -> dict:
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


def get_dtm_root(dtm_root=None) -> Path:
    if dtm_root:
        return Path(dtm_root).expanduser().resolve()

    return Path.home() / "Desktop" / "Digital Total Maintenance"


def get_trash_dir(dtm_root=None) -> Path:
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


def get_source_error(source: Path) -> str | None:
    if not source.exists():
        return "File does not exist."

    if not source.is_file():
        return "Target is not a file."

    return None


def prepare_destination(source: Path, destination_dir: Path) -> Path:
    destination_dir.mkdir(parents=True, exist_ok=True)
    return unique_destination(destination_dir, source.name)


def execute_prepared_move(
    source: Path,
    destination: Path,
    *,
    history_action: str,
    mode: str,
) -> dict:
    shutil.move(str(source), str(destination))

    history_entry = append_action_history(
        action=history_action,
        source_path=str(source),
        destination_path=str(destination),
        mode=mode,
        status="success",
    )

    return {
        "history_entry": history_entry,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def execute_single_move(
    file_path: str,
    *,
    destination_dir: Path,
    history_action: str,
    success_message: str,
    mode: str,
) -> dict:
    source = Path(file_path).expanduser().resolve()
    source_error = get_source_error(source)

    if source_error:
        return {
            "success": False,
            "action": history_action,
            "path": str(source),
            "message": source_error,
        }

    destination = prepare_destination(source, destination_dir)
    execution = execute_prepared_move(
        source,
        destination,
        history_action=history_action,
        mode=mode,
    )

    return {
        "success": True,
        "action": history_action,
        "path": str(source),
        "destination": str(destination),
        "message": success_message,
        "timestamp": execution["timestamp"],
        "history_entry": execution["history_entry"],
    }
