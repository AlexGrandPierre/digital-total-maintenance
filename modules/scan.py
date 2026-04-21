import os
import json
import sys
import time
import re
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_TARGET = os.path.expanduser("~/Desktop")

# -----------------------------
# Safety / scale configuration
# -----------------------------
MAX_REVIEW_ITEMS = 100
MAX_ARCHIVE_ITEMS = 100
MAX_REMOVE_ITEMS = 100
MAX_SYSTEM_ITEMS = 100
MAX_DUPLICATES = 100
MAX_ERRORS = 100

EXCLUDED_DIR_NAMES = {
    "node_modules",
    ".git",
    ".Trash",
    "DTM Review",
    "DTM Archive",
    "__pycache__",
    ".venv",
    "venv",
    "dist",
    "build",
    ".next",
    ".cache",
    ".npm",
    ".yarn",
}

SYSTEM_FILENAMES = {
    ".ds_store",
    "thumbs.db",
    "desktop.ini",
    ".localized",
}

DOCUMENT_EXTS = {
    ".pdf", ".doc", ".docx", ".txt", ".md", ".rtf", ".odt"
}

IMAGE_EXTS = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".heic"
}

ARCHIVE_EXTS = {
    ".zip", ".tar", ".gz", ".7z", ".rar", ".bz2"
}

CODE_EXTS = {
    ".py", ".js", ".ts", ".tsx", ".jsx", ".json", ".yaml", ".yml",
    ".html", ".css", ".sh", ".cjs", ".mjs", ".toml", ".rs", ".lock", ".gitignore", ".map"
}

CLUTTER_EXTS = {
    ".log", ".tmp", ".cache", ".bak", ".old", ".part"
}

APP_EXTS = {
    ".dmg", ".pkg", ".exe", ".msi", ".app"
}


def emit_progress(payload: dict) -> None:
    print(json.dumps({"type": "progress", **payload}), flush=True)


def emit_final(result: dict) -> None:
    print(json.dumps({"type": "final", "result": result}), flush=True)


def get_age_days(mtime: float) -> int:
    now = datetime.now(timezone.utc)
    modified = datetime.fromtimestamp(mtime, timezone.utc)
    return (now - modified).days


def normalize_target(target_dir: str) -> str:
    return str(Path(target_dir).expanduser().resolve())


def is_root_or_system_heavy_target(target_dir: str) -> bool:
    normalized = normalize_target(target_dir)
    return normalized in {"/", str(Path.home().resolve())}


def classify_file(filename: str, full_path: str, age_days: int, size: int) -> dict:
    name = filename.lower()
    ext = os.path.splitext(name)[1].lower()
    normalized_path = full_path.lower()

    if name in SYSTEM_FILENAMES:
        return {
            "category": "system",
            "confidence": "high",
            "recommended_action": "ignore",
            "reason": "System metadata file created automatically by the operating system.",
            "ui_visibility": "hidden_by_default",
        }

    if "/node_modules/" in normalized_path:
        return {
            "category": "code",
            "confidence": "medium",
            "recommended_action": "ignore",
            "reason": "Dependency file inside a generated package directory.",
            "ui_visibility": "hidden_by_default",
        }

    if "/.git/" in normalized_path:
        return {
            "category": "system",
            "confidence": "high",
            "recommended_action": "ignore",
            "reason": "Version control internal file.",
            "ui_visibility": "hidden_by_default",
        }

    if "/dtm review/" in normalized_path or "/dtm archive/" in normalized_path:
        return {
            "category": "system",
            "confidence": "high",
            "recommended_action": "ignore",
            "reason": "DTM-managed file in a controlled workflow folder.",
            "ui_visibility": "hidden_by_default",
        }

    if ext in DOCUMENT_EXTS:
        return {
            "category": "document",
            "confidence": "high",
            "recommended_action": "keep",
            "reason": "Common document format.",
            "ui_visibility": "normal",
        }

    if ext in IMAGE_EXTS:
        return {
            "category": "image",
            "confidence": "high",
            "recommended_action": "keep",
            "reason": "Common image file.",
            "ui_visibility": "normal",
        }

    if ext in ARCHIVE_EXTS:
        action = "review" if age_days < 60 else "archive"
        return {
            "category": "archive",
            "confidence": "high",
            "recommended_action": action,
            "reason": "Compressed archive file often used for bundling, transfer, or backup.",
            "ui_visibility": "normal",
        }

    if ext in CODE_EXTS:
        return {
            "category": "code",
            "confidence": "high",
            "recommended_action": "keep",
            "reason": "Code, configuration, or development support file.",
            "ui_visibility": "normal",
        }

    if ext in CLUTTER_EXTS:
        action = "remove" if age_days > 30 else "review"
        return {
            "category": "clutter",
            "confidence": "high",
            "recommended_action": action,
            "reason": "Temporary, log, or disposable support file.",
            "ui_visibility": "normal",
        }

    if ext in APP_EXTS:
        return {
            "category": "app_or_installer",
            "confidence": "high",
            "recommended_action": "review",
            "reason": "Installer or executable-like file that may need confirmation before keeping.",
            "ui_visibility": "normal",
        }

    if ext == "":
        return {
            "category": "unknown",
            "confidence": "medium",
            "recommended_action": "review",
            "reason": "File has no extension, so its purpose is less obvious.",
            "ui_visibility": "normal",
        }

    return {
        "category": "unknown",
        "confidence": "low",
        "recommended_action": "review",
        "reason": "File type is not yet confidently classified.",
        "ui_visibility": "normal",
    }


