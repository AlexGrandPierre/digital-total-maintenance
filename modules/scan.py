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
    ".pdf", ".doc", ".docx", ".txt", ".md", ".rtf", ".odt",
    ".ppt", ".pptx", ".xls", ".xlsx", ".csv", ".tsv",
    ".pages", ".key", ".numbers"
}

IMAGE_EXTS = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".heic"
}

ARCHIVE_EXTS = {
    ".zip", ".tar", ".gz", ".7z", ".rar", ".bz2"
}

CODE_EXTS = {
    ".py", ".js", ".ts", ".tsx", ".jsx", ".json", ".yaml", ".yml",
    ".html", ".css", ".sh", ".cjs", ".mjs", ".toml", ".rs", ".lock",
    ".gitignore", ".map", ".ipynb", ".sql", ".env", ".ini", ".cfg"
}

CLUTTER_EXTS = {
    ".log", ".tmp", ".cache", ".bak", ".old", ".part"
}

APP_EXTS = {
    ".dmg", ".pkg", ".exe", ".msi", ".app"
}

AUDIO_EXTS = {
    ".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"
}

VIDEO_EXTS = {
    ".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v"
}

DATA_EXTS = {
    ".sqlite", ".db", ".parquet", ".feather", ".h5", ".hdf5", ".pkl", ".pickle"
}

