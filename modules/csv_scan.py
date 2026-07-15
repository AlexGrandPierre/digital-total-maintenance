import csv
import hashlib
import json
import os
import re
import sys
import time
from collections import Counter
from datetime import datetime
from pathlib import Path


PREVIEW_ROW_LIMIT = 10
SAMPLE_VALUE_LIMIT = 5
SUSPICIOUS_EXAMPLE_LIMIT = 1000
DUPLICATE_GROUP_LIMIT = 1000
DUPLICATE_GROUP_ROW_LIMIT = 8
DUPLICATE_GROUP_SAMPLE_LIMIT_PER_BUCKET = 1000

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
    total_rows_estimate=None,
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
        "total_rows_estimate": total_rows_estimate,
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

def normalize_identity_column_role(column):
    normalized = normalize_column_name(column)

    if normalized in {"first name", "firstname", "given name", "legal first name"}:
        return "given_name"

    if normalized in {"last name", "lastname", "surname", "family name", "legal last name"}:
        return "family_name"

    if normalized in {"date of birth", "dob", "birth date", "birthdate"}:
        return "date_of_birth"

    if normalized in {"gender", "sex"}:
        return "gender"

    if normalized in {"gmsregistrationnumber", "gms registration number", "gms registration no"}:
        return "gms_registration_number"

    return None


def get_duplicate_priority(group, duplicate_key_columns):
    roles = {
        normalize_identity_column_role(column)
        for column in duplicate_key_columns
    }
    roles.discard(None)

    strict_roles = {"given_name", "family_name", "date_of_birth", "gender"}
    matched_strict_count = len(roles.intersection(strict_roles))

    has_gms_signal = False
    for column, values in group.get("varying_id_values", {}).items():
        if normalize_identity_column_role(column) == "gms_registration_number":
            non_empty_values = {value for value in values if value}
            if non_empty_values:
                has_gms_signal = True

    if matched_strict_count >= 4:
        return {
            "priority_score": 100 if has_gms_signal else 95,
            "priority_label": "critical",
            "priority_reason": "Rows match across the strict identity fields: given name, family name, date of birth, and gender.",
        }

    if matched_strict_count == 3:
        return {
            "priority_score": 80 if has_gms_signal else 75,
            "priority_label": "high",
            "priority_reason": "Rows match across three strong identity fields.",
        }

    if matched_strict_count == 2:
        return {
            "priority_score": 55 if has_gms_signal else 50,
            "priority_label": "medium",
            "priority_reason": "Rows match across two identity fields and should be reviewed with caution.",
        }

    return {
        "priority_score": 25,
        "priority_label": "low",
        "priority_reason": "Rows share a weaker duplicate signal and should be treated as low-priority review material.",
    }


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
    normalized_column = normalize_column_name(column)
    value_text = str(value).strip()
    value_lower = value_text.lower()

    is_id_like = any(
        hint in normalized_column
        for hint in ["id", "uuid", "guid", "code", "number", "no"]
    )

    is_email_like = "email" in normalized_column
    is_date_like_column = any(
        hint in normalized_column
        for hint in ["date", "dob", "birth"]
    )

    is_name_like = any(
        hint in normalized_column
        for hint in ["name", "firstname", "first name", "lastname", "last name", "surname"]
    )

    is_phone_like = any(
        hint in normalized_column
        for hint in ["phone", "mobile", "telephone", "tel"]
    )

    # Clearly corrupted / encoding-related
    if contains_suspicious_characters(value_text):
        issues.append("corrupted_or_control_characters")

    if contains_non_ascii_characters(value_text) and (
        is_id_like or is_email_like or is_date_like_column or is_phone_like
    ):
        issues.append("unexpected_non_ascii_in_structured_field")

    # Placeholder / default values
    if is_suspicious_default_date(value_text):
        issues.append("placeholder_or_default_date")

    if value_lower in {
        "unknown",
        "n/a",
        "na",
        "null",
        "none",
        "test",
        "dummy",
        "placeholder",
        "tbd",
    }:
        issues.append("placeholder_text_value")

    # Dates
    if is_date_like_column:
        parsed = parse_date(value_text)

        if parsed is None:
            issues.append("date_like_column_with_unparsed_value")
        else:
            current_year = datetime.now().year

            if parsed.year < 1900:
                issues.append("implausibly_old_date")
            elif parsed.year < 1926:
                issues.append("very_old_date")

            if parsed.year > current_year + 1:
                issues.append("future_date")

    # Email structure
    if is_email_like:
        if "@" not in value_lower:
            issues.append("email_like_column_without_email_format")
        elif not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", value_lower):
            issues.append("malformed_email_format")

    # Phone structure
    if is_phone_like:
        digits = re.sub(r"\D", "", value_text)

        if len(digits) > 0 and len(digits) < 7:
            issues.append("phone_number_too_short")

        if len(digits) > 15:
            issues.append("phone_number_too_long")

    # ID structure
    if is_id_like:
        if len(value_text) <= 2:
            issues.append("id_value_too_short")

        if any(space in value_text for space in [" ", "\t", "\n"]):
            issues.append("id_value_contains_whitespace")

    # Name structure
    if is_name_like:
        if any(char.isdigit() for char in value_text):
            issues.append("name_contains_digits")

        if len(value_text) == 1:
            issues.append("single_character_name")

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

