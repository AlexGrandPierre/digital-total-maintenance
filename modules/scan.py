import os
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_TARGET = os.path.expanduser("~/Desktop")

SYSTEM_FILENAMES = {
    ".ds_store",
    "thumbs.db",
    "desktop.ini",
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
    ".html", ".css", ".sh", ".cjs", ".mjs"
}

CLUTTER_EXTS = {
    ".log", ".tmp", ".cache", ".bak", ".old", ".part"
}

APP_EXTS = {
    ".dmg", ".pkg", ".exe", ".msi", ".app"
}


def get_age_days(mtime: float) -> int:
    now = datetime.now(timezone.utc)
    modified = datetime.fromtimestamp(mtime, timezone.utc)
    return (now - modified).days


def classify_file(filename: str, full_path: str, age_days: int, size: int) -> dict:
    name = filename.lower()
    ext = os.path.splitext(name)[1].lower()
    normalized_path = full_path.lower()

    # Exact filename rules
    if name in SYSTEM_FILENAMES:
        return {
            "category": "system",
            "confidence": "high",
            "recommended_action": "ignore",
            "reason": "System metadata file created automatically by the operating system.",
            "ui_visibility": "hidden_by_default",
        }

    # Path-sensitive rules
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

    # Extension-based rules
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
            "reason": "Code or configuration file.",
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

    # Fallback
    return {
        "category": "unknown",
        "confidence": "low",
        "recommended_action": "review",
        "reason": "File type is not yet confidently classified.",
        "ui_visibility": "normal",
    }


def scan_folder(target_dir: str) -> dict:
    files = []
    signatures = {}
    duplicates = []

    for root, _, filenames in os.walk(target_dir):
        for filename in filenames:
            full_path = os.path.join(root, filename)

            try:
                stat = os.stat(full_path)
                size = stat.st_size
                age_days = get_age_days(stat.st_mtime)
                ext = os.path.splitext(filename)[1].lower() or "no_ext"

                classification = classify_file(filename, full_path, age_days, size)

                entry = {
                    "name": filename,
                    "path": full_path,
                    "size": size,
                    "age_days": age_days,
                    "ext": ext,
                    "hash": None,  # paused for dev speed
                    "category": classification["category"],
                    "confidence": classification["confidence"],
                    "recommended_action": classification["recommended_action"],
                    "reason": classification["reason"],
                    "ui_visibility": classification["ui_visibility"],
                }

                # Fast duplicate heuristic for dev mode
                sig = (filename.lower(), size)
                if sig in signatures:
                    duplicates.append([signatures[sig], full_path])
                else:
                    signatures[sig] = full_path

                files.append(entry)

            except Exception as e:
                files.append({
                    "name": filename,
                    "path": full_path,
                    "error": str(e),
                })

    by_ext = {}
    review_files = []
    system_files = []
    archive_candidates = []
    remove_candidates = []

    for f in files:
        ext = f.get("ext")
        if ext:
            by_ext[ext] = by_ext.get(ext, 0) + 1

        action = f.get("recommended_action")
        category = f.get("category")

        if action == "review":
            review_files.append(f)

        if action == "archive":
            archive_candidates.append(f)

        if action == "remove":
            remove_candidates.append(f)

        if category == "system":
            system_files.append(f)

    result = {
        "scanned_at": datetime.now(timezone.utc).isoformat(),
        "folder": target_dir,
        "mode": "dev-fast",
        "total_files": len([f for f in files if "error" not in f]),
        "files": files,
        "review_files": review_files,
        "system_files": system_files,
        "archive_candidates": archive_candidates,
        "remove_candidates": remove_candidates,
        "duplicates": duplicates,
        "age_buckets": {
            "<30d": sum(1 for f in files if f.get("age_days", -1) >= 0 and f["age_days"] < 30),
            "30-180d": sum(1 for f in files if 30 <= f.get("age_days", -1) <= 180),
            ">180d": sum(1 for f in files if f.get("age_days", -1) > 180),
        },
        "by_ext": dict(sorted(by_ext.items(), key=lambda item: item[1], reverse=True)),
        "errors": [f for f in files if "error" in f],
    }

    return result


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_TARGET
    target = str(Path(target).expanduser())

    print(json.dumps(scan_folder(target), indent=2))