MARKUP_EXTS = {
    ".xml", ".plist", ".xsd", ".wsdl"
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


def build_location_context_config() -> dict:
    home = str(Path.home().resolve())
    desktop = str((Path.home() / "Desktop").resolve())
    downloads = str((Path.home() / "Downloads").resolve())
    documents = str((Path.home() / "Documents").resolve())

    return {
        "home": home.lower(),
        "home_prefix": home.lower() + "/",
        "desktop": desktop.lower(),
        "desktop_prefix": desktop.lower() + "/",
        "downloads_prefix": downloads.lower() + "/",
        "documents_prefix": documents.lower() + "/",
    }


def get_location_context(normalized_path: str, context_config: dict) -> str:
    if "/dtm review/" in normalized_path:
        return "dtm_review_managed"
    if "/dtm archive/" in normalized_path:
        return "dtm_archive_managed"
    if "/node_modules/" in normalized_path:
        return "generated_dependency_tree"
    if "/.git/" in normalized_path:
        return "version_control_internal"

    if normalized_path.startswith(context_config["downloads_prefix"]):
        return "downloads_workspace"

    if normalized_path.startswith(context_config["documents_prefix"]):
        return "documents_workspace"

    if normalized_path.startswith(context_config["desktop_prefix"]):
        relative = normalized_path[len(context_config["desktop_prefix"]):]
        if "/" not in relative:
            return "desktop_loose_file"
        return "desktop_nested_folder"

    if normalized_path.startswith(context_config["home_prefix"]):
        return "home_subdirectory"

    return "general_folder"


def get_known_type_explanation(ext: str, file_kind: str) -> str:
    if file_kind == "system_metadata":
        return "Operating system metadata or internal support file."
    if file_kind == "version_control_internal":
        return "Version control support file used by Git."
    if file_kind == "generated_dependency":
        return "Generated dependency or package-managed support file."
    if file_kind == "document":
        return "Recognized document, office, text, or tabular content format."
    if file_kind == "image":
        return "Recognized image format."
    if file_kind == "archive":
        return "Compressed archive format used for bundling or transfer."
    if file_kind == "code_or_config":
        return "Recognized source code, notebook, configuration, or development support format."
    if file_kind == "temporary_or_log":
        return "Temporary, partial, backup, cache, or log-like file."
    if file_kind == "app_or_installer":
        return "Installer, application bundle, or executable-like package."
    if file_kind == "audio":
        return "Recognized audio media format."
    if file_kind == "video":
        return "Recognized video media format."
    if file_kind == "data_store":
        return "Recognized data or database storage format."
    if file_kind == "extensionless":
        return "File has no extension, so type identification is weaker."
    return "File type is not yet confidently recognized by DTM."

def build_low_confidence_explanation(
    ext: str,
    location_context: str,
    recognized_kind: str | None = None
) -> dict:
    readable_ext = ext if ext else "no extension"

    if recognized_kind == "structured_markup":
        return {
            "file_kind": "structured_markup",
            "category": "unknown",
            "known_type_explanation": "XML and related markup files are structured text formats often used for configuration, metadata, data exchange, or application support.",
            "classification_reason": f"Extension {readable_ext} identifies the file as structured markup, but not its exact role.",
            "confidence": "medium",
            "confidence_reason": "DTM recognizes the format, but the file's purpose depends heavily on project or application context.",
            "recommended_action": "review",
            "suggested_action_reason": "Because the format is known but the role is ambiguous in this location, Review is safer than automatic archive or removal.",
            "reason": "Structured markup file with an unclear role in this location.",
            "risk_flags": ["ambiguous_role", "structured_text"],
        }

    if ext == "":
        return {
            "file_kind": "extensionless",
            "category": "unknown",
            "known_type_explanation": "This file has no extension, so DTM has less type information than usual.",
            "classification_reason": "The file does not expose a recognizable extension.",
            "confidence": "medium",
            "confidence_reason": "Location offers limited contextual clues, but the file type itself remains implicit.",
            "recommended_action": "review",
            "suggested_action_reason": "A file with no extension may still be important, so Review is safer than aggressive relocation.",
            "reason": "Extensionless file with an unclear role.",
            "risk_flags": ["ambiguous_type"],
        }

    return {
        "file_kind": "unknown",
        "category": "unknown",
        "known_type_explanation": "DTM does not yet have a confident built-in interpretation for this extension.",
        "classification_reason": f"Extension {readable_ext} is not yet mapped to a stronger DTM file-kind taxonomy.",
        "confidence": "low",
        "confidence_reason": "The file type is not yet well understood enough for stronger deterministic classification.",
        "recommended_action": "review",
        "suggested_action_reason": "When DTM cannot confidently infer the file's role, Review is the safest queue.",
        "reason": "Unfamiliar file type that needs human review.",
        "risk_flags": ["unknown_type"],
    }

def classify_file(
    filename: str,
    normalized_path: str,
    age_days: int,
    ext: str,
    context_config: dict
) -> dict:
    name = filename.lower()
    location_context = get_location_context(normalized_path, context_config)

    if name in SYSTEM_FILENAMES:
        return {
            "file_kind": "system_metadata",
            "category": "system",
            "location_context": location_context,
            "known_type_explanation": get_known_type_explanation(ext, "system_metadata"),
            "classification_reason": "Filename matches a known operating system metadata artifact.",
            "confidence": "high",
            "confidence_reason": "This is a well-known system-generated filename.",
            "recommended_action": "ignore",
            "suggested_action_reason": "System metadata is usually safe to ignore in maintenance review.",
            "reason": "System metadata file created automatically by the operating system.",
            "risk_flags": ["system_file", "low_user_value"],
            "ui_visibility": "hidden_by_default",
        }

    if "/node_modules/" in normalized_path:
        return {
            "file_kind": "generated_dependency",
            "category": "code",
            "location_context": location_context,
            "known_type_explanation": get_known_type_explanation(ext, "generated_dependency"),
            "classification_reason": "Path indicates the file is inside a generated dependency tree.",
            "confidence": "medium",
            "confidence_reason": "Directory context is strong, though individual files may vary.",
            "recommended_action": "ignore",
            "suggested_action_reason": "Dependency trees are usually generated and too noisy for direct maintenance review.",
            "reason": "Dependency file inside a generated package directory.",
            "risk_flags": ["generated_content", "bulk_noise"],
            "ui_visibility": "hidden_by_default",
        }

    if "/.git/" in normalized_path:
        return {
            "file_kind": "version_control_internal",
            "category": "system",
            "location_context": location_context,
            "known_type_explanation": get_known_type_explanation(ext, "version_control_internal"),
            "classification_reason": "Path indicates the file belongs to a Git internal directory.",
            "confidence": "high",
            "confidence_reason": "Git internal paths are strongly identifiable.",
            "recommended_action": "ignore",
            "suggested_action_reason": "Version control internals should not be surfaced as active maintenance targets.",
            "reason": "Version control internal file.",
            "risk_flags": ["system_file", "project_internal"],
            "ui_visibility": "hidden_by_default",
        }

    if "/dtm review/" in normalized_path or "/dtm archive/" in normalized_path:
        return {
            "file_kind": "dtm_managed_file",
            "category": "system",
            "location_context": location_context,
            "known_type_explanation": "DTM-managed file already placed in a controlled maintenance folder.",
            "classification_reason": "Path indicates the file is already inside a DTM-managed workflow directory.",
            "confidence": "high",
            "confidence_reason": "DTM-managed folder placement is explicit.",
            "recommended_action": "ignore",
            "suggested_action_reason": "Files already under DTM workflow management should not be re-queued during scans.",
            "reason": "DTM-managed file in a controlled workflow folder.",
            "risk_flags": ["dtm_managed"],
            "ui_visibility": "hidden_by_default",
        }

    if ext in DOCUMENT_EXTS:
        recommended_action = "keep"
        suggested_action_reason = "Recognized document and office formats are usually user-authored content worth keeping visible."

        if location_context == "downloads_workspace" and age_days > 120:
            recommended_action = "archive"
            suggested_action_reason = "Older documents in Downloads are often worth keeping, but not necessarily keeping in the active workspace."

        return {
            "file_kind": "document",
            "category": "document",
            "location_context": location_context,
            "known_type_explanation": get_known_type_explanation(ext, "document"),
            "classification_reason": f"Extension {ext or '[none]'} matches a recognized document or office format.",
            "confidence": "high",
            "confidence_reason": "The extension is commonly associated with user-authored document content.",
            "recommended_action": recommended_action,
            "suggested_action_reason": suggested_action_reason,
            "reason": "Common document format.",
            "risk_flags": ["user_content"],
            "ui_visibility": "normal",
        }

    if ext in IMAGE_EXTS:
        return {
            "file_kind": "image",
            "category": "image",
            "location_context": location_context,
            "known_type_explanation": get_known_type_explanation(ext, "image"),
            "classification_reason": f"Extension {ext} matches a recognized image format.",
            "confidence": "high",
            "confidence_reason": "The extension is a common image type.",
            "recommended_action": "keep",
            "suggested_action_reason": "Recognized image files are usually user content and should not be aggressively reclassified.",
            "reason": "Common image file.",
            "risk_flags": ["user_content"],
            "ui_visibility": "normal",
        }

    if ext in AUDIO_EXTS:
        return {
            "file_kind": "audio",
            "category": "media",
            "location_context": location_context,
            "known_type_explanation": get_known_type_explanation(ext, "audio"),
            "classification_reason": f"Extension {ext} matches a recognized audio format.",
            "confidence": "high",
            "confidence_reason": "The extension strongly indicates an audio media file.",
            "recommended_action": "keep",
            "suggested_action_reason": "Media files are usually user-meaningful content unless stronger context suggests otherwise.",
            "reason": "Recognized audio file.",
            "risk_flags": ["user_content"],
            "ui_visibility": "normal",
        }

    if ext in VIDEO_EXTS:
        return {
            "file_kind": "video",
            "category": "media",
            "location_context": location_context,
            "known_type_explanation": get_known_type_explanation(ext, "video"),
            "classification_reason": f"Extension {ext} matches a recognized video format.",
            "confidence": "high",
            "confidence_reason": "The extension strongly indicates a video media file.",
            "recommended_action": "keep",
            "suggested_action_reason": "Video files are usually user-meaningful content unless stronger context suggests otherwise.",
            "reason": "Recognized video file.",
            "risk_flags": ["user_content", "large_file_possible"],
            "ui_visibility": "normal",
        }

    if ext in ARCHIVE_EXTS:
        action = "review" if age_days < 60 else "archive"
        action_reason = (
            "Recently modified archives may still be active bundles or transfers, so review is safer."
            if action == "review"
            else "Older archives are often better candidates for storage than active workspace visibility."
        )
        return {
            "file_kind": "archive",
            "category": "archive",
            "location_context": location_context,
            "known_type_explanation": get_known_type_explanation(ext, "archive"),
            "classification_reason": f"Extension {ext} matches a recognized compressed archive format.",
            "confidence": "high",
            "confidence_reason": "Archive extensions are typically unambiguous.",
            "recommended_action": action,
            "suggested_action_reason": action_reason,
            "reason": "Compressed archive file often used for bundling, transfer, or backup.",
            "risk_flags": ["compressed_container"],
            "ui_visibility": "normal",
        }

    if ext in CODE_EXTS:
        recommended_action = "keep"
        suggested_action_reason = "Recognized code and configuration files are often active project material."

        if location_context == "downloads_workspace" and age_days > 180:
            recommended_action = "review"
            suggested_action_reason = "Older code or config files in Downloads are identifiable, but context remains ambiguous enough to review."

        return {
            "file_kind": "code_or_config",
            "category": "code",
            "location_context": location_context,
            "known_type_explanation": get_known_type_explanation(ext, "code_or_config"),
            "classification_reason": f"Extension {ext} matches a recognized source, notebook, config, or dev-support format.",
            "confidence": "high",
            "confidence_reason": "The extension strongly indicates development-related material.",
            "recommended_action": recommended_action,
            "suggested_action_reason": suggested_action_reason,
            "reason": "Code, configuration, or development support file.",
            "risk_flags": ["project_material"],
            "ui_visibility": "normal",
        }

    if ext in DATA_EXTS:
        recommended_action = "review" if location_context in {"downloads_workspace", "desktop_loose_file"} else "keep"
        suggested_action_reason = (
            "Data and database files are identifiable, but loose placement can make intended use unclear."
            if recommended_action == "review"
            else "Recognized data storage files may be important project or application material."
        )
        confidence = "medium" if recommended_action == "review" else "high"
        confidence_reason = (
            "The file type is recognizable, but its intended role is harder to infer from this location."
            if recommended_action == "review"
            else "The file type is recognizable and the location does not strongly suggest it is disposable."
        )
        return {
            "file_kind": "data_store",
            "category": "data",
            "location_context": location_context,
            "known_type_explanation": get_known_type_explanation(ext, "data_store"),
            "classification_reason": f"Extension {ext} matches a recognized data or database storage format.",
            "confidence": confidence,
            "confidence_reason": confidence_reason,
            "recommended_action": recommended_action,
            "suggested_action_reason": suggested_action_reason,
            "reason": "Recognized data or database file.",
            "risk_flags": ["important_data_possible"],
            "ui_visibility": "normal",
        }

    if ext in MARKUP_EXTS:
        low_conf = build_low_confidence_explanation(
            ext=ext,
            location_context=location_context,
            recognized_kind="structured_markup",
        )
        return {
            "file_kind": low_conf["file_kind"],
            "category": low_conf["category"],
            "location_context": location_context,
            "known_type_explanation": low_conf["known_type_explanation"],
            "classification_reason": low_conf["classification_reason"],
            "confidence": low_conf["confidence"],
            "confidence_reason": low_conf["confidence_reason"],
            "recommended_action": low_conf["recommended_action"],
            "suggested_action_reason": low_conf["suggested_action_reason"],
            "reason": low_conf["reason"],
            "risk_flags": low_conf["risk_flags"],
            "ui_visibility": "normal",
        }

    if ext in CLUTTER_EXTS:
        action = "remove" if age_days > 30 else "review"
        action_reason = (
            "Older temporary or log-like files are often safe cleanup candidates."
            if action == "remove"
            else "Recent temporary or partial files may still be in use, so review is safer."
        )
        return {
            "file_kind": "temporary_or_log",
            "category": "clutter",
            "location_context": location_context,
            "known_type_explanation": get_known_type_explanation(ext, "temporary_or_log"),
            "classification_reason": f"Extension {ext} matches a temporary, cache, backup, partial, or log-like pattern.",
            "confidence": "high",
            "confidence_reason": "These extensions are commonly associated with disposable support files.",
            "recommended_action": action,
            "suggested_action_reason": action_reason,
            "reason": "Temporary, log, or disposable support file.",
            "risk_flags": ["disposable_likely"],
            "ui_visibility": "normal",
        }

    if ext in APP_EXTS:
        return {
            "file_kind": "app_or_installer",
            "category": "app_or_installer",
            "location_context": location_context,
            "known_type_explanation": get_known_type_explanation(ext, "app_or_installer"),
            "classification_reason": f"Extension {ext} matches an installer, executable, or application package format.",
            "confidence": "high",
            "confidence_reason": "Installer and executable-like formats are strongly identifiable.",
            "recommended_action": "review",
            "suggested_action_reason": "Installers and executable packages may be useful, but deserve confirmation before keeping or relocating.",
            "reason": "Installer or executable-like file that may need confirmation before keeping.",
            "risk_flags": ["executable_like"],
            "ui_visibility": "normal",
        }

    if ext == "":
        low_conf = build_low_confidence_explanation(
            ext=ext,
            location_context=location_context,
        )
        return {
            "file_kind": low_conf["file_kind"],
            "category": low_conf["category"],
            "location_context": location_context,
            "known_type_explanation": low_conf["known_type_explanation"],
            "classification_reason": low_conf["classification_reason"],
            "confidence": low_conf["confidence"],
            "confidence_reason": low_conf["confidence_reason"],
            "recommended_action": low_conf["recommended_action"],
            "suggested_action_reason": low_conf["suggested_action_reason"],
            "reason": low_conf["reason"],
            "risk_flags": low_conf["risk_flags"],
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
    context_config = build_location_context_config()

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
    errors_total = 0

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
                ext = os.path.splitext(filename)[1].lower()
                entry_ext = ext or "no_ext"
                normalized_path = full_path.lower()

                files_scanned += 1

                if age_days < 30:
                    age_buckets["<30d"] += 1
                elif age_days <= 180:
                    age_buckets["30-180d"] += 1
                else:
                    age_buckets[">180d"] += 1

                by_ext[entry_ext] = by_ext.get(entry_ext, 0) + 1

                classification = classify_file(
                    filename=filename,
                    normalized_path=normalized_path,
                    age_days=age_days,
                    ext=ext,
                    context_config=context_config,
                )

                entry = {
                    "name": filename,
                    "path": full_path,
                    "size": size,
                    "age_days": age_days,
                    "ext": entry_ext,
                    "hash": None,
                    "category": classification["category"],
                    "file_kind": classification["file_kind"],
                    "location_context": classification["location_context"],
                    "known_type_explanation": classification["known_type_explanation"],
                    "classification_reason": classification["classification_reason"],
                    "confidence": classification["confidence"],
                    "confidence_reason": classification["confidence_reason"],
                    "recommended_action": classification["recommended_action"],
                    "suggested_action_reason": classification["suggested_action_reason"],
                    "reason": classification["reason"],
                    "risk_flags": classification["risk_flags"],
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

                duplicate_candidates.setdefault(
                    (normalize_duplicate_name(filename), entry_ext, size),
                    []
                ).append({
                    "name": filename,
                    "path": full_path,
                    "size": size,
                    "age_days": age_days,
                    "ext": entry_ext,
                    "category": classification["category"],
                    "confidence": classification["confidence"],
                    "recommended_action": classification["recommended_action"],
                    "reason": classification["reason"],
                    "ui_visibility": classification["ui_visibility"],
                })

            except Exception as e:
                errors_total += 1
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
        "errors_total": errors_total,
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
