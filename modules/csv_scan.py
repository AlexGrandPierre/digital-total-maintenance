import csv
import json
import os
import sys
from datetime import datetime


def scan_csv(csv_path):
    if not csv_path or not os.path.exists(csv_path):
        return {
            "type": "csv_scan",
            "success": False,
            "error": f"CSV file does not exist: {csv_path}",
            "path": csv_path,
        }

    rows = []
    with open(csv_path, "r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        columns = reader.fieldnames or []

        for index, row in enumerate(reader):
            if index < 10:
                rows.append(row)

        row_count = index + 1 if "index" in locals() else 0

    missing_by_column = {column: 0 for column in columns}

    with open(csv_path, "r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)

        for row in reader:
            for column in columns:
                value = row.get(column, "")
                if value is None or str(value).strip() == "":
                    missing_by_column[column] += 1

    return {
        "type": "csv_scan",
        "success": True,
        "scanned_at": datetime.now().isoformat(),
        "path": csv_path,
        "filename": os.path.basename(csv_path),
        "row_count": row_count,
        "column_count": len(columns),
        "columns": columns,
        "missing_by_column": missing_by_column,
        "sample_rows": rows,
    }


if __name__ == "__main__":
    csv_path = sys.argv[1] if len(sys.argv) > 1 else ""
    print(json.dumps(scan_csv(csv_path)))