def maybe_append(bucket: list, item, cap: int) -> None:
    if len(bucket) < cap:
        bucket.append(item)

COPY_MARKER_PATTERN = re.compile(
    r"(\s*\(\d+\)$)|(\s*copy(?:\s+\d+)?$)|(\s*-\s*copy(?:\s+\d+)?$)|(\s*_copy(?:_\d+)?$)",
    re.IGNORECASE
)


def normalize_duplicate_name(filename: str) -> str:
    stem, ext = os.path.splitext(filename)
    normalized_stem = stem.strip()

    while True:
        cleaned = COPY_MARKER_PATTERN.sub("", normalized_stem).strip()
        if cleaned == normalized_stem:
            break
        normalized_stem = cleaned

    normalized_stem = re.sub(r"\s+", " ", normalized_stem).strip().lower()
    return f"{normalized_stem}{ext.lower()}"


def get_duplicate_group_confidence(group_items: list) -> str:
    if len(group_items) >= 3:
        return "high"
    return "medium"


def get_duplicate_group_reason(normalized_name: str, ext: str, size: int, count: int) -> str:
    ext_label = ext if ext and ext != "no_ext" else "no extension"
    return (
        f"{count} files share a normalized name pattern ({normalized_name}), "
        f"extension ({ext_label}), and file size ({size} bytes)."
    )


def build_duplicate_groups(duplicate_candidates: dict, cap: int) -> tuple[list, int]:
    groups = []

    for key, items in duplicate_candidates.items():
        if len(items) < 2:
            continue

        normalized_name, ext, size = key

        sorted_items = sorted(
            items,
            key=lambda item: (
                "(1)" in item["name"].lower()
                or "copy" in item["name"].lower(),
                item["age_days"],
                item["path"].lower(),
            )
        )

        group = {
            "group_id": f"dup_{len(groups) + 1}",
            "confidence": get_duplicate_group_confidence(sorted_items),
            "reason": get_duplicate_group_reason(normalized_name, ext, size, len(sorted_items)),
            "normalized_name": normalized_name,
            "items": sorted_items,
        }

        if len(groups) < cap:
            groups.append(group)

    total = sum(1 for items in duplicate_candidates.values() if len(items) >= 2)
    return groups, total


