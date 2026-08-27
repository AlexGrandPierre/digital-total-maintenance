import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


MODULES_DIR = Path(__file__).resolve().parents[1] / "modules"
sys.path.insert(0, str(MODULES_DIR))

import action_history  # noqa: E402
import archive_action  # noqa: E402
import batch_action  # noqa: E402
import review_action  # noqa: E402
import restore_action as restore_action_module  # noqa: E402
import scan  # noqa: E402
import trash_action  # noqa: E402


class FileClassificationContractTests(unittest.TestCase):
    def setUp(self):
        self.context = scan.build_location_context_config()

    def classify(self, filename, parent, age_days, extension):
        path = str((Path.home() / parent / filename).resolve()).lower()
        return scan.classify_file(
            filename,
            path,
            age_days,
            extension,
            self.context,
        )

    def test_old_log_in_downloads_is_a_remove_candidate(self):
        result = self.classify("old.log", "Downloads", 45, ".log")

        self.assertEqual(result["file_kind"], "temporary_or_log")
        self.assertEqual(result["location_context"], "downloads_workspace")
        self.assertEqual(result["confidence"], "high")
        self.assertEqual(result["recommended_action"], "remove")
        self.assertIn("disposable_likely", result["risk_flags"])

    def test_desktop_credential_is_high_priority_review(self):
        result = self.classify("key.pem", "Desktop", 1, ".pem")

        self.assertEqual(result["file_kind"], "credential_or_secret_material")
        self.assertEqual(result["recommended_action"], "review")
        self.assertEqual(result["review_priority"], "high")
        self.assertIn("sensitive_material", result["risk_flags"])

    def test_desktop_pdf_is_kept_as_user_content(self):
        result = self.classify("report.pdf", "Desktop", 1, ".pdf")

        self.assertEqual(result["file_kind"], "document")
        self.assertEqual(result["recommended_action"], "keep")
        self.assertIn("user_content", result["risk_flags"])

    def test_duplicate_groups_use_normalized_name_extension_and_size(self):
        items = [
            {
                "name": f"Report{' copy ' + str(index) if index else ''}.pdf",
                "path": f"/tmp/report-{index}.pdf",
                "age_days": index,
            }
            for index in range(9)
        ]
        candidates = {("report.pdf", ".pdf", 128): items}

        groups, total = scan.build_duplicate_groups(candidates, cap=10)

        self.assertEqual(total, 1)
        self.assertEqual(groups[0]["group_id"], "dup_1")
        self.assertEqual(groups[0]["confidence"], "high")
        self.assertEqual(groups[0]["items_total"], 9)
        self.assertEqual(len(groups[0]["items"]), 7)
        self.assertEqual(groups[0]["hidden_items_count"], 2)
        self.assertNotIn("hash", groups[0])


