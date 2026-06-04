import csv
import hashlib
import json
import os
import re
import sys
import time
from collections import Counter
from datetime import datetime


PREVIEW_ROW_LIMIT = 10
SAMPLE_VALUE_LIMIT = 5
SUSPICIOUS_EXAMPLE_LIMIT = 25
DUPLICATE_GROUP_LIMIT = 200
DUPLICATE_GROUP_ROW_LIMIT = 8
DUPLICATE_GROUP_SAMPLE_LIMIT_PER_BUCKET = 75

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

ID_COLUMN_HINTS = ["id", "uuid", "guid", "key", "code", "number", "no."]

SCAN_STARTED_AT = time.time()


def emit_progress(
    rows_scanned,
    current_stage,
    duplicate_candidates=0,
    suspicious_values=0,
    missing_values=0,
):
    elapsed_seconds = round(time.time() - SCAN_STARTED_AT, 1)

    rows_per_second = (
        round(rows_scanned / elapsed_seconds)
        if elapsed_seconds > 0
        else 0
    )

    print(json.dumps({
        "type": "csv_progress",
        "status": "scanning",
        "target": "CSV Dataset",
        "rows_scanned": rows_scanned,
        "rows_per_second": rows_per_second,
        "elapsed_seconds": elapsed_seconds,
        "current_stage": current_stage,
        "duplicate_candidates": duplicate_candidates,
        "suspicious_values": suspicious_values,
        "missing_values": missing_values,
    }), flush=True)


def normalize_cell(value):
    return "" if value is None else str(value).strip()


def normalize_column_name(column):
    return re.sub(r"[_\-]+", " ", column.strip().lower())


def normalize_for_matching(value):
    value = normalize_cell(value).lower()
    value = re.sub(r"\s+", " ", value)
    return value


def looks_like_id_column(column):
    normalized = normalize_column_name(column)

    if normalized in {"id", "record id", "row id"}:
        return True

    return any(hint in normalized for hint in ID_COLUMN_HINTS)


def get_identity_like_columns(columns):
    matched = []

    for column in columns:
        normalized = normalize_column_name(column)

        if any(hint == normalized or hint in normalized for hint in IDENTITY_COLUMN_HINTS):
            matched.append(column)

    return matched


def build_duplicate_key_columns(columns):
    identity_columns = get_identity_like_columns(columns)

    if len(identity_columns) >= 2:
        return identity_columns

    non_id_columns = [column for column in columns if not looks_like_id_column(column)]

    if len(non_id_columns) >= 2:
        return non_id_columns

    return columns


def make_group_id(values):
    raw = "|".join(values)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:12]


def parse_date(value):
    value = str(value).strip()
    if not value:
        return None

    formats = [
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%m/%d/%Y",
        "%Y/%m/%d",
        "%d-%m-%Y",
        "%m-%d-%Y",
        "%Y-%m-%d %H:%M:%S",
    ]

    for fmt in formats:
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue

    return None


def is_number(value):
    try:
        float(value)
        return True
    except (TypeError, ValueError):
        return False


def is_boolean(value):
    return str(value).strip().lower() in {"true", "false", "yes", "no", "1", "0"}


def is_date_like(value):
    return parse_date(value) is not None


def infer_type_from_counts(non_empty_count, number_count, date_count, boolean_count):
    if non_empty_count == 0:
        return "empty"

    if number_count == non_empty_count:
        return "number"

    if date_count == non_empty_count:
        return "date"

    if boolean_count == non_empty_count:
        return "boolean"

    strongest = max(number_count, date_count, boolean_count)

    if strongest >= max(2, int(non_empty_count * 0.8)):
        return "mixed"

    return "text"