def scan_folder(target_dir: str) -> dict:
    target_dir = normalize_target(target_dir)
    started_at = time.time()
    last_progress_emit = started_at

    files_scanned = 0
    by_ext = {}
    duplicate_candidates = {}

    review_files = []
    system_files = []
    archive_candidates = []
    remove_candidates = []
    errors = []

    review_total = 0
    system_total = 0
    archive_total = 0
    remove_total = 0
    duplicates_total = 0
    excluded_dirs_count = 0

    age_buckets = {
        "<30d": 0,
        "30-180d": 0,
        ">180d": 0,
    }

    scan_warnings = []
    if is_root_or_system_heavy_target(target_dir):
        scan_warnings.append(
            "Large or system-heavy scan target detected. Results are summarized and detailed queues are capped for safety."
        )

    emit_progress({
        "status": "starting",
        "target": target_dir,
        "files_scanned": 0,
        "current_path": target_dir,
        "elapsed_seconds": 0,
        "review_total": 0,
        "archive_total": 0,
        "remove_total": 0,
        "duplicates_total": 0,
    })

    for root, dirs, filenames in os.walk(target_dir, topdown=True):
        original_dir_count = len(dirs)
        dirs[:] = [d for d in dirs if d not in EXCLUDED_DIR_NAMES]
        excluded_dirs_count += original_dir_count - len(dirs)

        now = time.time()
        if now - last_progress_emit >= 0.5:
            emit_progress({
                "status": "scanning",
                "target": target_dir,
                "files_scanned": files_scanned,
                "current_path": root,
                "elapsed_seconds": round(now - started_at, 1),
                "review_total": review_total,
                "archive_total": archive_total,
                "remove_total": remove_total,
                "duplicates_total": duplicates_total,
                "excluded_dirs_count": excluded_dirs_count,
            })
            last_progress_emit = now

        for filename in filenames:
            full_path = os.path.join(root, filename)

            try:
                stat = os.stat(full_path)
                size = stat.st_size
                age_days = get_age_days(stat.st_mtime)
                ext = os.path.splitext(filename)[1].lower() or "no_ext"

                files_scanned += 1

                if age_days < 30:
                    age_buckets["<30d"] += 1
                elif age_days <= 180:
                    age_buckets["30-180d"] += 1
                else:
                    age_buckets[">180d"] += 1

                by_ext[ext] = by_ext.get(ext, 0) + 1

                classification = classify_file(filename, full_path, age_days, size)

                entry = {
                    "name": filename,
                    "path": full_path,
                    "size": size,
                    "age_days": age_days,
                    "ext": ext,
                    "hash": None,
                    "category": classification["category"],
                    "confidence": classification["confidence"],
                    "recommended_action": classification["recommended_action"],
                    "reason": classification["reason"],
                    "ui_visibility": classification["ui_visibility"],
                }

                action = entry["recommended_action"]
                category = entry["category"]

                if action == "review":
                    review_total += 1
                    maybe_append(review_files, entry, MAX_REVIEW_ITEMS)

                if action == "archive":
                    archive_total += 1
                    maybe_append(archive_candidates, entry, MAX_ARCHIVE_ITEMS)

                if action == "remove":
                    remove_total += 1
                    maybe_append(remove_candidates, entry, MAX_REMOVE_ITEMS)

                if category == "system":
                    system_total += 1
                    maybe_append(system_files, entry, MAX_SYSTEM_ITEMS)

                normalized_duplicate_name = normalize_duplicate_name(filename)
                duplicate_sig = (normalized_duplicate_name, ext, size)

                duplicate_candidates.setdefault(duplicate_sig, []).append({
                    "name": filename,
                    "path": full_path,
                    "size": size,
                    "age_days": age_days,
                    "ext": ext,
                    "category": classification["category"],
                    "confidence": classification["confidence"],
                    "recommended_action": classification["recommended_action"],
                    "reason": classification["reason"],
                    "ui_visibility": classification["ui_visibility"],
                })

            except Exception as e:
                maybe_append(
                    errors,
                    {
                        "name": filename,
                        "path": full_path,
                        "error": str(e),
                    },
                    MAX_ERRORS
                )

    sorted_ext = dict(sorted(by_ext.items(), key=lambda item: item[1], reverse=True))

    duplicate_groups, duplicates_total = build_duplicate_groups(
        duplicate_candidates,
        MAX_DUPLICATES
    )

    result = {
        "scanned_at": datetime.now(timezone.utc).isoformat(),
        "folder": target_dir,
        "mode": "bounded-safe",
        "scan_warnings": scan_warnings,
        "total_files": files_scanned,
        "review_files": review_files,
        "review_total": review_total,
        "system_files": system_files,
        "system_total": system_total,
        "archive_candidates": archive_candidates,
        "archive_total": archive_total,
        "remove_candidates": remove_candidates,
        "remove_total": remove_total,
        "duplicates": duplicate_groups,
        "duplicates_total": duplicates_total,
        "age_buckets": age_buckets,
        "by_ext": sorted_ext,
        "errors": errors,
        "errors_total": len(errors),
        "excluded_dirs_count": excluded_dirs_count,
        "detail_caps": {
            "review_files": MAX_REVIEW_ITEMS,
            "system_files": MAX_SYSTEM_ITEMS,
            "archive_candidates": MAX_ARCHIVE_ITEMS,
            "remove_candidates": MAX_REMOVE_ITEMS,
            "duplicates": MAX_DUPLICATES,
            "errors": MAX_ERRORS,
        },
    }

    emit_progress({
        "status": "finalizing",
        "target": target_dir,
        "files_scanned": files_scanned,
        "current_path": target_dir,
        "elapsed_seconds": round(time.time() - started_at, 1),
        "review_total": review_total,
        "archive_total": archive_total,
        "remove_total": remove_total,
        "duplicates_total": duplicates_total,
        "excluded_dirs_count": excluded_dirs_count,
    })

    return result


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_TARGET
    result = scan_folder(target)
    emit_final(result)
