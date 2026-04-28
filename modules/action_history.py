import json
import sys
import uuid
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional

def get_app_data_dir() -> Path:
    if len(sys.argv) >= 3 and sys.argv[1] == "--app-data":
        return Path(sys.argv[2]).expanduser().resolve()

    return Path.home() / ".dtm"


APP_HISTORY_DIR = get_app_data_dir()
APP_HISTORY_FILE = APP_HISTORY_DIR / "action-history.json"
MAX_HISTORY_ITEMS = 1000


def _read_history() -> list:
    if not APP_HISTORY_FILE.exists():
        return []

    try:
        with APP_HISTORY_FILE.open("r", encoding="utf-8") as f:
            data = json.load(f)

        if isinstance(data, list):
            return data

        return []
    except Exception:
        return []


def _write_history(items: list) -> None:
    APP_HISTORY_DIR.mkdir(parents=True, exist_ok=True)

    with APP_HISTORY_FILE.open("w", encoding="utf-8") as f:
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
    args = sys.argv[1:]

    if len(args) >= 2 and args[0] == "--app-data":
        args = args[2:]

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
