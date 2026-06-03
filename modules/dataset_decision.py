import argparse
import json
import os
from datetime import datetime


def get_decision_path(app_data_path):
    os.makedirs(app_data_path, exist_ok=True)
    return os.path.join(app_data_path, "dataset-decisions.json")


def read_decisions(app_data_path):
    path = get_decision_path(app_data_path)

    if not os.path.exists(path):
        return {}

    try:
        with open(path, "r", encoding="utf-8") as file:
            return json.load(file)
    except Exception:
        return {}


def write_decisions(app_data_path, decisions):
    path = get_decision_path(app_data_path)

    with open(path, "w", encoding="utf-8") as file:
        json.dump(decisions, file, indent=2)


def save_decision(app_data_path, payload):
    group_id = payload.get("group_id")
    decision = payload.get("decision")
    csv_path = payload.get("csv_path", "")

    if not group_id:
        return {
            "success": False,
            "message": "No duplicate group ID provided.",
        }

    if decision not in {
        "approved_duplicate",
        "legitimate_records",
        "needs_review",
        "ignored",
        "pending",
    }:
        return {
            "success": False,
            "message": f"Unsupported decision: {decision}",
        }

    decisions = read_decisions(app_data_path)

    decisions[group_id] = {
        "group_id": group_id,
        "decision": decision,
        "csv_path": csv_path,
        "updated_at": datetime.now().isoformat(),
    }

    write_decisions(app_data_path, decisions)

    return {
        "success": True,
        "message": f"Saved decision: {decision}",
        "decision": decisions[group_id],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--app-data", required=True)
    parser.add_argument("action", choices=["read", "save"])
    parser.add_argument("payload_json", nargs="?", default="{}")
    args = parser.parse_args()

    try:
        if args.action == "read":
            print(json.dumps({
                "success": True,
                "decisions": read_decisions(args.app_data),
            }))
            return

        payload = json.loads(args.payload_json)
        print(json.dumps(save_decision(args.app_data, payload)))
    except Exception as error:
        print(json.dumps({
            "success": False,
            "message": str(error),
        }))


if __name__ == "__main__":
    main()