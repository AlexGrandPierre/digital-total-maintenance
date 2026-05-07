import csv
import hashlib
import json
import os
import re
import sys
from datetime import datetime
from collections import Counter, defaultdict


PREVIEW_ROW_LIMIT = 10
SAMPLE_VALUE_LIMIT = 5
SUSPICIOUS_EXAMPLE_LIMIT = 12
DUPLICATE_GROUP_LIMIT = 25
DUPLICATE_GROUP_ROW_LIMIT = 12


IDENTITY_COLUMN_HINTS = [
    "first name",
    "firstname",
    "given name",
    "last name",
    "lastname",
    "surname",
    "family name",
    "date of birth",
    "dob",
    "birth date",
    "birthdate",
    "gender",
    "sex",
]

ID_COLUMN_HINTS = [
    "id",
    "uuid",
    "guid",
    "key",
    "code",
    "number",
    "no.",
]


def is_number(value):
    try:
        float(value)
        return True
    except (TypeError, ValueError):
        return False


def is_boolean(value):
    return str(value).strip().lower() in {
        "true", "false", "yes", "no", "1", "0"
    }


def parse_date(value):
    value = str(value).strip()
    if not value:
        return None

    date_formats = [
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%m/%d/%Y",
        "%Y/%m/%d",
        "%d-%m-%Y",
        "%m-%d-%Y",
        "%Y-%m-%d %H:%M:%S",
    ]

    for fmt in date_formats:
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue

    return None


def is_date_like(value):
    return parse_date(value) is not None


def infer_type(values):
    non_empty = [str(v).strip() for v in values if str(v).strip() != ""]

    if not non_empty:
        return "empty"

    checks = {
        "number": sum(1 for v in non_empty if is_number(v)),
        "date": sum(1 for v in non_empty if is_date_like(v)),
        "boolean": sum(1 for v in non_empty if is_boolean(v)),
    }

    total = len(non_empty)

    for inferred_type, count in checks.items():
        if count == total:
            return inferred_type

    if max(checks.values()) >= max(2, int(total * 0.8)):
        return "mixed"

    return "text"


def normalize_cell(value):
    if value is None:
        return ""

    return str(value).strip()


def normalize_for_matching(value):
    value = normalize_cell(value).lower()
    value = re.sub(r"\s+", " ", value)
    return value


def normalize_column_name(column):
    return re.sub(r"[_\-]+", " ", column.strip().lower())


def looks_like_id_column(column):
    normalized = normalize_column_name(column)

    if normalized in {"id", "record id", "row id"}:
        return True

    return any(hint in normalized for hint in ID_COLUMN_HINTS)


def get_identity_like_columns(columns):
    identity_columns = []

    for column in columns:
        normalized = normalize_column_name(column)

        if any(hint == normalized or hint in normalized for hint in IDENTITY_COLUMN_HINTS):
            identity_columns.append(column)

    return identity_columns


def build_duplicate_key_columns(columns):
    identity_columns = get_identity_like_columns(columns)

    if len(identity_columns) >= 2:
        return identity_columns

    non_id_columns = [
        column for column in columns if not looks_like_id_column(column)
    ]

    if len(non_id_columns) >= 2:
        return non_id_columns

    return columns


def make_group_id(values):
    raw = "|".join(values)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:12]


def contains_suspicious_characters(value):
    value = str(value)

    if not value:
        return False

    if "\ufffd" in value:
        return True

    if re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", value):
        return True

    return False


def contains_non_ascii_characters(value):
    value = str(value)

    if not value:
        return False

    return bool(re.search(r"[^\x00-\x7F]", value))


def is_suspicious_default_date(value):
    normalized = str(value).strip()

    default_dates = {
        "1900-01-01",
        "01/01/1900",
        "1/1/1900",
        "1900/01/01",
        "01-01-1900",
        "1-1-1900",
        "0000-00-00",
    }

    return normalized in default_dates


def is_very_old_date(value, cutoff_year=1926):
    parsed = parse_date(value)

    if not parsed:
        return False

    return parsed.year < cutoff_year