def contains_suspicious_characters(value):
    value = str(value)

    if "\ufffd" in value:
        return True

    return bool(re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", value))


def contains_non_ascii_characters(value):
    return bool(re.search(r"[^\x00-\x7F]", str(value)))


def is_suspicious_default_date(value):
    return str(value).strip() in {
        "1900-01-01",
        "01/01/1900",
        "1/1/1900",
        "1900/01/01",
        "01-01-1900",
        "1-1-1900",
        "0000-00-00",
    }


def is_very_old_date(value, cutoff_year=1926):
    parsed = parse_date(value)
    return bool(parsed and parsed.year < cutoff_year)


def inspect_suspicious_value(column, value):
    issues = []

    if not value:
        return issues

    column_lower = column.lower()
    value_lower = str(value).strip().lower()

    if contains_suspicious_characters(value):
        issues.append("suspicious_characters")

    if contains_non_ascii_characters(value) and any(
        hint in column_lower for hint in ["id", "code", "email", "date", "number"]
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
        "duplicate_groups_total": 0,
        "duplicate_groups": [],
        "hidden_duplicate_groups_count": 0,
        "duplicate_row_numbers_to_exclude": [],
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
        "duplicate_group_samples": {
            "high_priority": [],
            "medium_priority": [],
            "low_priority": [],
        },
    }


def build_data_quality_insights(
    row_count,
    missing_by_column,
    duplicate_signal_count,
    duplicate_groups_total,
    empty_columns,
    near_empty_columns,
    column_profiles,
    suspicious_value_summary,
):
    insights = []

    total_missing = sum(missing_by_column.values())

    if duplicate_signal_count > 0:
        severity = "high" if duplicate_signal_count / max(row_count, 1) >= 0.05 else "medium"

        insights.append({
            "id": "duplicate_records",
            "category": "duplicates",
            "severity": severity,
            "title": "Potential duplicate records detected",
            "summary": (
                f"{duplicate_signal_count} duplicate-like row(s) were detected across "
                f"{duplicate_groups_total} group(s). Some records may differ by ID while sharing stable metadata."
            ),
            "count": duplicate_signal_count,
            "recommended_action": "Review duplicate groups before using this dataset as a source of truth.",
        })

    if total_missing > 0:
        affected_columns = [column for column, count in missing_by_column.items() if count > 0]
        missing_ratio = total_missing / max(row_count * max(len(missing_by_column), 1), 1)
        severity = "high" if missing_ratio >= 0.25 else "medium" if missing_ratio >= 0.05 else "low"

        insights.append({
            "id": "missing_values",
            "category": "missing_values",
            "severity": severity,
            "title": "Missing values present",
            "summary": (
                f"{total_missing} missing value(s) were found across "
                f"{len(affected_columns)} column(s)."
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
            "summary": f"{len(empty_columns)} column(s) contain no values.",
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
            "summary": f"{len(near_empty_columns)} column(s) are mostly empty.",
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
            "summary": f"{len(mixed_columns)} column(s) contain mixed-looking values.",
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
                f"{len(affected_columns)} column(s)."
            ),
            "count": suspicious_total,
            "affected_columns": affected_columns,
            "recommended_action": "Review suspicious examples before import, migration, or cleanup decisions.",
        })

    return insights


def scan_csv(csv_path):
    if not csv_path or not os.path.exists(csv_path):
        return empty_csv_result(csv_path, f"CSV file does not exist: {csv_path}")

    try:
        preview_rows = []
        row_count = 0

        duplicate_key_columns = []
        duplicate_groups_by_key = {}
        exact_row_signatures = Counter()

        suspicious_by_column = Counter()
        suspicious_by_issue = Counter()
        suspicious_examples = []
        suspicious_row_numbers = set()

        duplicate_candidates_count = 0
        suspicious_values_count = 0
        missing_values_count = 0

        with open(csv_path, "r", encoding="utf-8-sig", newline="") as file:
            reader = csv.DictReader(file)
            columns = reader.fieldnames or []
            duplicate_key_columns = build_duplicate_key_columns(columns)

            missing_by_column = {column: 0 for column in columns}

            stats = {
                column: {
                    "non_empty": 0,
                    "empty": 0,
                    "number": 0,
                    "date": 0,
                    "boolean": 0,
                    "unique_values": set(),
                    "sample_values": [],
                }
                for column in columns
            }

            for row in reader:
                row_count += 1

                if row_count % 10000 == 0:
                    emit_progress(
                        rows_scanned=row_count,
                        current_stage="analyzing_rows",
                        duplicate_candidates=duplicate_candidates_count,
                        suspicious_values=suspicious_values_count,
                        missing_values=missing_values_count,
                    )

                normalized_row = {
                    column: normalize_cell(row.get(column, ""))
                    for column in columns
                }

                if len(preview_rows) < PREVIEW_ROW_LIMIT:
                    preview_rows.append(normalized_row)

                exact_signature = tuple(normalized_row.get(column, "") for column in columns)
                exact_row_signatures[exact_signature] += 1

                key_values = [
                    normalize_for_matching(normalized_row.get(column, ""))
                    for column in duplicate_key_columns
                ]

                if any(key_values):
                    key = tuple(key_values)

                    if key not in duplicate_groups_by_key:
                        duplicate_groups_by_key[key] = {
                            "count": 0,
                            "row_numbers": [],
                            "rows": [],
                            "varying_id_values": {},
                        }

                    group = duplicate_groups_by_key[key]
                    group["count"] += 1
                    group["row_numbers"].append(row_count)

                    if len(group["rows"]) < DUPLICATE_GROUP_ROW_LIMIT:
                        group["rows"].append({
                            "row_number": row_count,
                            "values": normalized_row,
                        })

                    for column in columns:
                        if looks_like_id_column(column):
                            group["varying_id_values"].setdefault(column, set()).add(
                                normalize_for_matching(normalized_row.get(column, ""))
                            )

                for column in columns:
                    value = normalized_row.get(column, "")
                    column_stat = stats[column]

                    if value == "":
                        missing_by_column[column] += 1
                        column_stat["empty"] += 1
                        missing_values_count += 1
                    else:
                        column_stat["non_empty"] += 1
                        column_stat["unique_values"].add(value)

                        if len(column_stat["sample_values"]) < SAMPLE_VALUE_LIMIT:
                            if value not in column_stat["sample_values"]:
                                column_stat["sample_values"].append(value)

                        if is_number(value):
                            column_stat["number"] += 1
                        if is_date_like(value):
                            column_stat["date"] += 1
                        if is_boolean(value):
                            column_stat["boolean"] += 1

                    issues = inspect_suspicious_value(column, value)

                    if issues:
                        suspicious_by_column[column] += 1
                        suspicious_row_numbers.add(row_count)
                        suspicious_values_count += len(issues)

                        for issue in set(issues):
                            suspicious_by_issue[issue] += 1

                        if len(suspicious_examples) < SUSPICIOUS_EXAMPLE_LIMIT:
                            suspicious_examples.append({
                                "row_number": row_count,
                                "column": column,
                                "value": value,
                                "issues": issues,
                            })

        emit_progress(
            rows_scanned=row_count,
            current_stage="building_duplicate_groups",
            duplicate_candidates=duplicate_candidates_count,
            suspicious_values=suspicious_values_count,
            missing_values=missing_values_count,
        )

        exact_duplicate_row_count = sum(
            count - 1 for count in exact_row_signatures.values() if count > 1
        )

        duplicate_groups_all = []

        for key_values, group in duplicate_groups_by_key.items():
            if group["count"] < 2:
                continue

            varying_id_columns = [
                column
                for column, values in group["varying_id_values"].items()
                if len({value for value in values if value}) > 1
            ]

            confidence = "high" if len(duplicate_key_columns) >= 3 else "medium"

            reason = (
                f"{group['count']} rows share the same values across "
                f"{len(duplicate_key_columns)} duplicate-check column(s)."
            )

            if varying_id_columns:
                reason += " One or more ID-like fields differ."

            duplicate_groups_all.append({
                "group_id": f"csv-{make_group_id(list(key_values))}",
                "confidence": confidence,
                "reason": reason,
                "matching_columns": duplicate_key_columns,
                "varying_id_columns": varying_id_columns,
                "rows": group["rows"],
                "row_numbers": group["row_numbers"],
                "rows_total": group["count"],
                "hidden_rows_count": max(0, group["count"] - len(group["rows"])),
            })

        duplicate_groups_all.sort(
            key=lambda group: (group["rows_total"], group["confidence"] == "high"),
            reverse=True,
        )

        duplicate_groups = duplicate_groups_all[:DUPLICATE_GROUP_LIMIT]
        duplicate_groups_total = len(duplicate_groups_all)
        hidden_duplicate_groups_count = max(0, duplicate_groups_total - len(duplicate_groups))

        duplicate_candidates_count = len(duplicate_groups_all)

        emit_progress(
            rows_scanned=row_count,
            current_stage="building_duplicate_groups",
            duplicate_candidates=duplicate_candidates_count,
            suspicious_values=suspicious_values_count,
            missing_values=missing_values_count,
        )

        duplicate_row_numbers_to_exclude = []

        review_queue = {
            "high_priority": [],
            "medium_priority": [],
            "low_priority": [],
        }

        duplicate_group_samples = {
            "high_priority": [],
            "medium_priority": [],
            "low_priority": [],
        }

        for group in duplicate_groups_all:
            queue_item = {
                "group_id": group["group_id"],
                "confidence": group["confidence"],
                "rows_total": group["rows_total"],
                "reason": group["reason"],
            }

            if group["confidence"] == "high" and group["rows_total"] >= 3:
                bucket = "high_priority"
            elif group["confidence"] == "high" or group["rows_total"] >= 3:
                bucket = "medium_priority"
            else:
                bucket = "low_priority"

            review_queue[bucket].append(queue_item)

            if len(duplicate_group_samples[bucket]) < DUPLICATE_GROUP_SAMPLE_LIMIT_PER_BUCKET:
                duplicate_group_samples[bucket].append(group)

        for group in duplicate_groups_all:
            row_numbers = group.get("row_numbers", [])
            duplicate_row_numbers_to_exclude.extend(row_numbers[1:])

        column_profiles = {}
        empty_columns = []
        near_empty_columns = []

        for column in columns:
            stat = stats[column]
            empty_count = stat["empty"]
            non_empty_count = stat["non_empty"]

            if row_count > 0 and empty_count == row_count:
                empty_columns.append(column)
            elif row_count > 0 and empty_count / row_count >= 0.9:
                near_empty_columns.append(column)

            column_profiles[column] = {
                "name": column,
                "inferred_type": infer_type_from_counts(
                    non_empty_count,
                    stat["number"],
                    stat["date"],
                    stat["boolean"],
                ),
                "non_empty_count": non_empty_count,
                "empty_count": empty_count,
                "unique_count": len(stat["unique_values"]),
                "sample_values": stat["sample_values"],
            }

        suspicious_value_summary = {
            "total": sum(suspicious_by_column.values()),
            "by_column": dict(suspicious_by_column),
            "by_issue": dict(suspicious_by_issue),
            "examples": suspicious_examples,
            "row_numbers": sorted(suspicious_row_numbers),
        }

        duplicate_signal_count = len(duplicate_row_numbers_to_exclude)

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

        if duplicate_groups_total > 0:
            suggestions.append({
                "id": "review_duplicate_records",
                "label": "Review duplicate records",
                "severity": "medium",
                "reason": f"{duplicate_groups_total} duplicate-like group(s) detected.",
                "count": duplicate_groups_total,
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
            duplicate_signal_count=duplicate_signal_count,
            duplicate_groups_total=duplicate_groups_total,
            empty_columns=empty_columns,
            near_empty_columns=near_empty_columns,
            column_profiles=column_profiles,
            suspicious_value_summary=suspicious_value_summary,
        )

        emit_progress(
            rows_scanned=row_count,
            current_stage="finalizing_results",
            duplicate_candidates=duplicate_candidates_count,
            suspicious_values=suspicious_values_count,
            missing_values=missing_values_count,
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
            "duplicate_row_count": exact_duplicate_row_count,
            "duplicate_groups_total": duplicate_groups_total,
            "duplicate_groups": duplicate_groups,
            "hidden_duplicate_groups_count": hidden_duplicate_groups_count,
            "review_queue": review_queue,
            "duplicate_group_samples": duplicate_group_samples,
            "duplicate_row_numbers_to_exclude": duplicate_row_numbers_to_exclude,
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