def estimate_total_rows(csv_path):
    try:
        with open(csv_path, "rb") as file:
            sample = file.read(1024 * 1024)

        if not sample:
            return None

        newline_count = sample.count(b"\n")
        file_size = os.path.getsize(csv_path)

        if newline_count == 0:
            return None

        estimated_rows = int((newline_count / len(sample)) * file_size)

        return max(0, estimated_rows - 1)
    except Exception:
        return None

def make_dataset_id(csv_path):
    normalized = str(Path(csv_path).expanduser().resolve())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]


def get_csv_review_index_dir(dtm_root, csv_path):
    dataset_id = make_dataset_id(csv_path)
    index_dir = (
        Path(dtm_root)
        / "CSV Review Index"
        / dataset_id
    )
    index_dir.mkdir(parents=True, exist_ok=True)
    return index_dir


def write_jsonl(path, records):
    with open(path, "w", encoding="utf-8") as file:
        for record in records:
            file.write(json.dumps(record, ensure_ascii=False) + "\n")


def write_csv_review_index(dtm_root, csv_path, duplicate_groups, suspicious_examples):
    index_dir = get_csv_review_index_dir(dtm_root, csv_path)

    duplicate_index_path = index_dir / "duplicate-groups.jsonl"
    suspicious_index_path = index_dir / "suspicious-values.jsonl"
    summary_path = index_dir / "index-summary.json"

    write_jsonl(duplicate_index_path, duplicate_groups)
    write_jsonl(suspicious_index_path, suspicious_examples)

    summary = {
        "dataset_id": make_dataset_id(csv_path),
        "csv_path": str(Path(csv_path).expanduser().resolve()),
        "duplicate_groups_total": len(duplicate_groups),
        "suspicious_values_total": len(suspicious_examples),
        "duplicate_index_path": str(duplicate_index_path),
        "suspicious_index_path": str(suspicious_index_path),
    }

    with open(summary_path, "w", encoding="utf-8") as file:
        json.dump(summary, file, indent=2)

    return summary

def get_default_dtm_root():
    return str(Path.home() / "Desktop" / "Digital Total Maintenance")