def inspect_suspicious_value(column, value):
    issues = []

    if not value:
        return issues

    if contains_suspicious_characters(value):
        issues.append("suspicious_characters")

    column_lower = column.lower()
    value_lower = str(value).strip().lower()

    if contains_non_ascii_characters(value) and any(
        hint in column_lower
        for hint in ["id", "code", "email", "date", "number"]
    ):
        issues.append("unexpected_non_ascii_in_structured_field")

    if is_suspicious_default_date(value):
        issues.append("default_or_placeholder_date")

    if is_very_old_date(value):
        issues.append("very_old_date")

    if "email" in column_lower and value_lower and "@" not in value_lower:
        issues.append("email_like_column_without_email_format")

    if "date" in column_lower and value_lower and not is_date_like(value_lower):
        issues.append("date_like_column_with_unparsed_value")

    return issues


def build_duplicate_groups(row_records, columns):
    key_columns = build_duplicate_key_columns(columns)

    grouped = defaultdict(list)

    for record in row_records:
        key_values = [
            normalize_for_matching(record["values"].get(column, ""))
            for column in key_columns
        ]

        if not any(key_values):
            continue

        grouped[tuple(key_values)].append(record)

    duplicate_groups = []

    for key_values, records in grouped.items():
        if len(records) < 2:
            continue

        varying_id_columns = []

        for column in columns:
            if not looks_like_id_column(column):
                continue

            unique_values = {
                normalize_for_matching(record["values"].get(column, ""))
                for record in records
                if normalize_for_matching(record["values"].get(column, ""))
            }

            if len(unique_values) > 1:
                varying_id_columns.append(column)

        confidence = "high" if len(key_columns) >= 3 else "medium"

        reason = (
            f"{len(records)} rows share the same values across "
            f"{len(key_columns)} duplicate-check column(s)."
        )

        if varying_id_columns:
            reason += (
                " One or more ID-like fields differ, which may indicate separate records "
                "describing the same real-world entity."
            )

        duplicate_groups.append({
            "group_id": f"csv-{make_group_id(list(key_values))}",
            "confidence": confidence,
            "reason": reason,
            "matching_columns": key_columns,
            "varying_id_columns": varying_id_columns,
            "rows": [
                {
                    "row_number": record["row_number"],
                    "values": {
                        column: record["values"].get(column, "")
                        for column in columns
                    },
                }
                for record in records[:DUPLICATE_GROUP_ROW_LIMIT]
            ],
            "row_numbers": [record["row_number"] for record in records],
            "rows_total": len(records),
            "hidden_rows_count": max(0, len(records) - DUPLICATE_GROUP_ROW_LIMIT),
        })

    duplicate_groups.sort(
        key=lambda group: (group["rows_total"], group["confidence"] == "high"),
        reverse=True,
    )

    return duplicate_groups[:DUPLICATE_GROUP_LIMIT]


