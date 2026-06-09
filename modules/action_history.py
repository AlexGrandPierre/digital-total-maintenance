import json
import sys
import uuid
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional


MAX_HISTORY_ITEMS = 1000


def parse_paths_from_args(args: list[str]) -> dict:
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


def get_dtm_root() -> Path:
    parsed = parse_paths_from_args(sys.argv[1:])

    if parsed["dtm_root"]:
        return Path(parsed["dtm_root"]).expanduser().resolve()

    return Path.home() / "Desktop" / "Digital Total Maintenance"


def get_history_file() -> Path:
    history_dir = get_dtm_root() / "Local Action History"
    history_dir.mkdir(parents=True, exist_ok=True)
    return history_dir / "action-history.json"


def _read_history() -> list:
    history_file = get_history_file()

    if not history_file.exists():
        return []

    try:
        with history_file.open("r", encoding="utf-8") as f:
            data = json.load(f)

        return data if isinstance(data, list) else []
    except Exception:
        return []


def _write_history(items: list) -> None:
    history_file = get_history_file()
    history_file.parent.mkdir(parents=True, exist_ok=True)

    with history_file.open("w", encoding="utf-8") as f:
        json.dump(items[:MAX_HISTORY_ITEMS], f, indent=2)


def append_action_history(
    *,
    action: str,
    source_path: str,
    destination_path: Optional[str],
    mode: str = "single",
    status: str = "success",
    reverts_history_id: Optional[str] = None,
) -> dict:
    timestamp = datetime.now(timezone.utc).isoformat()

    entry = {
        "id": f"{timestamp}__{action}__{uuid.uuid4().hex[:8]}",
        "timestamp": timestamp,
        "action": action,
        "source_path": source_path,
        "destination_path": destination_path,
        "status": status,
        "mode": mode,
        "reverts_history_id": reverts_history_id,
    }

    history = _read_history()
    history.insert(0, entry)
    _write_history(history)

    return entry


def get_action_history(limit=None) -> list:
    history = _read_history()

    if limit is None:
        return history

    return history[: max(0, limit)]


if __name__ == "__main__":
    parsed = parse_paths_from_args(sys.argv[1:])
    args = parsed["remaining"]

    limit = 20
    command = "read"

    if len(args) >= 1:
        try:
            limit = int(args[0])
        except ValueError:
            command = args[0]

    if len(args) >= 2:
        command = args[1]

    if command == "read":
        print(json.dumps(get_action_history(limit)))
    else:
        print(json.dumps([]))