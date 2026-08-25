"""
dataset_decision.py

Persistent duplicate-decision storage for Digital Total Maintenance.

Responsibilities:
- Store duplicate-group decisions
- Retrieve saved dataset decisions
- Reset decisions for a specific CSV dataset
- Validate supported decision states

This module DOES NOT:
- Detect duplicate groups
- Scan CSV datasets
- Export CSV files
- Persist suspicious-value decisions

Called by:
Electron IPC duplicate-review workflows.

Outputs:
Structured decision results backed by local JSON persistence.
"""

import argparse
import json
import os
from datetime import datetime


# =============================================================================
# Decision Storage Helpers
# =============================================================================
def get_decision_path(app_data_path):
    os.makedirs(app_data_path, exist_ok=True)
    return os.path.join(app_data_path, "dataset-decisions.json")


def read_decisions(app_data_path):
    decision_path = get_decision_path(app_data_path)

    if not os.path.exists(decision_path):
        return {}

    try:
        with open(decision_path, "r", encoding="utf-8") as file:
            return json.load(file)
    except Exception:
        return {}


def write_decisions(app_data_path, decisions):
    decision_path = get_decision_path(app_data_path)

    with open(decision_path, "w", encoding="utf-8") as file:
        json.dump(decisions, file, indent=2)


# =============================================================================
# Decision Persistence
# =============================================================================
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

def reset_decisions_for_csv(app_data_path, payload):
    csv_path = payload.get("csv_path", "")

    if not csv_path:
        return {
            "success": False,
            "message": "No CSV path provided.",
        }

    decisions = read_decisions(app_data_path)

    kept_decisions = {
        key: value
        for key, value in decisions.items()
        if value.get("csv_path") != csv_path
    }

    removed_count = len(decisions) - len(kept_decisions)

    write_decisions(app_data_path, kept_decisions)

    return {
        "success": True,
        "message": f"Reset {removed_count} duplicate decision(s) for this dataset.",
        "removed_count": removed_count,
        "decisions": kept_decisions,
    }


# =============================================================================
# CLI Entry Point
# =============================================================================
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--app-data", required=True)
    parser.add_argument("--dtm-root", required=False)
    parser.add_argument("action", choices=["read", "save", "reset_csv"])
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

        if args.action == "reset_csv":
            print(json.dumps(reset_decisions_for_csv(args.app_data, payload)))
            return

        print(json.dumps(save_decision(args.app_data, payload)))
    except Exception as error:
        print(json.dumps({
            "success": False,
            "message": str(error),
        }))


if __name__ == "__main__":
    main()