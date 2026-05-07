import argparse
import csv
import json
import os
from datetime import datetime


def ensure_export_dir(app_data_path):
    desktop_path = os.path.expanduser("~/Desktop")
    export_dir = os.path.join(desktop_path, "DTM-Exports")
    os.makedirs(export_dir, exist_ok=True)
    return export_dir


def safe_filename(name):
    return "".join(
        char if char.isalnum() or char in ("-", "_") else "_"
        for char in name
    ).strip("_")


def read_csv_rows(csv_path):
    with open(csv_path, "r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        columns = reader.fieldnames or []
        rows = []

        for index, row in enumerate(reader, start=1):
            rows.append({
                "row_number": index,
                "values": row,
            })

    return columns, rows


def write_rows(export_path, columns, rows, include_dtm_row_number=True):
    output_columns = ["DTM Row Number", *columns] if include_dtm_row_number else columns

    with open(export_path, "w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=output_columns)
        writer.writeheader()

        for row in rows:
            output_row = {}

            if include_dtm_row_number:
                output_row["DTM Row Number"] = row["row_number"]

            for column in columns:
                output_row[column] = row["values"].get(column, "")

            writer.writerow(output_row)


def export_duplicate_groups(app_data_path, csv_path, duplicate_groups):
    export_dir = ensure_export_dir(app_data_path)
    columns, source_rows = read_csv_rows(csv_path)

    source_by_row_number = {
        row["row_number"]: row for row in source_rows
    }

    target_row_numbers = []

    for group in duplicate_groups:
        for row_number in group.get("row_numbers", []):
            if isinstance(row_number, int):
                target_row_numbers.append(row_number)

    unique_target_row_numbers = sorted(set(target_row_numbers))

    export_rows = [
        source_by_row_number[row_number]
        for row_number in unique_target_row_numbers
        if row_number in source_by_row_number
    ]

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    base_name = safe_filename(os.path.splitext(os.path.basename(csv_path))[0])
    export_path = os.path.join(
        export_dir,
        f"{base_name}_duplicate_groups_{timestamp}.csv",
    )

    write_rows(export_path, columns, export_rows)

    return {
        "success": True,
        "action": "export_duplicate_groups",
        "message": f"Exported {len(export_rows)} duplicate-group row(s).",
        "export_path": export_path,
        "row_count": len(export_rows),
    }


def export_suspicious_rows(
    app_data_path,
    csv_path,
    suspicious_examples=None,
    suspicious_row_numbers=None,
):
    export_dir = ensure_export_dir(app_data_path)
    columns, source_rows = read_csv_rows(csv_path)

    source_by_row_number = {
        row["row_number"]: row for row in source_rows
    }

    row_numbers = set()

    for row_number in suspicious_row_numbers or []:
        if isinstance(row_number, int):
            row_numbers.add(row_number)

    for example in suspicious_examples or []:
        row_number = example.get("row_number")
        if isinstance(row_number, int):
            row_numbers.add(row_number)

    target_row_numbers = sorted(row_numbers)

    export_rows = [
        source_by_row_number[row_number]
        for row_number in target_row_numbers
        if row_number in source_by_row_number
    ]

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    base_name = safe_filename(os.path.splitext(os.path.basename(csv_path))[0])
    export_path = os.path.join(
        export_dir,
        f"{base_name}_suspicious_rows_{timestamp}.csv",
    )

    write_rows(export_path, columns, export_rows)

    return {
        "success": True,
        "action": "export_suspicious_rows",
        "message": f"Exported {len(export_rows)} suspicious row(s).",
        "export_path": export_path,
        "row_count": len(export_rows),
    }


def export_clean_copy(
    app_data_path,
    csv_path,
    duplicate_groups=None,
    suspicious_examples=None,
    suspicious_row_numbers=None,
    remove_empty_columns=True,
    remove_empty_rows=True,
    trim_whitespace=True,
    exclude_duplicate_rows=False,
    exclude_suspicious_rows=False,
):
    export_dir = ensure_export_dir(app_data_path)
    columns, source_rows = read_csv_rows(csv_path)

    duplicate_row_numbers = set()

    for group in duplicate_groups or []:
        row_numbers = [
            row_number
            for row_number in group.get("row_numbers", [])
            if isinstance(row_number, int)
        ]

        # Keep first row as representative, exclude later duplicate-like rows.
        for row_number in row_numbers[1:]:
            duplicate_row_numbers.add(row_number)

    suspicious_rows = set()

    for row_number in suspicious_row_numbers or []:
        if isinstance(row_number, int):
            suspicious_rows.add(row_number)

    for example in suspicious_examples or []:
        row_number = example.get("row_number")
        if isinstance(row_number, int):
            suspicious_rows.add(row_number)

    working_rows = []

    for row in source_rows:
        row_number = row["row_number"]
        values = dict(row["values"])

        if trim_whitespace:
            values = {
                column: str(value).strip() if value is not None else ""
                for column, value in values.items()
            }

        if exclude_duplicate_rows and row_number in duplicate_row_numbers:
            continue

        if exclude_suspicious_rows and row_number in suspicious_rows:
            continue

        if remove_empty_rows and all(
            str(values.get(column, "")).strip() == "" for column in columns
        ):
            continue

        working_rows.append({
            "row_number": row_number,
            "values": values,
        })

    output_columns = list(columns)

    if remove_empty_columns:
        output_columns = [
            column for column in columns
            if any(
                str(row["values"].get(column, "")).strip() != ""
                for row in working_rows
            )
        ]

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    base_name = safe_filename(os.path.splitext(os.path.basename(csv_path))[0])
    export_path = os.path.join(
        export_dir,
        f"{base_name}_clean_copy_{timestamp}.csv",
    )

    write_rows(
        export_path=export_path,
        columns=output_columns,
        rows=working_rows,
        include_dtm_row_number=False,
    )

    removed_rows = len(source_rows) - len(working_rows)
    removed_columns = len(columns) - len(output_columns)

    return {
        "success": True,
        "action": "export_clean_copy",
        "message": (
            f"Exported clean copy with {len(working_rows)} row(s), "
            f"{len(output_columns)} column(s), "
            f"{removed_rows} removed row(s), and {removed_columns} removed column(s)."
        ),
        "export_path": export_path,
        "row_count": len(working_rows),
        "column_count": len(output_columns),
        "removed_rows": removed_rows,
        "removed_columns": removed_columns,
        "transforms": {
            "remove_empty_columns": remove_empty_columns,
            "remove_empty_rows": remove_empty_rows,
            "trim_whitespace": trim_whitespace,
            "exclude_duplicate_rows": exclude_duplicate_rows,
            "exclude_suspicious_rows": exclude_suspicious_rows,
        },
    }


def run_action(app_data_path, payload):
    action = payload.get("action")
    csv_path = payload.get("csv_path")

    if not csv_path or not os.path.exists(csv_path):
        return {
            "success": False,
            "message": f"CSV file does not exist: {csv_path}",
        }

    if action == "export_duplicate_groups":
        return export_duplicate_groups(
            app_data_path=app_data_path,
            csv_path=csv_path,
            duplicate_groups=payload.get("duplicate_groups", []),
        )

    if action == "export_suspicious_rows":
        return export_suspicious_rows(
            app_data_path=app_data_path,
            csv_path=csv_path,
            suspicious_examples=payload.get("suspicious_examples", []),
            suspicious_row_numbers=payload.get("suspicious_row_numbers", []),
        )

    if action == "export_clean_copy":
        return export_clean_copy(
            app_data_path=app_data_path,
            csv_path=csv_path,
            duplicate_groups=payload.get("duplicate_groups", []),
            suspicious_examples=payload.get("suspicious_examples", []),
            suspicious_row_numbers=payload.get("suspicious_row_numbers", []),
            remove_empty_columns=payload.get("remove_empty_columns", True),
            remove_empty_rows=payload.get("remove_empty_rows", True),
            trim_whitespace=payload.get("trim_whitespace", True),
            exclude_duplicate_rows=payload.get("exclude_duplicate_rows", False),
            exclude_suspicious_rows=payload.get("exclude_suspicious_rows", False),
        )

    return {
        "success": False,
        "message": f"Unsupported CSV action: {action}",
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--app-data", required=True)
    parser.add_argument("payload_json")
    args = parser.parse_args()

    try:
        payload = json.loads(args.payload_json)
        result = run_action(args.app_data, payload)
        print(json.dumps(result))
    except Exception as error:
        print(json.dumps({
            "success": False,
            "message": str(error),
        }))


if __name__ == "__main__":
    main()