def build_data_quality_insights(
    row_count,
    missing_by_column,
    duplicate_row_count,
    duplicate_groups,
    empty_columns,
    near_empty_columns,
    column_profiles,
    suspicious_value_summary,
):
    insights = []

    total_missing = sum(missing_by_column.values())

    grouped_duplicate_rows = sum(
        max(0, group.get("rows_total", 0) - 1)
        for group in duplicate_groups
    )

    duplicate_signal_count = max(duplicate_row_count, grouped_duplicate_rows)

    if duplicate_signal_count > 0:
        severity = (
            "high"
            if duplicate_signal_count / max(row_count, 1) >= 0.05
            else "medium"
        )

        insights.append({
            "id": "duplicate_records",
            "category": "duplicates",
            "severity": severity,
            "title": "Potential duplicate records detected",
            "summary": (
                f"{duplicate_signal_count} duplicate-like row(s) were detected. "
                "Some records may differ by ID while sharing enough stable metadata to require review."
            ),
            "count": duplicate_signal_count,
            "recommended_action": "Review duplicate groups before using this dataset as a source of truth.",
        })

    if total_missing > 0:
        affected_columns = [
            column for column, count in missing_by_column.items() if count > 0
        ]

        missing_ratio = total_missing / max(row_count * max(len(missing_by_column), 1), 1)

        severity = "high" if missing_ratio >= 0.25 else "medium" if missing_ratio >= 0.05 else "low"

        insights.append({
            "id": "missing_values",
            "category": "missing_values",
            "severity": severity,
            "title": "Missing values present",
            "summary": (
                f"{total_missing} missing value(s) were found across "
                f"{len(affected_columns)} column(s). Missing data may be harmless or critical depending on the field."
            ),
            "count": total_missing,
            "affected_columns": affected_columns,
            "recommended_action": "Review whether affected columns are required, optional, or safe to leave incomplete.",
        })

    if empty_columns:
        insights.append({
            "id": "empty_columns",
            "category": "empty_structure",
            "severity": "medium",
            "title": "Fully empty columns detected",
            "summary": (
                f"{len(empty_columns)} column(s) contain no values. "
                "Empty columns often indicate unused schema fields, failed exports, or placeholders."
            ),
            "count": len(empty_columns),
            "affected_columns": empty_columns,
            "recommended_action": "Consider excluding fully empty columns from cleaned exports after review.",
        })

    if near_empty_columns:
        insights.append({
            "id": "near_empty_columns",
            "category": "empty_structure",
            "severity": "low",
            "title": "Near-empty columns detected",
            "summary": (
                f"{len(near_empty_columns)} column(s) are mostly empty. "
                "These may still be meaningful if the field is optional or rarely used."
            ),
            "count": len(near_empty_columns),
            "affected_columns": near_empty_columns,
            "recommended_action": "Review near-empty columns before deciding whether they should be preserved.",
        })

    mixed_columns = [
        profile["name"]
        for profile in column_profiles.values()
        if profile["inferred_type"] == "mixed"
    ]

    if mixed_columns:
        insights.append({
            "id": "mixed_column_types",
            "category": "type_quality",
            "severity": "medium",
            "title": "Mixed column types detected",
            "summary": (
                f"{len(mixed_columns)} column(s) contain mixed-looking values. "
                "Mixed types can cause import errors, failed validation, or inconsistent filtering."
            ),
            "count": len(mixed_columns),
            "affected_columns": mixed_columns,
            "recommended_action": "Inspect these columns for formatting inconsistencies before export or migration.",
        })

    suspicious_total = suspicious_value_summary.get("total", 0)

    if suspicious_total > 0:
        affected_columns = list(suspicious_value_summary.get("by_column", {}).keys())

        severity = "high" if suspicious_total >= 100 else "medium"

        insights.append({
            "id": "suspicious_values",
            "category": "suspicious_values",
            "severity": severity,
            "title": "Suspicious values detected",
            "summary": (
                f"{suspicious_total} suspicious cell(s) were found across "
                f"{len(affected_columns)} column(s). These may include unsupported characters, placeholder dates, "
                "very old dates, or values that do not match expected column patterns."
            ),
            "count": suspicious_total,
            "affected_columns": affected_columns,
            "recommended_action": "Review suspicious examples before import, migration, or cleanup decisions.",
        })

    return insights


def empty_csv_result(csv_path, error):
    return {
        "type": "csv_scan",
        "success": False,
        "error": error,
        "path": csv_path,
        "filename": os.path.basename(csv_path) if csv_path else "",
        "row_count": 0,
        "column_count": 0,
        "columns": [],
        "missing_by_column": {},
        "preview_rows": [],
        "column_profiles": {},
        "duplicate_row_count": 0,
        "duplicate_groups": [],
        "empty_columns": [],
        "near_empty_columns": [],
        "suggestions": [],
        "data_quality_insights": [],
        "suspicious_value_summary": {
            "total": 0,
            "by_column": {},
            "by_issue": {},
            "examples": [],
            "row_numbers": [],
        },
    }