def scan_csv(csv_path):
    if not csv_path or not os.path.exists(csv_path):
        return empty_csv_result(csv_path, f"CSV file does not exist: {csv_path}")

    try:
        preview_rows = []
        row_count = 0

        total_rows_estimate = estimate_total_rows(csv_path)

        duplicate_key_columns = []
        duplicate_groups_by_key = {}
        exact_row_signatures = Counter()

        suspicious_by_column = Counter()
        suspicious_by_issue = Counter()
        suspicious_examples = []
        suspicious_examples_all = []
        suspicious_row_numbers = set()

        duplicate_candidates_count = 0
        suspicious_values_count = 0
        missing_values_count = 0

        emit_progress(
            rows_scanned=0,
            current_stage="starting",
            duplicate_candidates=0,
            suspicious_values=0,
            missing_values=0,
            total_rows_estimate=total_rows_estimate,
        )

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

                        row_missing_count = sum(
                            1 for column_name in columns
                            if normalized_row.get(column_name, "") == ""
                        )

                        severity_score = min(100, (len(issues) * 30) + min(row_missing_count * 5, 40))

                        if severity_score >= 80:
                            severity_label = "critical"
                        elif severity_score >= 60:
                            severity_label = "high"
                        elif severity_score >= 35:
                            severity_label = "medium"
                        else:
                            severity_label = "low"

                        severity_reason = (
                            f"This cell has {len(issues)} suspicious signal"
                            f"{'' if len(issues) == 1 else 's'}"
                            f" and appears in a row with {row_missing_count} missing field"
                            f"{'' if row_missing_count == 1 else 's'}."
                        )

                        suspicious_record = {
                            "issue_id": f"csv-suspicious-{row_count}-{make_group_id([column, value])}",
                            "row_number": row_count,
                            "column": column,
                            "value": value,
                            "issues": issues,
                            "severity_score": severity_score,
                            "severity_label": severity_label,
                            "severity_reason": severity_reason,
                            "row_missing_count": row_missing_count,
                        }

                        suspicious_examples_all.append(suspicious_record)

                        if len(suspicious_examples) < SUSPICIOUS_EXAMPLE_LIMIT:
                            suspicious_examples.append(suspicious_record)

                if row_count % 1000 == 0:
                    live_duplicate_candidates = sum(
                        1 for group in duplicate_groups_by_key.values()
                        if group["count"] >= 2
                    )

                    emit_progress(
                        rows_scanned=row_count,
                        current_stage="analyzing_rows",
                        duplicate_candidates=live_duplicate_candidates,
                        suspicious_values=suspicious_values_count,
                        missing_values=missing_values_count,
                        total_rows_estimate=total_rows_estimate,
                    )

        live_duplicate_candidates = sum(
            1 for group in duplicate_groups_by_key.values()
            if group["count"] >= 2
        )

        emit_progress(
            rows_scanned=row_count,
            current_stage="building_duplicate_groups",
            duplicate_candidates=live_duplicate_candidates,
            suspicious_values=suspicious_values_count,
            missing_values=missing_values_count,
            total_rows_estimate=total_rows_estimate,
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

            priority = get_duplicate_priority(group, duplicate_key_columns)

            if varying_id_columns:
                reason += " One or more ID-like fields differ."

            duplicate_groups_all.append({
                "group_id": f"csv-{make_group_id(list(key_values))}",
                "confidence": confidence,
                "priority_score": priority["priority_score"],
                "priority_label": priority["priority_label"],
                "priority_reason": priority["priority_reason"],
                "reason": reason,
                "matching_columns": duplicate_key_columns,
                "varying_id_columns": varying_id_columns,
                "rows": group["rows"],
                "row_numbers": group["row_numbers"],
                "rows_total": group["count"],
                "hidden_rows_count": max(0, group["count"] - len(group["rows"])),
            })

        duplicate_groups_all.sort(
            key=lambda group: (
                group.get("priority_score", 0),
                group["rows_total"],
                group["confidence"] == "high",
            ),
            reverse=True,
        )

        duplicate_groups = duplicate_groups_all[:DUPLICATE_GROUP_LIMIT]
        duplicate_groups_total = len(duplicate_groups_all)
        hidden_duplicate_groups_count = max(0, duplicate_groups_total - len(duplicate_groups))
        duplicate_candidates_count = len(duplicate_groups_all)

        emit_progress(
            rows_scanned=row_count,
            current_stage="building_duplicate_groups",
            duplicate_candidates=live_duplicate_candidates,
            suspicious_values=suspicious_values_count,
            missing_values=missing_values_count,
            total_rows_estimate=total_rows_estimate,
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

        review_index_summary = write_csv_review_index(
            get_default_dtm_root(),
            csv_path,
            duplicate_groups_all,
            suspicious_examples_all,
        )

        emit_progress(
            rows_scanned=row_count,
            current_stage="finalizing_results",
            duplicate_candidates=live_duplicate_candidates,
            suspicious_values=suspicious_values_count,
            missing_values=missing_values_count,
            total_rows_estimate=total_rows_estimate,
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
            "review_index": review_index_summary,
        }

    except Exception as error:
        return empty_csv_result(csv_path, str(error))


if __name__ == "__main__":
    csv_path = sys.argv[1] if len(sys.argv) > 1 else ""
    print(json.dumps(scan_csv(csv_path)))