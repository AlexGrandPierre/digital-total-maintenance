import argparse
import hashlib
import json
from pathlib import Path


def make_dataset_id(csv_path):
    normalized = str(Path(csv_path).expanduser().resolve())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]


def get_default_dtm_root():
    return Path.home() / "Desktop" / "Digital Total Maintenance"


def get_index_dir(csv_path, dtm_root=None):
    root = Path(dtm_root) if dtm_root else get_default_dtm_root()
    return root / "CSV Review Index" / make_dataset_id(csv_path)


def get_index_file(csv_path, kind, dtm_root=None):
    index_dir = get_index_dir(csv_path, dtm_root)

    if kind == "duplicates":
        return index_dir / "duplicate-groups.jsonl"

    if kind == "suspicious":
        return index_dir / "suspicious-values.jsonl"

    raise ValueError(f"Unsupported index kind: {kind}")


def read_jsonl_page(
    path,
    offset=0,
    limit=250,
    exclude_ids=None,
    id_field=None,
):
    items = []

    total = 0
    remaining_total = 0

    start = max(0, int(offset))
    page_limit = max(1, int(limit))

    excluded = set(exclude_ids or [])

    if not path.exists():
        return {
            "success": False,
            "message": f"Index file not found: {path}",
            "items": [],
            "offset": start,
            "limit": page_limit,
            "total": 0,
            "remaining_total": 0,
            "next_offset": start,
            "has_more": False,
        }

    visible_index = 0

    with open(path, "r", encoding="utf-8") as file:
        for line in file:

            if not line.strip():
                continue

            try:
                item = json.loads(line)
            except Exception:
                continue

            total += 1

            if id_field and item.get(id_field) in excluded:
                continue

            remaining_total += 1

            if visible_index < start:
                visible_index += 1
                continue

            if len(items) >= page_limit:
                visible_index += 1
                continue

            items.append(item)
            visible_index += 1

    next_offset = start + len(items)

    return {
        "success": True,
        "items": items,
        "offset": start,
        "limit": page_limit,
        "total": total,
        "remaining_total": remaining_total,
        "next_offset": next_offset,
        "has_more": next_offset < remaining_total,
    }


def load_page(payload, kind):
    csv_path = payload.get("csv_path", "")
    offset = payload.get("offset", 0)
    limit = payload.get("limit", 250)
    dtm_root = payload.get("dtm_root")

    if not csv_path:
      return {
          "success": False,
          "message": "No CSV path provided.",
          "items": [],
      }

    index_file = get_index_file(csv_path, kind, dtm_root)

    exclude_ids = payload.get("exclude_ids", [])

    id_field = (
        "group_id"
        if kind == "duplicates"
        else "issue_id"
    )

    result = read_jsonl_page(
        index_file,
        offset,
        limit,
        exclude_ids=exclude_ids,
        id_field=id_field,
    )

    result["kind"] = kind
    result["dataset_id"] = make_dataset_id(csv_path)

    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["duplicates", "suspicious"])
    parser.add_argument("payload_json", nargs="?", default="{}")
    args = parser.parse_args()

    try:
        payload = json.loads(args.payload_json)

        if args.action == "duplicates":
            print(json.dumps(load_page(payload, "duplicates")))
            return

        if args.action == "suspicious":
            print(json.dumps(load_page(payload, "suspicious")))
            return

    except Exception as error:
        print(json.dumps({
            "success": False,
            "message": str(error),
            "items": [],
        }))


if __name__ == "__main__":
    main()