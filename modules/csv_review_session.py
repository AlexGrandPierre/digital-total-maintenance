import argparse
import hashlib
import json
import os
from datetime import datetime


def get_sessions_dir(app_data_path):
    sessions_dir = os.path.join(app_data_path, "csv-review-sessions")
    os.makedirs(sessions_dir, exist_ok=True)
    return sessions_dir


def get_session_id(csv_path):
    normalized = os.path.abspath(csv_path or "")
    return hashlib.sha1(normalized.encode("utf-8")).hexdigest()[:16]


def get_session_path(app_data_path, csv_path):
    session_id = get_session_id(csv_path)
    return os.path.join(get_sessions_dir(app_data_path), f"{session_id}.json")


def empty_session(csv_path):
    return {
        "csv_path": csv_path,
        "session_id": get_session_id(csv_path),
        "last_updated": None,
        "duplicate_decisions": {},
        "suspicious_decisions": {},
    }


def load_session(app_data_path, csv_path):
    path = get_session_path(app_data_path, csv_path)

    if not os.path.exists(path):
        return {
            "success": True,
            "session": empty_session(csv_path),
        }

    try:
        with open(path, "r", encoding="utf-8") as file:
            session = json.load(file)

        return {
            "success": True,
            "session": session,
        }
    except Exception as error:
        return {
            "success": False,
            "message": str(error),
            "session": empty_session(csv_path),
        }


def save_session(app_data_path, payload):
    csv_path = payload.get("csv_path", "")

    if not csv_path:
        return {
            "success": False,
            "message": "No CSV path provided.",
        }

    session = {
        "csv_path": csv_path,
        "session_id": get_session_id(csv_path),
        "last_updated": datetime.now().isoformat(),
        "duplicate_decisions": payload.get("duplicate_decisions", {}),
        "suspicious_decisions": payload.get("suspicious_decisions", {}),
    }

    path = get_session_path(app_data_path, csv_path)

    with open(path, "w", encoding="utf-8") as file:
        json.dump(session, file, indent=2)

    return {
        "success": True,
        "message": "Saved CSV review session.",
        "session": session,
        "path": path,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--app-data", required=True)
    parser.add_argument("action", choices=["load", "save"])
    parser.add_argument("payload_json", nargs="?", default="{}")
    args = parser.parse_args()

    try:
        payload = json.loads(args.payload_json)

        if args.action == "load":
            csv_path = payload.get("csv_path", "")
            print(json.dumps(load_session(args.app_data, csv_path)))
            return

        if args.action == "save":
            print(json.dumps(save_session(args.app_data, payload)))
            return

    except Exception as error:
        print(json.dumps({
            "success": False,
            "message": str(error),
        }))


if __name__ == "__main__":
    main()