def scan_csv(csv_path):
    if not csv_path or not os.path.exists(csv_path):
        return empty_csv_result(
            csv_path,
            f"CSV file does not exist: {csv_path}",
        )

    preview_rows = []
    row_count = 0
    row_signatures = Counter()
    row_records = []

    suspicious_by_column = Counter()
    suspicious_by_issue = Counter()
    suspicious_examples = []
    suspicious_row_numbers = set()

    try:
        with open(csv_path, "r", encoding="utf-8-sig", newline="") as file:
            reader = csv.DictReader(file)
            columns = reader.fieldnames or []

            column_values = {column: [] for column in columns}
            missing_by_column = {column: 0 for column in columns}

            for row in reader:
                row_count += 1

                normalized_row = {
                    column: normalize_cell(row.get(column, ""))
                    for column in columns
                }

                row_records.append({
                    "row_number": row_count,
                    "values": normalized_row,
                })

                if len(preview_rows) < PREVIEW_ROW_LIMIT:
                    preview_rows.append(normalized_row)

                row_signature = tuple(
                    normalized_row.get(column, "") for column in columns
                )
                row_signatures[row_signature] += 1

                for column in columns:
                    value = normalized_row.get(column, "")
                    column_values[column].append(value)

                    if value == "":
                        missing_by_column[column] += 1

                    issues = inspect_suspicious_value(column, value)

                    if issues:
                        suspicious_by_column[column] += 1

                        suspicious_row_numbers.add(row_count)

                        for issue in set(issues):
                            suspicious_by_issue[issue] += 1

                        if len(suspicious_examples) < SUSPICIOUS_EXAMPLE_LIMIT:
                            suspicious_examples.append({
                                "row_number": row_count,
                                "column": column,
                                "value": value,
                                "issues": issues,
                            })

        duplicate_row_count = sum(
            count - 1 for count in row_signatures.values() if count > 1
        )

        duplicate_groups = build_duplicate_groups(row_records, columns)

        column_profiles = {}
        empty_columns = []
        near_empty_columns = []

        for column in columns:
            values = column_values[column]
            non_empty_values = [value for value in values if value != ""]
            unique_values = sorted(set(non_empty_values))

            empty_count = missing_by_column[column]
            non_empty_count = row_count - empty_count

            if row_count > 0 and empty_count == row_count:
                empty_columns.append(column)
            elif row_count > 0 and empty_count / row_count >= 0.9:
                near_empty_columns.append(column)

            column_profiles[column] = {
                "name": column,
                "inferred_type": infer_type(values),
                "non_empty_count": non_empty_count,
                "empty_count": empty_count,
                "unique_count": len(set(non_empty_values)),
                "sample_values": unique_values[:SAMPLE_VALUE_LIMIT],
            }

        suspicious_value_summary = {
            "total": sum(suspicious_by_column.values()),
            "by_column": dict(suspicious_by_column),
            "by_issue": dict(suspicious_by_issue),
            "examples": suspicious_examples,
            "row_numbers": sorted(suspicious_row_numbers),
        }

        suggestions = []

        if empty_columns:
            suggestions.append({
                "id": "remove_empty_columns",
                "label": "Review empty columns",
                "severity": "medium",
                "reason": f"{len(empty_columns)} column(s) contain no values.",
                "columns": empty_columns,
            })

        if near_empty_columns:
            suggestions.append({
                "id": "review_near_empty_columns",
                "label": "Review near-empty columns",
                "severity": "low",
                "reason": f"{len(near_empty_columns)} column(s) are mostly empty.",
                "columns": near_empty_columns,
            })

        if duplicate_groups or duplicate_row_count > 0:
            suggestions.append({
                "id": "review_duplicate_records",
                "label": "Review duplicate records",
                "severity": "medium",
                "reason": f"{len(duplicate_groups)} duplicate-like group(s) detected.",
                "count": len(duplicate_groups),
            })

        if suspicious_value_summary["total"] > 0:
            suggestions.append({
                "id": "review_suspicious_values",
                "label": "Review suspicious values",
                "severity": "medium",
                "reason": f"{suspicious_value_summary['total']} suspicious cell(s) detected.",
                "count": suspicious_value_summary["total"],
            })

        data_quality_insights = build_data_quality_insights(
            row_count=row_count,
            missing_by_column=missing_by_column,
            duplicate_row_count=duplicate_row_count,
            duplicate_groups=duplicate_groups,
            empty_columns=empty_columns,
            near_empty_columns=near_empty_columns,
            column_profiles=column_profiles,
            suspicious_value_summary=suspicious_value_summary,
        )

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
            "preview_rows": preview_rows,
            "column_profiles": column_profiles,
            "duplicate_row_count": duplicate_row_count,
            "duplicate_groups": duplicate_groups,
            "empty_columns": empty_columns,
            "near_empty_columns": near_empty_columns,
            "suggestions": suggestions,
            "data_quality_insights": data_quality_insights,
            "suspicious_value_summary": suspicious_value_summary,
        }

    except Exception as error:
        return empty_csv_result(csv_path, str(error))


if __name__ == "__main__":
    csv_path = sys.argv[1] if len(sys.argv) > 1 else ""
    print(json.dumps(scan_csv(csv_path)))