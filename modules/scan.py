import os
import json
import sys
import time
import re
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_TARGET = str(Path.home())

# -----------------------------
# Safety / scale configuration
# -----------------------------
MAX_REVIEW_ITEMS = 100
MAX_ARCHIVE_ITEMS = 100
MAX_REMOVE_ITEMS = 100
MAX_SYSTEM_ITEMS = 100
MAX_DUPLICATES = 100
MAX_ERRORS = 100
MAX_DUPLICATE_ITEMS_PER_GROUP = 7
MAX_PATTERN_PREVIEW_ITEMS = 20

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

MESSAGE_EXTS = {
    ".eml", ".msg"
}

PREFERENCES_EXTS = {
    ".prefs"
}

CREDENTIAL_EXTS = {
    ".cred", ".pem", ".key", ".crt", ".p12", ".pfx"
}

OPAQUE_DATA_EXTS = {
    ".dat"
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

def looks_like_bundle_or_package_path(normalized_path: str) -> bool:
    bundle_markers = (
        "/resources/",
        "/assets/",
        "/static/",
        "/build/",
        "/dist/",
        "/bundle/",
        "/www/",
        "/app/",
        "/contents/",
        "/labs/",
    )
    return any(marker in normalized_path for marker in bundle_markers)


def infer_file_context(
    filename: str,
    normalized_path: str,
    file_kind: str,
    location_context: str,
    age_days: int,
) -> dict:
    lowered_name = filename.lower()

    if location_context in {"dtm_review_managed", "dtm_archive_managed"}:
        return {
            "context_type": "managed_by_dtm",
            "user_relevance": "medium",
            "system_role": "maintenance_managed_item",
            "context_reason": "This file is already inside a DTM-managed workflow location.",
        }

    if location_context in {"generated_dependency_tree", "version_control_internal"}:
        return {
            "context_type": "project_internal",
            "user_relevance": "low",
            "system_role": "development_support_asset",
            "context_reason": "This file sits inside a generated dependency or version-control internal structure and is unlikely to be directly useful as standalone user content.",
        }

    if looks_like_bundle_or_package_path(normalized_path):
        return {
            "context_type": "app_internal_package",
            "user_relevance": "low",
            "system_role": "software_support_asset",
            "context_reason": "This file appears to belong to a structured software, package, or bundled content footprint rather than a loose human-managed document.",
        }

    if file_kind in {"temporary_or_log"}:
        return {
            "context_type": "generated_artifact",
            "user_relevance": "low",
            "system_role": "runtime_or_debug_output",
            "context_reason": "The file appears to be generated support output rather than primary user content.",
        }

    if file_kind in {"credential_or_secret_material"}:
        return {
            "context_type": "sensitive_support_material",
            "user_relevance": "high",
            "system_role": "security_or_identity_artifact",
            "context_reason": "This file likely plays a security, credential, or certificate role and deserves cautious handling regardless of where it appears.",
        }

    if file_kind in {"message_artifact"}:
        if location_context in {"desktop_loose_file", "downloads_workspace", "desktop_nested_folder"}:
            return {
                "context_type": "loose_user_record",
                "user_relevance": "high",
                "system_role": "saved_message_record",
                "context_reason": "This looks like a saved message artifact placed in a user-facing workspace, so it may represent meaningful record content.",
            }
        return {
            "context_type": "nested_user_content",
            "user_relevance": "medium",
            "system_role": "saved_message_record",
            "context_reason": "This appears to be saved message content that may still matter to the user, though its surrounding structure makes urgency less obvious.",
        }

    if file_kind in {"document", "image", "audio", "video"}:
        if location_context == "desktop_loose_file":
            return {
                "context_type": "loose_user_file",
                "user_relevance": "high",
                "system_role": "user_facing_content",
                "context_reason": "This is recognizable human-facing content stored as a loose file in a primary workspace.",
            }
        if location_context in {"downloads_workspace", "desktop_nested_folder", "documents_workspace"}:
            return {
                "context_type": "nested_user_content",
                "user_relevance": "high",
                "system_role": "user_facing_content",
                "context_reason": "This is recognizable human-facing content in a user-accessible workspace or nested folder.",
            }

    if file_kind in {"archive"}:
        if location_context in {"downloads_workspace", "desktop_loose_file"} and age_days > 90:
            return {
                "context_type": "archive_or_export_residue",
                "user_relevance": "medium",
                "system_role": "stored_bundle_or_export",
                "context_reason": "This archive appears to be an older bundled file in a user-facing area, suggesting stored or leftover export material rather than active workspace content.",
            }
        return {
            "context_type": "ambiguous_context",
            "user_relevance": "medium",
            "system_role": "bundled_container",
            "context_reason": "This archive is recognizable as a container file, but its active relevance depends on surrounding workflow context.",
        }

    if file_kind in {"code_or_config", "config_or_preferences"}:
        if location_context in {"desktop_loose_file", "downloads_workspace"}:
            return {
                "context_type": "ambiguous_context",
                "user_relevance": "medium",
                "system_role": "project_or_app_support_material",
                "context_reason": "This looks like project or application support material, but its loose placement makes its current role less certain.",
            }
        return {
            "context_type": "project_internal",
            "user_relevance": "low",
            "system_role": "project_or_app_support_material",
            "context_reason": "This appears to be part of a project, application, or internal support structure rather than primary human-facing content.",
        }

    if file_kind in {"data_store", "opaque_data_blob", "structured_markup"}:
        if location_context in {"desktop_loose_file", "downloads_workspace"}:
            return {
                "context_type": "ambiguous_context",
                "user_relevance": "medium",
                "system_role": "structured_or_app_data",
                "context_reason": "This file has a recognizable structured or data-bearing form, but its loose placement does not make its human relevance immediately clear.",
            }
        return {
            "context_type": "app_internal_package",
            "user_relevance": "low",
            "system_role": "structured_or_app_data",
            "context_reason": "This appears more like structured support or application data than directly managed user content.",
        }

    if file_kind in {"text_like_loose_file"}:
        return {
            "context_type": "loose_user_file",
            "user_relevance": "medium",
            "system_role": "possible_user_content",
            "context_reason": "The filename suggests user-facing text content, but missing type information keeps its role somewhat ambiguous.",
        }

    if file_kind in {"app_or_installer"}:
        return {
            "context_type": "archive_or_export_residue",
            "user_relevance": "medium",
            "system_role": "installer_or_deployable_asset",
            "context_reason": "This appears to be an installer or deployable application asset that may be useful but is not usually active workspace content.",
        }

    if file_kind in {"unknown", "extensionless"}:
        return {
            "context_type": "ambiguous_context",
            "user_relevance": "medium",
            "system_role": "unclear_role",
            "context_reason": "DTM cannot yet infer a strong role for this file from deterministic signals alone, but it should still be framed for human review rather than treated as meaningless.",
        }

    return {
        "context_type": "ambiguous_context",
        "user_relevance": "medium",
        "system_role": "unclear_role",
        "context_reason": "This file has some recognizable properties, but its practical role remains context-dependent.",
    }

def infer_queue_decision(
    *,
    file_kind: str,
    category: str,
    context_type: str,
    user_relevance: str,
    system_role: str,
    location_context: str,
    age_days: int,
    risk_flags: list[str],
) -> dict:
    if context_type == "managed_by_dtm":
        return {
            "recommended_action": "ignore",
            "suggested_action_reason": "This file is already managed by DTM and should not be re-queued.",
        }

    if category == "system":
        return {
            "recommended_action": "ignore",
            "suggested_action_reason": "System and internal support files should not be surfaced as active maintenance work.",
        }

    if context_type == "app_internal_package" and user_relevance == "low":
        return {
            "recommended_action": "ignore",
            "suggested_action_reason": "This appears to be internal software/package support material with low direct user relevance.",
        }

    if context_type == "project_internal" and user_relevance == "low":
        if age_days > 180:
            return {
                "recommended_action": "archive",
                "suggested_action_reason": "This appears to be low-relevance project or support material that is old enough to move out of the active workspace.",
            }
        return {
            "recommended_action": "keep",
            "suggested_action_reason": "This appears to be project or development support material rather than a file needing maintenance action.",
        }

    if context_type == "generated_artifact":
        if age_days > 30:
            return {
                "recommended_action": "remove",
                "suggested_action_reason": "Generated runtime or debug artifacts older than 30 days are usually safe cleanup candidates.",
            }
        return {
            "recommended_action": "review",
            "suggested_action_reason": "This appears to be generated output, but recent artifacts may still be active.",
        }

    if context_type == "archive_or_export_residue":
        if age_days > 90:
            return {
                "recommended_action": "archive",
                "suggested_action_reason": "Older bundled or export-like artifacts are usually better stored than kept in active workspace areas.",
            }
        return {
            "recommended_action": "review",
            "suggested_action_reason": "This looks like bundled or export residue, but recent files may still be active.",
        }

    if context_type == "loose_user_file" and user_relevance == "high":
        return {
            "recommended_action": "keep",
            "suggested_action_reason": "This appears to be directly user-facing content in a primary workspace location.",
        }

    if context_type == "nested_user_content" and user_relevance == "high":
        if file_kind == "archive" and age_days > 120:
            return {
                "recommended_action": "archive",
                "suggested_action_reason": "This appears to be meaningful user content, but older archive-like material is often better stored than kept active.",
            }
        return {
            "recommended_action": "keep",
            "suggested_action_reason": "This appears to be meaningful user-facing content in a user-accessible structure.",
        }

    if context_type == "loose_user_record":
        if age_days > 365:
            return {
                "recommended_action": "archive",
                "suggested_action_reason": "Older saved record-like content may still matter, but is often better stored than kept in active workspace areas.",
            }
        return {
            "recommended_action": "review",
            "suggested_action_reason": "This looks like meaningful saved record content, but human confirmation is still appropriate before relocation.",
        }

    if context_type == "sensitive_support_material":
        return {
            "recommended_action": "review",
            "suggested_action_reason": "Sensitive security or identity-related material should always be reviewed carefully.",
        }

    if file_kind == "credential_or_secret_material":
        return {
            "recommended_action": "review",
            "suggested_action_reason": "Sensitive files should remain in the human-review path even when their type is recognizable.",
        }

    if file_kind == "extensionless":
        if location_context not in {"desktop_loose_file", "downloads_workspace", "documents_workspace"}:
            if age_days > 180:
                return {
                    "recommended_action": "archive",
                    "suggested_action_reason": "Extensionless file in a non-user-facing location appears stale and is more likely support residue than active user content.",
                }
            return {
                "recommended_action": "ignore",
                "suggested_action_reason": "Extensionless file in a non-user-facing location is likely support or system material rather than something requiring human attention.",
            }

        return {
            "recommended_action": "review",
            "suggested_action_reason": "Extensionless file in a user-facing location may still matter, so human review is safer.",
        }

    if file_kind == "text_like_loose_file":
        if location_context in {"desktop_loose_file", "downloads_workspace", "documents_workspace"}:
            return {
                "recommended_action": "review",
                "suggested_action_reason": "Loose text-like content in a user-facing location may be meaningful and should be reviewed before relocation.",
            }
        return {
            "recommended_action": "ignore",
            "suggested_action_reason": "Text-like extensionless file in a non-user-facing location is less likely to need direct maintenance attention.",
        }

    if file_kind in {"data_store", "opaque_data_blob", "structured_markup"}:
        if user_relevance == "low":
            if age_days > 180:
                return {
                    "recommended_action": "archive",
                    "classification_reason": "Low-relevance structured file stored outside user-facing areas; likely support or stale data rather than active content.",
                }
            return {
                "recommended_action": "ignore",
                "suggested_action_reason": "Structured or data-bearing file appears to be low-relevance support or application material.",
            }

        if context_type == "ambiguous_context" and location_context in {"desktop_loose_file", "downloads_workspace"}:
            return {
                "recommended_action": "review",
                "suggested_action_reason": "Structured or data-bearing file in a user-facing location may still matter and should be reviewed.",
            }

        if age_days > 365 and location_context not in {"desktop_loose_file", "downloads_workspace"}:
            return {
                "recommended_action": "archive",
                "suggested_action_reason": "Older structured or data-bearing material in a non-user-facing location is more likely to be stale residue than active content.",
            }

        return {
            "recommended_action": "review",
            "suggested_action_reason": "Structured or data-bearing files may matter, but their role is still too context-dependent for automatic relocation.",
        }

    if context_type == "ambiguous_context":
        if user_relevance == "low":
            if age_days > 180:
                return {
                    "recommended_action": "archive",
                    "suggested_action_reason": "Low-relevance file with no strong contextual role appears stale enough to move out of the active workspace.",
                }
            return {
                "recommended_action": "ignore",
                "suggested_action_reason": "Low-relevance file with no strong contextual role is unlikely to need human maintenance attention.",
            }

        if user_relevance == "medium":
            if age_days > 365 and location_context not in {"desktop_loose_file", "downloads_workspace"}:
                return {
                    "recommended_action": "archive",
                    "suggested_action_reason": "Ambiguous medium-relevance material outside primary workspaces appears stale enough to archive rather than review immediately.",
                }
            return {
                "recommended_action": "review",
                "suggested_action_reason": "DTM can infer some context, but not enough to relocate this safely without human judgment.",
            }

        return {
            "recommended_action": "review",
            "suggested_action_reason": "Potentially user-relevant file requires human judgment.",
        }

    if file_kind == "temporary_or_log":
        if age_days > 30:
            return {
                "recommended_action": "remove",
                "suggested_action_reason": "Older temporary or log-like files are usually safe cleanup targets.",
            }
        return {
            "recommended_action": "review",
            "suggested_action_reason": "Recent temporary or log-like files may still be in use.",
        }

    if file_kind == "archive":
        if age_days > 90 and location_context in {"downloads_workspace", "desktop_loose_file"}:
            return {
                "recommended_action": "archive",
                "suggested_action_reason": "Older archive files in user-facing workspaces are usually better stored than kept active.",
            }
        return {
            "recommended_action": "review",
            "suggested_action_reason": "Archive files are recognizable, but their active relevance still benefits from human confirmation.",
        }

    if file_kind == "app_or_installer":
        if age_days > 180 and location_context in {"downloads_workspace", "desktop_loose_file"}:
            return {
                "recommended_action": "archive",
                "suggested_action_reason": "Older installers and deployable assets in user-facing workspaces are often better stored than kept active.",
            }
        return {
            "recommended_action": "review",
            "suggested_action_reason": "Installers and deployable assets are recognizable, but should be confirmed before relocation.",
        }

    if file_kind in {"document", "image", "audio", "video"}:
        return {
            "recommended_action": "keep",
            "suggested_action_reason": "Recognizable human-facing content should generally remain available unless stronger context suggests otherwise.",
        }

    if file_kind in {"code_or_config", "config_or_preferences"}:
        if location_context in {"desktop_loose_file", "downloads_workspace"} and age_days > 180:
            return {
                "recommended_action": "review",
                "suggested_action_reason": "Loose project or config material in user-facing areas may be stale, but still deserves confirmation.",
            }
        return {
            "recommended_action": "keep",
            "suggested_action_reason": "Recognizable project or support material should not be aggressively re-queued by default.",
        }

    return {
        "recommended_action": "review",
        "suggested_action_reason": "DTM could not justify a stronger automatic action for this file.",
    }

def compute_action_confidence(entry: dict) -> str:
    risk_flags = set(entry.get("risk_flags", []))

    if entry["recommended_action"] == "remove":
        if "sensitive_material" in risk_flags or "user_content" in risk_flags:
            return "low"
        if "disposable_likely" in risk_flags:
            return "high"
        return "medium"

    if entry["recommended_action"] == "archive":
        if "sensitive_material" in risk_flags:
            return "low"
        if entry.get("user_relevance") == "low":
            return "high"
        return "medium"

    return "medium"


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

    if recognized_kind == "opaque_data":
        return {
            "file_kind": "opaque_data_blob",
            "category": "unknown",
            "known_type_explanation": "DAT files are generic data containers often used by applications, exports, caches, or intermediate processing tools.",
            "classification_reason": f"Extension {readable_ext} indicates a generic data container, but not a reliable human-readable purpose.",
            "confidence": "medium",
            "confidence_reason": "The format family is recognizable, but the file's role is highly context-dependent.",
            "recommended_action": "review",
            "suggested_action_reason": "Because this is a known but opaque data format, Review is safer than assuming it is disposable or archival.",
            "reason": "Generic data file with an unclear role in this location.",
            "risk_flags": ["ambiguous_role", "app_data_possible"],
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

def infer_extensionless_role(filename: str, location_context: str) -> dict | None:
    lowered = filename.lower().strip()

    if lowered.startswith("text copy") or lowered == "text":
        return {
            "file_kind": "text_like_loose_file",
            "category": "document",
            "known_type_explanation": "This appears to be a loose text-like file with no extension.",
            "classification_reason": "The filename pattern suggests user-created or duplicated text content, even though no extension is present.",
            "confidence": "medium",
            "confidence_reason": "The filename gives some useful clues, but the missing extension still leaves the exact format uncertain.",
            "recommended_action": "review" if location_context in {"desktop_loose_file", "desktop_nested_folder", "downloads_workspace"} else "keep",
            "suggested_action_reason": "A text-like file may be meaningful user content, but loose placement makes its role uncertain enough to review.",
            "reason": "Extensionless text-like file with an ambiguous role.",
            "risk_flags": ["ambiguous_type", "user_content_possible"],
        }

    return None

def infer_review_priority(
    *,
    file_kind: str,
    context_type: str,
    user_relevance: str,
    location_context: str,
    risk_flags: list[str],
    confidence: str,
    age_days: int,
) -> dict:
    if "sensitive_material" in risk_flags or file_kind == "credential_or_secret_material":
        return {
            "review_priority": "high",
            "review_priority_reason": "Sensitive or security-related material should be reviewed before lower-risk ambiguous files.",
        }

    if context_type in {"loose_user_file", "loose_user_record"}:
        return {
            "review_priority": "high",
            "review_priority_reason": "Loose user-facing or record-like content in a primary workspace deserves earlier review.",
        }

    if location_context in {"desktop_loose_file", "downloads_workspace"} and user_relevance == "high":
        return {
            "review_priority": "high",
            "review_priority_reason": "Potentially meaningful user-facing content in a prominent workspace should be reviewed early.",
        }

    if file_kind in {"message_artifact", "data_store", "structured_markup"} and user_relevance in {"high", "medium"}:
        return {
            "review_priority": "medium",
            "review_priority_reason": "Structured, saved-record, or data-bearing files may matter, but are less urgent than obviously sensitive or loose primary content.",
        }

    if context_type == "ambiguous_context" and user_relevance == "medium":
        return {
            "review_priority": "medium",
            "review_priority_reason": "This file remains contextually ambiguous, but does not appear as urgent as high-relevance loose content.",
        }

    if file_kind in {"app_or_installer", "code_or_config", "config_or_preferences"}:
        return {
            "review_priority": "medium",
            "review_priority_reason": "Recognizable support or deployable material may need confirmation, but is not usually the highest-priority review work.",
        }

    if user_relevance == "low":
        return {
            "review_priority": "low",
            "review_priority_reason": "This file appears to have low direct user relevance and can be reviewed after higher-salience items.",
        }

    if confidence == "low":
        return {
            "review_priority": "medium",
            "review_priority_reason": "Low-confidence items deserve review, but not all low-confidence files are equally urgent.",
        }

    if age_days > 365:
        return {
            "review_priority": "low",
            "review_priority_reason": "Older ambiguous material can usually wait until more relevant unresolved files are handled first.",
        }

    return {
        "review_priority": "medium",
        "review_priority_reason": "This file still needs human judgment, but does not strongly signal either urgent or ignorable status.",
    }

def with_context(
    *,
    filename: str,
    normalized_path: str,
    age_days: int,
    location_context: str,
    base: dict,
) -> dict:
    context = infer_file_context(
        filename=filename,
        normalized_path=normalized_path,
        file_kind=base["file_kind"],
        location_context=location_context,
        age_days=age_days,
    )

    queue_decision = infer_queue_decision(
        file_kind=base["file_kind"],
        category=base["category"],
        context_type=context["context_type"],
        user_relevance=context["user_relevance"],
        system_role=context["system_role"],
        location_context=location_context,
        age_days=age_days,
        risk_flags=base.get("risk_flags", []),
    )

    review_priority = None
    review_priority_reason = None

    if queue_decision["recommended_action"] == "review":
        priority_info = infer_review_priority(
            file_kind=base["file_kind"],
            context_type=context["context_type"],
            user_relevance=context["user_relevance"],
            location_context=location_context,
            risk_flags=base.get("risk_flags", []),
            confidence=base.get("confidence", "low"),
            age_days=age_days,
        )
        review_priority = priority_info["review_priority"]
        review_priority_reason = priority_info["review_priority_reason"]

    return {
        **base,
        "location_context": location_context,
        "context_type": context["context_type"],
        "user_relevance": context["user_relevance"],
        "system_role": context["system_role"],
        "context_reason": context["context_reason"],
        "recommended_action": queue_decision["recommended_action"],
        "suggested_action_reason": queue_decision["suggested_action_reason"],
        "review_priority": review_priority,
        "review_priority_reason": review_priority_reason,
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
        return with_context(
            filename=filename,
            normalized_path=normalized_path,
            age_days=age_days,
            location_context=location_context,
            base={ 
                "file_kind": "system_metadata",
                "category": "system",
                "known_type_explanation": get_known_type_explanation(ext, "system_metadata"),
                "classification_reason": "Filename matches a known operating system metadata artifact.",
                "confidence": "high",
                "confidence_reason": "This is a well-known system-generated filename.",
                "recommended_action": "ignore",
                "suggested_action_reason": "System metadata is usually safe to ignore in maintenance review.",
                "reason": "System metadata file created automatically by the operating system.",
                "risk_flags": ["system_file", "low_user_value"],
                "ui_visibility": "hidden_by_default",
            },
        )

    if "/node_modules/" in normalized_path:
        return with_context(
            filename=filename,
            normalized_path=normalized_path,
            age_days=age_days,
            location_context=location_context,
            base={
                "file_kind": "generated_dependency",
                "category": "code",
                "known_type_explanation": get_known_type_explanation(ext, "generated_dependency"),
                "classification_reason": "Path indicates the file is inside a generated dependency tree.",
                "confidence": "medium",
                "confidence_reason": "Directory context is strong, though individual files may vary.",
                "recommended_action": "ignore",
                "suggested_action_reason": "Dependency trees are usually generated and too noisy for direct maintenance review.",
                "reason": "Dependency file inside a generated package directory.",
                "risk_flags": ["generated_content", "bulk_noise"],
                "ui_visibility": "hidden_by_default",
            },
        )

    if "/.git/" in normalized_path:
        return with_context(
            filename=filename,
            normalized_path=normalized_path,
            age_days=age_days,
            location_context=location_context,
            base={
                "file_kind": "version_control_internal",
                "category": "system",
                "known_type_explanation": get_known_type_explanation(ext, "version_control_internal"),
                "classification_reason": "Path indicates the file belongs to a Git internal directory.",
                "confidence": "high",
                "confidence_reason": "Git internal paths are strongly identifiable.",
                "recommended_action": "ignore",
                "suggested_action_reason": "Version control internals should not be surfaced as active maintenance targets.",
                "reason": "Version control internal file.",
                "risk_flags": ["system_file", "project_internal"],
                "ui_visibility": "hidden_by_default",
            },
        )

    if "/dtm review/" in normalized_path or "/dtm archive/" in normalized_path:
        return with_context(
            filename=filename,
            normalized_path=normalized_path,
            age_days=age_days,
            location_context=location_context,
            base={
                "file_kind": "dtm_managed_file",
                "category": "system",
                "known_type_explanation": "DTM-managed file already placed in a controlled maintenance folder.",
                "classification_reason": "Path indicates the file is already inside a DTM-managed workflow directory.",
                "confidence": "high",
                "confidence_reason": "DTM-managed folder placement is explicit.",
                "recommended_action": "ignore",
                "suggested_action_reason": "Files already under DTM workflow management should not be re-queued during scans.",
                "reason": "DTM-managed file in a controlled workflow folder.",
                "risk_flags": ["dtm_managed"],
                "ui_visibility": "hidden_by_default",
            },
        )

    if ext in DOCUMENT_EXTS:
        recommended_action = "keep"
        suggested_action_reason = "Recognized document and office formats are usually user-authored content worth keeping visible."

        if location_context == "downloads_workspace" and age_days > 120:
            recommended_action = "archive"
            suggested_action_reason = "Older documents in Downloads are often worth keeping, but not necessarily keeping in the active workspace."
        return with_context(
            filename=filename,
            normalized_path=normalized_path,
            age_days=age_days,
            location_context=location_context,
            base={
                "file_kind": "document",
                "category": "document",
                "known_type_explanation": get_known_type_explanation(ext, "document"),
                "classification_reason": f"Extension {ext or '[none]'} matches a recognized document or office format.",
                "confidence": "high",
                "confidence_reason": "The extension is commonly associated with user-authored document content.",
                "recommended_action": recommended_action,
                "suggested_action_reason": suggested_action_reason,
                "reason": "Common document format.",
                "risk_flags": ["user_content"],
                "ui_visibility": "normal",
            },
        )

    if ext in IMAGE_EXTS:
        return with_context(
            filename=filename,
            normalized_path=normalized_path,
            age_days=age_days,
            location_context=location_context,
            base={ 
                "file_kind": "image",
                "category": "image",
                "known_type_explanation": get_known_type_explanation(ext, "image"),
                "classification_reason": f"Extension {ext} matches a recognized image format.",
                "confidence": "high",
                "confidence_reason": "The extension is a common image type.",
                "recommended_action": "keep",
                "suggested_action_reason": "Recognized image files are usually user content and should not be aggressively reclassified.",
                "reason": "Common image file.",
                "risk_flags": ["user_content"],
                "ui_visibility": "normal",
                },
            )

    if ext in AUDIO_EXTS:
        return with_context(
            filename=filename,
            normalized_path=normalized_path,
            age_days=age_days,
            location_context=location_context,
            base={
                "file_kind": "audio",
                "category": "media",
                "known_type_explanation": get_known_type_explanation(ext, "audio"),
                "classification_reason": f"Extension {ext} matches a recognized audio format.",
                "confidence": "high",
                "confidence_reason": "The extension strongly indicates an audio media file.",
                "recommended_action": "keep",
                "suggested_action_reason": "Media files are usually user-meaningful content unless stronger context suggests otherwise.",
                "reason": "Recognized audio file.",
                "risk_flags": ["user_content"],
                "ui_visibility": "normal",
            },
        )

    if ext in VIDEO_EXTS:
        return with_context(
            filename=filename,
            normalized_path=normalized_path,
            age_days=age_days,
            location_context=location_context,
            base={
                "file_kind": "video",
                "category": "media",
                "known_type_explanation": get_known_type_explanation(ext, "video"),
                "classification_reason": f"Extension {ext} matches a recognized video format.",
                "confidence": "high",
                "confidence_reason": "The extension strongly indicates a video media file.",
                "recommended_action": "keep",
                "suggested_action_reason": "Video files are usually user-meaningful content unless stronger context suggests otherwise.",
                "reason": "Recognized video file.",
                "risk_flags": ["user_content", "large_file_possible"],
                "ui_visibility": "normal",
            },
        )

    if ext in ARCHIVE_EXTS:
        action = "review" if age_days < 60 else "archive"
        action_reason = (
            "Recently modified archives may still be active bundles or transfers, so review is safer."
            if action == "review"
            else "Older archives are often better candidates for storage than active workspace visibility."
        )
        return with_context(
            filename=filename,
            normalized_path=normalized_path,
            age_days=age_days,
            location_context=location_context,
            base={
                "file_kind": "archive",
                "category": "archive",
                "known_type_explanation": get_known_type_explanation(ext, "archive"),
                "classification_reason": f"Extension {ext} matches a recognized compressed archive format.",
                "confidence": "high",
                "confidence_reason": "Archive extensions are typically unambiguous.",
                "recommended_action": action,
                "suggested_action_reason": action_reason,
                "reason": "Compressed archive file often used for bundling, transfer, or backup.",
                "risk_flags": ["compressed_container"],
                "ui_visibility": "normal",
            },
        )

    if ext in CODE_EXTS:
        recommended_action = "keep"
        suggested_action_reason = "Recognized code and configuration files are often active project material."

        if location_context == "downloads_workspace" and age_days > 180:
            recommended_action = "review"
            suggested_action_reason = "Older code or config files in Downloads are identifiable, but context remains ambiguous enough to review."

        return with_context(
            filename=filename,
            normalized_path=normalized_path,
            age_days=age_days,
            location_context=location_context,
            base={
                "file_kind": "code_or_config",
                "category": "code",
                "known_type_explanation": get_known_type_explanation(ext, "code_or_config"),
                "classification_reason": f"Extension {ext} matches a recognized source, notebook, config, or dev-support format.",
                "confidence": "high",
                "confidence_reason": "The extension strongly indicates development-related material.",
                "recommended_action": recommended_action,
                "suggested_action_reason": suggested_action_reason,
                "reason": "Code, configuration, or development support file.",
                "risk_flags": ["project_material"],
                "ui_visibility": "normal",
            },
        )

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
        return with_context(
            filename=filename,
            normalized_path=normalized_path,
            age_days=age_days,
            location_context=location_context,
            base={
                "file_kind": "data_store",
                "category": "data",
                "known_type_explanation": get_known_type_explanation(ext, "data_store"),
                "classification_reason": f"Extension {ext} matches a recognized data or database storage format.",
                "confidence": confidence,
                "confidence_reason": confidence_reason,
                "recommended_action": recommended_action,
                "suggested_action_reason": suggested_action_reason,
                "reason": "Recognized data or database file.",
                "risk_flags": ["important_data_possible"],
                "ui_visibility": "normal",
            },
        )
    
    if ext in MESSAGE_EXTS:
        recommended_action = "review" if location_context in {"downloads_workspace", "desktop_loose_file", "desktop_nested_folder"} else "keep"
        suggested_action_reason = (
            "Saved email files may contain meaningful records or attachments, but loose placement makes their role uncertain."
            if recommended_action == "review"
            else "Saved email files often represent meaningful records and should not be treated as disposable by default."
        )
        confidence = "high" if recommended_action == "keep" else "medium"
        confidence_reason = (
            "The format is clearly recognizable, but the intended role is less obvious in this location."
            if recommended_action == "review"
            else "The format is clearly recognizable as a saved email or message artifact."
        )
        return with_context(
            filename=filename,
            normalized_path=normalized_path,
            age_days=age_days,
            location_context=location_context,
            base={
                "file_kind": "message_artifact",
                "category": "document",
                "known_type_explanation": "Saved email files preserve message content and sometimes attachment-related records.",
                "classification_reason": f"Extension {ext} matches a saved email or message artifact format.",
                "confidence": confidence,
                "confidence_reason": confidence_reason,
                "recommended_action": recommended_action,
                "suggested_action_reason": suggested_action_reason,
                "reason": "Saved email or message file.",
                "risk_flags": ["user_content_possible", "record_like_content"],
                "ui_visibility": "normal",
            },
        )
     
    if ext in PREFERENCES_EXTS:
        return with_context(
            filename=filename,
            normalized_path=normalized_path,
            age_days=age_days,
            location_context=location_context,
            base={
                "file_kind": "config_or_preferences",
                "category": "code",
                "known_type_explanation": "Preference files usually store application or tool configuration.",
                "classification_reason": f"Extension {ext} is commonly used for settings or preference storage.",
                "confidence": "high",
                "confidence_reason": "The file format is recognizable, though the owning application may still be unclear.",
                "recommended_action": "review",
                "suggested_action_reason": "Preference files are often important support artifacts, but loose placement makes human confirmation safer.",
                "reason": "Preferences or configuration file.",
                "risk_flags": ["app_support_possible", "project_internal_possible"],
                "ui_visibility": "normal",
            }
        )

    if ext in CREDENTIAL_EXTS:
        return with_context(
            filename=filename,
            normalized_path=normalized_path,
            age_days=age_days,
            location_context=location_context,
            base={
                "file_kind": "credential_or_secret_material",
                "category": "unknown",
                "known_type_explanation": "This extension is commonly associated with credentials, certificates, encryption keys, or identity material.",
                "classification_reason": f"Extension {ext} strongly suggests credential, key, or certificate-related material.",
                "confidence": "high",
                "confidence_reason": "These extensions are strongly associated with sensitive identity or security artifacts.",
                "recommended_action": "review",
                "suggested_action_reason": "Sensitive support files should be reviewed carefully rather than automatically archived or removed.",
                "reason": "Sensitive credential or certificate-related file.",
                "risk_flags": ["sensitive_material", "security_related"],
                "ui_visibility": "normal",
            },
        )

    if ext in OPAQUE_DATA_EXTS:
        low_conf = build_low_confidence_explanation(
            ext=ext,
            location_context=location_context,
            recognized_kind="opaque_data",
        )
        return with_context(
            filename=filename,
            normalized_path=normalized_path,
            age_days=age_days,
            location_context=location_context,
            base={
                "file_kind": low_conf["file_kind"],
                "category": low_conf["category"],
                "known_type_explanation": low_conf["known_type_explanation"],
                "classification_reason": low_conf["classification_reason"],
                "confidence": low_conf["confidence"],
                "confidence_reason": low_conf["confidence_reason"],
                "recommended_action": low_conf["recommended_action"],
                "suggested_action_reason": low_conf["suggested_action_reason"],
                "reason": low_conf["reason"],
                "risk_flags": low_conf["risk_flags"],
                "ui_visibility": "normal",
            },
        )

    if ext in MARKUP_EXTS:
        low_conf = build_low_confidence_explanation(
            ext=ext,
            location_context=location_context,
            recognized_kind="structured_markup",
        )
        return with_context(
            filename=filename,
            normalized_path=normalized_path,
            age_days=age_days,
            location_context=location_context,
            base={
                "file_kind": low_conf["file_kind"],
                "category": low_conf["category"],
                "known_type_explanation": low_conf["known_type_explanation"],
                "classification_reason": low_conf["classification_reason"],
                "confidence": low_conf["confidence"],
                "confidence_reason": low_conf["confidence_reason"],
                "recommended_action": low_conf["recommended_action"],
                "suggested_action_reason": low_conf["suggested_action_reason"],
                "reason": low_conf["reason"],
                "risk_flags": low_conf["risk_flags"],
                "ui_visibility": "normal",
            },
        )

    if ext in CLUTTER_EXTS:
        action = "remove" if age_days > 30 else "review"
        action_reason = (
            "Older temporary or log-like files are often safe cleanup candidates."
            if action == "remove"
            else "Recent temporary or partial files may still be in use, so review is safer."
        )
        return with_context(
            filename=filename,
            normalized_path=normalized_path,
            age_days=age_days,
            location_context=location_context,
            base={
                "file_kind": "temporary_or_log",
                "category": "clutter",
                "known_type_explanation": get_known_type_explanation(ext, "temporary_or_log"),
                "classification_reason": f"Extension {ext} matches a temporary, cache, backup, partial, or log-like pattern.",
                "confidence": "high",
                "confidence_reason": "These extensions are commonly associated with disposable support files.",
                "recommended_action": action,
                "suggested_action_reason": action_reason,
                "reason": "Temporary, log, or disposable support file.",
                "risk_flags": ["disposable_likely"],
                "ui_visibility": "normal",
            },
        )

    if ext in APP_EXTS:
        return with_context(
            filename=filename,
            normalized_path=normalized_path,
            age_days=age_days,
            location_context=location_context,
            base={
                "file_kind": "app_or_installer",
                "category": "app_or_installer",
                "known_type_explanation": get_known_type_explanation(ext, "app_or_installer"),
                "classification_reason": f"Extension {ext} matches an installer, executable, or application package format.",
                "confidence": "high",
                "confidence_reason": "Installer and executable-like formats are strongly identifiable.",
                "recommended_action": "review",
                "suggested_action_reason": "Installers and executable packages may be useful, but deserve confirmation before keeping or relocating.",
                "reason": "Installer or executable-like file that may need confirmation before keeping.",
                "risk_flags": ["executable_like"],
                "ui_visibility": "normal",
            },
        )

    if ext == "":
        inferred = infer_extensionless_role(filename, location_context)
            
        if inferred:
            if location_context not in {"desktop_loose_file", "downloads_workspace"}:
                inferred["recommended_action"] = "ignore"
                inferred["suggested_action_reason"] = "Extensionless file in a non-user-facing location is likely system or support material."
                
            return with_context(
            filename=filename,
            normalized_path=normalized_path,
            age_days=age_days,
            location_context=location_context,
            base={
                    "file_kind": inferred["file_kind"],
                    "category": inferred["category"],
                    "known_type_explanation": inferred["known_type_explanation"],
                    "classification_reason": inferred["classification_reason"],
                    "confidence": inferred["confidence"],
                    "confidence_reason": inferred["confidence_reason"],
                    "recommended_action": inferred["recommended_action"],
                    "suggested_action_reason": inferred["suggested_action_reason"],
                    "reason": inferred["reason"],
                    "risk_flags": inferred["risk_flags"],
                    "ui_visibility": "normal",
                },
            )

        low_conf = build_low_confidence_explanation(
            ext=ext,
            location_context=location_context,
        )
        return with_context(
            filename=filename,
            normalized_path=normalized_path,
            age_days=age_days,
            location_context=location_context,
            base={
                "file_kind": low_conf["file_kind"],
                "category": low_conf["category"],
                "known_type_explanation": low_conf["known_type_explanation"],
                "classification_reason": low_conf["classification_reason"],
                "confidence": low_conf["confidence"],
                "confidence_reason": low_conf["confidence_reason"],
                "recommended_action": low_conf["recommended_action"],
                "suggested_action_reason": low_conf["suggested_action_reason"],
                "reason": low_conf["reason"],
                "risk_flags": low_conf["risk_flags"],
                "ui_visibility": "normal",
            },
        )
    
    low_conf = build_low_confidence_explanation(
        ext=ext,
        location_context=location_context,
    )
    return with_context(
        filename=filename,
        normalized_path=normalized_path,
        age_days=age_days,
        location_context=location_context,
        base={
            "file_kind": low_conf["file_kind"],
            "category": low_conf["category"],
            "known_type_explanation": low_conf["known_type_explanation"],
            "classification_reason": low_conf["classification_reason"],
            "confidence": low_conf["confidence"],
            "confidence_reason": low_conf["confidence_reason"],
            "recommended_action": low_conf["recommended_action"],
            "suggested_action_reason": low_conf["suggested_action_reason"],
            "reason": low_conf["reason"],
            "risk_flags": low_conf["risk_flags"],
            "ui_visibility": "normal",
        },
    )


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

        visible_items = sorted_items[:MAX_DUPLICATE_ITEMS_PER_GROUP]
        hidden_items_count = max(0, len(sorted_items) - len(visible_items))

        group = {
            "group_id": f"dup_{len(groups) + 1}",
            "confidence": get_duplicate_group_confidence(sorted_items),
            "reason": get_duplicate_group_reason(normalized_name, ext, size, len(sorted_items)),
            "normalized_name": normalized_name,
            "items": visible_items,
            "items_total": len(sorted_items),
            "hidden_items_count": hidden_items_count,
        }

        if len(groups) < cap:
            groups.append(group)

    total = sum(1 for items in duplicate_candidates.values() if len(items) >= 2)
    return groups, total

def categorize_scan_error(error: Exception) -> dict:
    message = str(error).strip() or error.__class__.__name__
    lowered = message.lower()

    if isinstance(error, PermissionError) or "permission denied" in lowered:
        return {
            "error_type": "permission_denied",
            "error_message": "DTM could not inspect this file because the operating system denied access.",
        }

    if isinstance(error, FileNotFoundError) or "no such file" in lowered:
        return {
            "error_type": "missing_during_scan",
            "error_message": "DTM found a reference to this file, but it was no longer available when inspection was attempted.",
        }

    if "operation not permitted" in lowered:
        return {
            "error_type": "permission_denied",
            "error_message": "DTM could not inspect this file because the operating system blocked the operation.",
        }

    if "invalid argument" in lowered or "embedded null" in lowered:
        return {
            "error_type": "invalid_path_or_name",
            "error_message": "DTM could not inspect this file because its path or name could not be processed safely.",
        }

    if "too many levels of symbolic links" in lowered or "symlink" in lowered:
        return {
            "error_type": "symlink_or_reference_issue",
            "error_message": "DTM encountered a symbolic-link or reference issue while trying to inspect this file.",
        }

    if "not a directory" in lowered or "is a directory" in lowered:
        return {
            "error_type": "invalid_filesystem_entry",
            "error_message": "DTM encountered a filesystem entry that did not behave like a regular file during inspection.",
        }

    if "input/output error" in lowered or "i/o error" in lowered:
        return {
            "error_type": "io_failure",
            "error_message": "DTM encountered an input/output problem while trying to inspect this file.",
        }

    if isinstance(error, OSError):
        return {
            "error_type": "metadata_read_failed",
            "error_message": "DTM could not read filesystem metadata for this file.",
        }

    return {
        "error_type": "unknown_scan_error",
        "error_message": message,
    }

def ensure_classification_contract(classification: dict | None, location_context: str) -> dict:
    classification = classification or {}

    return {
        "category": classification.get("category", "unknown"),
        "file_kind": classification.get("file_kind", "unknown"),
        "location_context": classification.get("location_context", location_context),
        "context_type": classification.get("context_type", "ambiguous_context"),
        "user_relevance": classification.get("user_relevance", "medium"),
        "system_role": classification.get("system_role", "unclear_role"),
        "context_reason": classification.get(
            "context_reason",
            "DTM could not infer a stronger contextual role for this file."
        ),
        "known_type_explanation": classification.get(
            "known_type_explanation",
            "DTM does not yet have a confident built-in interpretation for this file."
        ),
        "classification_reason": classification.get(
            "classification_reason",
            "The file did not match a stronger deterministic classification path."
        ),
        "confidence": classification.get("confidence", "low"),
        "confidence_reason": classification.get(
            "confidence_reason",
            "DTM does not yet have enough deterministic evidence for higher confidence."
        ),
        "recommended_action": classification.get("recommended_action", "review"),
        "suggested_action_reason": classification.get(
            "suggested_action_reason",
            "Review is the safest queue when deterministic understanding is incomplete."
        ),
        "review_priority": classification.get("review_priority"),
        "review_priority_reason": classification.get("review_priority_reason"),
        "reason": classification.get("reason", "File needs review."),
        "risk_flags": classification.get("risk_flags", ["unknown_type"]),
        "ui_visibility": classification.get("ui_visibility", "normal"),
    }

def priority_score(value: str | None) -> int:
    if value == "high":
        return 3
    if value == "medium":
        return 2
    if value == "low":
        return 1
    return 0


def rank_review_item(item: dict) -> tuple:
    risk_flags = set(item.get("risk_flags", []))

    sensitive_boost = 1 if "sensitive_material" in risk_flags or "security_related" in risk_flags else 0
    user_space_boost = 1 if item.get("location_context") in {
        "desktop_loose_file",
        "downloads_workspace",
        "documents_workspace",
    } else 0

    return (
        priority_score(item.get("review_priority")),
        priority_score(item.get("user_relevance")),
        sensitive_boost,
        user_space_boost,
        -item.get("age_days", 0),
        item.get("name", "").lower(),
    )


def rank_archive_item(item: dict) -> tuple:
    risk_flags = set(item.get("risk_flags", []))

    action_conf = priority_score(item.get("action_confidence"))

    sensitive_penalty = 1 if "sensitive_material" in risk_flags or "security_related" in risk_flags else 0
    residue_boost = 1 if item.get("context_type") in {
        "archive_or_export_residue",
        "project_internal",
        "ambiguous_context",
    } else 0
    low_relevance_boost = 1 if item.get("user_relevance") == "low" else 0

    return (
        action_conf,
        -sensitive_penalty,
        residue_boost,
        low_relevance_boost,
        item.get("age_days", 0),
        item.get("name", "").lower(),
    )


def rank_remove_item(item: dict) -> tuple:
    risk_flags = set(item.get("risk_flags", []))

    action_conf = priority_score(item.get("action_confidence"))

    disposable_boost = 1 if "disposable_likely" in risk_flags else 0
    generated_boost = 1 if item.get("context_type") == "generated_artifact" else 0
    low_relevance_boost = 1 if item.get("user_relevance") == "low" else 0
    sensitive_penalty = 1 if "sensitive_material" in risk_flags or "security_related" in risk_flags else 0
    user_content_penalty = 1 if "user_content" in risk_flags or "user_content_possible" in risk_flags else 0

    return (
        action_conf,
        -sensitive_penalty,
        -user_content_penalty,
        disposable_boost,
        generated_boost,
        low_relevance_boost,
        item.get("age_days", 0),
        item.get("name", "").lower(),
    )


def rank_system_item(item: dict) -> tuple:
    return (
        item.get("location_context") != "version_control_internal",
        item.get("name", "").lower(),
    )


def top_ranked(items: list, cap: int, ranker) -> list:
    return sorted(items, key=ranker, reverse=True)[:cap]

def summarize_queue(items: list, key: str, limit: int = 5) -> list:
    counts = {}

    for item in items:
        value = item.get(key) or "unknown"
        counts[value] = counts.get(value, 0) + 1

    return [
        {"label": label, "count": count}
        for label, count in sorted(counts.items(), key=lambda pair: pair[1], reverse=True)[:limit]
    ]


def build_scan_insights(
    *,
    review_items: list,
    archive_items: list,
    remove_items: list,
    duplicate_groups_total: int,
) -> dict:
    review_context_summary = summarize_queue(review_items, "context_type")
    archive_context_summary = summarize_queue(archive_items, "context_type")
    remove_context_summary = summarize_queue(remove_items, "context_type")
    top_review_reasons = summarize_queue(review_items, "reason")

    pattern_previews = build_pattern_previews(
        review_items=review_items,
        archive_items=archive_items,
        remove_items=remove_items,
        review_context_summary=review_context_summary,
        top_review_reasons=top_review_reasons,
    )

    return {
        "queue_summary": [
            {"label": "Needs decision", "count": len(review_items)},
            {"label": "Archive candidates", "count": len(archive_items)},
            {"label": "Remove candidates", "count": len(remove_items)},
            {"label": "Duplicate groups", "count": duplicate_groups_total},
        ],
        "review_context_summary": review_context_summary,
        "archive_context_summary": archive_context_summary,
        "remove_context_summary": remove_context_summary,
        "top_review_reasons": top_review_reasons,
        "pattern_previews": pattern_previews,
    }

def make_pattern_key(key: str, value: str) -> str:
    return f"{key}:{value}"


def build_pattern_preview_for_filter(
    *,
    review_items: list,
    archive_items: list,
    remove_items: list,
    key: str,
    value: str,
) -> dict:
    def matches(item: dict) -> bool:
        return item.get(key) == value

    matching_review = [item for item in review_items if matches(item)]
    matching_archive = [item for item in archive_items if matches(item)]
    matching_remove = [item for item in remove_items if matches(item)]

    return {
        "filter": {
            "key": key,
            "value": value,
        },
        "review": {
            "total": len(matching_review),
            "items": top_ranked(matching_review, MAX_PATTERN_PREVIEW_ITEMS, rank_review_item),
        },
        "archive": {
            "total": len(matching_archive),
            "items": top_ranked(matching_archive, MAX_PATTERN_PREVIEW_ITEMS, rank_archive_item),
        },
        "remove": {
            "total": len(matching_remove),
            "items": top_ranked(matching_remove, MAX_PATTERN_PREVIEW_ITEMS, rank_remove_item),
        },
    }


def build_pattern_previews(
    *,
    review_items: list,
    archive_items: list,
    remove_items: list,
    review_context_summary: list,
    top_review_reasons: list,
) -> dict:
    previews = {}

    for item in review_context_summary:
      value = item["label"]
      previews[make_pattern_key("context_type", value)] = build_pattern_preview_for_filter(
          review_items=review_items,
          archive_items=archive_items,
          remove_items=remove_items,
          key="context_type",
          value=value,
      )

    for item in top_review_reasons:
      value = item["label"]
      previews[make_pattern_key("reason", value)] = build_pattern_preview_for_filter(
          review_items=review_items,
          archive_items=archive_items,
          remove_items=remove_items,
          key="reason",
          value=value,
      )

    return previews


def scan_folder(target_dir: str) -> dict:
    target_dir = normalize_target(target_dir)
    started_at = time.time()
    last_progress_emit = started_at
    context_config = build_location_context_config()

    files_scanned = 0
    by_ext = {}
    duplicate_candidates = {}

    review_candidates_for_ranking = []
    system_candidates_for_ranking = []
    archive_candidates_for_ranking = []
    remove_candidates_for_ranking = []
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

    error_summary = {
        "permission_denied": 0,
        "missing_during_scan": 0,
        "metadata_read_failed": 0,
        "invalid_path_or_name": 0,
        "symlink_or_reference_issue": 0,
        "invalid_filesystem_entry": 0,
        "io_failure": 0,
        "unknown_scan_error": 0,
        "inspection_logic_error": 0,
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
                normalized_path = full_path.replace("\\", "/").lower()

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

                classification = ensure_classification_contract(
                    classification,
                    location_context=get_location_context(normalized_path, context_config),
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
                    "context_type": classification["context_type"],
                    "user_relevance": classification["user_relevance"],
                    "system_role": classification["system_role"],
                    "context_reason": classification["context_reason"],
                    "known_type_explanation": classification["known_type_explanation"],
                    "classification_reason": classification["classification_reason"],
                    "confidence": classification["confidence"],
                    "confidence_reason": classification["confidence_reason"],
                    "recommended_action": classification["recommended_action"],
                    "suggested_action_reason": classification["suggested_action_reason"],
                    "review_priority": classification["review_priority"],
                    "review_priority_reason": classification["review_priority_reason"],
                    "reason": classification["reason"],
                    "risk_flags": classification["risk_flags"],
                    "ui_visibility": classification["ui_visibility"],
                }

                entry["action_confidence"] = compute_action_confidence(entry)

                action = entry["recommended_action"]
                category = entry["category"]

                if action == "review":
                    review_total += 1
                    review_candidates_for_ranking.append(entry)

                if action == "archive":
                    archive_total += 1
                    archive_candidates_for_ranking.append(entry)

                if action == "remove":
                    remove_total += 1
                    remove_candidates_for_ranking.append(entry)

                if category == "system":
                    system_total += 1
                    system_candidates_for_ranking.append(entry)

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

                raw_message = str(e)
                if "NoneType" in raw_message and "get" in raw_message:
                    error_info = {
                        "error_type": "inspection_logic_error",
                        "error_message": "DTM hit an internal classification-contract problem while processing this file.",
                    }
                elif raw_message.strip().startswith("'") and raw_message.strip().endswith("'"):
                    error_info = {
                        "error_type": "inspection_logic_error",
                        "error_message": "DTM hit an internal classification-contract problem while processing this file.",
                    }
                else:
                    error_info = categorize_scan_error(e)

                if error_info["error_type"] not in error_summary:
                    error_summary["unknown_scan_error"] += 1
                    normalized_error_type = "unknown_scan_error"
                else:
                    error_summary[error_info["error_type"]] += 1
                    normalized_error_type = error_info["error_type"]

                maybe_append(
                    errors,
                    {
                        "name": filename,
                        "path": full_path,
                        "error_type": normalized_error_type,
                        "error": error_info["error_message"],
                        "raw_error": raw_message,
                    },
                    MAX_ERRORS
                )

    review_files = top_ranked(
        review_candidates_for_ranking,
        MAX_REVIEW_ITEMS,
        rank_review_item,
    )

    archive_candidates = top_ranked(
        archive_candidates_for_ranking,
        MAX_ARCHIVE_ITEMS,
        rank_archive_item,
    )

    remove_candidates = top_ranked(
        remove_candidates_for_ranking,
        MAX_REMOVE_ITEMS,
        rank_remove_item,
    )

    system_files = top_ranked(
        system_candidates_for_ranking,
        MAX_SYSTEM_ITEMS,
        rank_system_item,
    )    

    sorted_ext = dict(sorted(by_ext.items(), key=lambda item: item[1], reverse=True))

    duplicate_groups, duplicates_total = build_duplicate_groups(
        duplicate_candidates,
        MAX_DUPLICATES
    )

    scan_insights = build_scan_insights(
        review_items=review_candidates_for_ranking,
        archive_items=archive_candidates_for_ranking,
        remove_items=remove_candidates_for_ranking,
        duplicate_groups_total=duplicates_total,
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
        "error_summary": error_summary,
        "scan_insights": scan_insights,
        "excluded_dirs_count": excluded_dirs_count,
        "detail_caps": {
            "review_files": MAX_REVIEW_ITEMS,
            "system_files": MAX_SYSTEM_ITEMS,
            "archive_candidates": MAX_ARCHIVE_ITEMS,
            "remove_candidates": MAX_REMOVE_ITEMS,
            "duplicates": MAX_DUPLICATES,
            "duplicate_items_per_group": MAX_DUPLICATE_ITEMS_PER_GROUP,
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