class FileActionContractTests(unittest.TestCase):
    def test_single_actions_preserve_destinations_results_history_and_restore(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            history_path = root / "history" / "action-history.json"
            dtm_root = root / "dtm"
            trash_root = root / "trash"
            actions = [
                (
                    "review",
                    review_action.move_one_to_review,
                    dtm_root / "Review",
                    "move_to_review",
                    "restore_from_review",
                ),
                (
                    "archive",
                    archive_action.move_one_to_archive,
                    dtm_root / "Archive",
                    "move_to_archive",
                    "restore_from_archive",
                ),
                (
                    "trash",
                    trash_action.move_one_to_trash,
                    trash_root,
                    "move_to_trash",
                    "restore_from_trash",
                ),
            ]

            with patch.object(
                action_history,
                "get_history_file",
                return_value=history_path,
            ), patch.object(
                trash_action,
                "get_trash_dir",
                return_value=trash_root,
            ):
                for label, move, destination_dir, action, restore_action in actions:
                    with self.subTest(action=label):
                        source = root / f"source-{label}" / "report.txt"
                        source.parent.mkdir()
                        source.write_text(label, encoding="utf-8")
                        destination_dir.mkdir(parents=True, exist_ok=True)
                        (destination_dir / "report.txt").write_text(
                            "collision",
                            encoding="utf-8",
                        )

                        moved = move(str(source), dtm_root=str(dtm_root))

                        self.assertEqual(
                            set(moved),
                            {
                                "success",
                                "action",
                                "path",
                                "destination",
                                "message",
                                "timestamp",
                                "history_entry",
                            },
                        )
                        self.assertTrue(moved["success"])
                        self.assertEqual(moved["action"], action)
                        self.assertEqual(
                            Path(moved["destination"]).resolve(),
                            (destination_dir / "report_1.txt").resolve(),
                        )
                        self.assertEqual(
                            moved["history_entry"]["destination_path"],
                            moved["destination"],
                        )
                        self.assertEqual(moved["history_entry"]["mode"], "single")

                        restored = restore_action_module.restore_from_history(
                            moved["history_entry"],
                        )

                        self.assertTrue(restored["success"])
                        self.assertEqual(restored["action"], restore_action)
                        self.assertEqual(
                            Path(restored["destination"]).resolve(),
                            source.resolve(),
                        )
                        self.assertEqual(
                            restored["history_entry"]["reverts_history_id"],
                            moved["history_entry"]["id"],
                        )

    def test_single_action_missing_file_contracts_do_not_record_history(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            missing = root / "missing.txt"
            history_path = root / "history.json"
            actions = [
                (review_action.move_one_to_review, "move_to_review"),
                (archive_action.move_one_to_archive, "move_to_archive"),
                (trash_action.move_one_to_trash, "move_to_trash"),
            ]

            with patch.object(
                action_history,
                "get_history_file",
                return_value=history_path,
            ), patch.object(
                trash_action,
                "get_trash_dir",
                return_value=root / "trash",
            ):
                for move, action in actions:
                    with self.subTest(action=action):
                        result = move(str(missing), dtm_root=str(root / "dtm"))

                        self.assertEqual(
                            set(result),
                            {"success", "action", "path", "message"},
                        )
                        self.assertFalse(result["success"])
                        self.assertEqual(result["action"], action)
                        self.assertEqual(result["message"], "File does not exist.")

            self.assertFalse(history_path.exists())

    def test_batch_action_preserves_partial_result_and_history_contracts(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            source = root / "source" / "report.txt"
            source.parent.mkdir()
            source.write_text("original", encoding="utf-8")
            missing = root / "missing.txt"
            dtm_root = root / "dtm"
            archive_dir = dtm_root / "Archive"
            archive_dir.mkdir(parents=True)
            (archive_dir / "report.txt").write_text("collision", encoding="utf-8")
            history_path = root / "history.json"

            with patch.object(
                action_history,
                "get_history_file",
                return_value=history_path,
            ):
                result = batch_action.run_batch(
                    {
                        "action": "archive",
                        "paths": [str(source), str(missing)],
                        "mode": "bulk",
                    },
                    dtm_root,
                )

            self.assertEqual(
                set(result),
                {
                    "success",
                    "partial_success",
                    "message",
                    "action",
                    "mode",
                    "total",
                    "success_count",
                    "failure_count",
                    "results",
                },
            )
            self.assertFalse(result["success"])
            self.assertTrue(result["partial_success"])
            self.assertEqual(result["success_count"], 1)
            self.assertEqual(result["failure_count"], 1)
            self.assertEqual(
                set(result["results"][0]),
                {
                    "success",
                    "message",
                    "action",
                    "path",
                    "source_path",
                    "destination",
                    "destination_path",
                    "history_entry",
                },
            )
            self.assertEqual(
                Path(result["results"][0]["destination"]).resolve(),
                (archive_dir / "report_1.txt").resolve(),
            )
            self.assertEqual(
                set(result["results"][1]),
                {"success", "message", "action", "source_path", "path"},
            )

            history = json.loads(history_path.read_text(encoding="utf-8"))
            self.assertEqual(len(history), 1)
            self.assertEqual(history[0]["action"], "move_to_archive")
            self.assertEqual(history[0]["mode"], "bulk")

    def test_archive_records_history_and_restore_handles_collision(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            source = root / "source" / "report.txt"
            source.parent.mkdir()
            source.write_text("original", encoding="utf-8")
            dtm_root = root / "dtm"
            history_path = root / "history" / "action-history.json"

            with patch.object(
                action_history,
                "get_history_file",
                return_value=history_path,
            ):
                archived = archive_action.move_one_to_archive(
                    str(source),
                    dtm_root=str(dtm_root),
                )

                self.assertTrue(archived["success"])
                self.assertFalse(source.exists())
                self.assertEqual(Path(archived["destination"]).read_text(), "original")

                history = json.loads(history_path.read_text(encoding="utf-8"))
                self.assertEqual(history[0]["action"], "move_to_archive")
                self.assertEqual(history[0]["source_path"], str(source.resolve()))

                source.write_text("replacement", encoding="utf-8")
                restored = restore_action_module.restore_from_history(
                    archived["history_entry"]
                )

            restored_path = Path(restored["destination"])
            self.assertTrue(restored["success"])
            self.assertEqual(restored["action"], "restore_from_archive")
            self.assertEqual(restored_path.name, "report_restored_1.txt")
            self.assertEqual(restored_path.read_text(encoding="utf-8"), "original")
            self.assertEqual(source.read_text(encoding="utf-8"), "replacement")
            self.assertEqual(
                restored["history_entry"]["reverts_history_id"],
                archived["history_entry"]["id"],
            )

    def test_batch_archive_reports_partial_success(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            existing = root / "existing.txt"
            existing.write_text("content", encoding="utf-8")
            missing = root / "missing.txt"
            history_path = root / "history.json"

            with patch.object(
                action_history,
                "get_history_file",
                return_value=history_path,
            ):
                result = archive_action.move_to_archive(
                    json.dumps([str(existing), str(missing)]),
                    dtm_root=str(root / "dtm"),
                    mode="batch",
                )

            self.assertFalse(result["success"])
            self.assertTrue(result["partial_success"])
            self.assertEqual(result["succeeded"], 1)
            self.assertEqual(result["failed"], 1)


if __name__ == "__main__":
    unittest.main()
