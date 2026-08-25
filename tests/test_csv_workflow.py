import contextlib
import csv
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


MODULES_DIR = Path(__file__).resolve().parents[1] / "modules"
sys.path.insert(0, str(MODULES_DIR))

import csv_action  # noqa: E402
import csv_review_index  # noqa: E402
import csv_review_session  # noqa: E402
import csv_scan  # noqa: E402


FIELDNAMES = [
    "First Name",
    "Last Name",
    "Date of Birth",
    "Gender",
    "Record ID",
    "Email",
    "Empty Column",
]

ROWS = [
    [" Alice ", "Smith", "1990-01-01", "F", "1", "alice@example.com", ""],
    ["Alice", "Smith", "1990-01-01", "F", "2", "alice@example.com", ""],
    ["Bob", "Jones", "1900-01-01", "M", "3", "not-an-email", ""],
]


def write_dataset(path):
    with path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(FIELDNAMES)
        writer.writerows(ROWS)


class CsvAnalysisContractTests(unittest.TestCase):
    def test_scan_profiles_findings_and_writes_full_review_indexes(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            dataset = root / "people.csv"
            dtm_root = root / "dtm"
            write_dataset(dataset)
            original = dataset.read_bytes()

            with patch.object(
                csv_scan,
                "get_default_dtm_root",
                return_value=str(dtm_root),
            ), contextlib.redirect_stdout(io.StringIO()):
                result = csv_scan.scan_csv(str(dataset))

            self.assertTrue(result["success"])
            self.assertEqual(result["row_count"], 3)
            self.assertEqual(result["column_count"], len(FIELDNAMES))
            self.assertEqual(result["duplicate_groups_total"], 1)
            self.assertEqual(result["duplicate_groups"][0]["rows_total"], 2)
            self.assertIn("Record ID", result["duplicate_groups"][0]["varying_id_columns"])
            self.assertGreater(result["suspicious_value_summary"]["total"], 0)
            self.assertEqual(result["empty_columns"], ["Empty Column"])
            self.assertEqual(dataset.read_bytes(), original)

            review_index = result["review_index"]
            self.assertTrue(Path(review_index["duplicate_index_path"]).exists())
            self.assertTrue(Path(review_index["suspicious_index_path"]).exists())
            self.assertEqual(
                review_index["dataset_id"],
                csv_scan.make_dataset_id(str(dataset)),
            )

    def test_review_index_paginates_after_excluding_decided_findings(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            index_path = Path(temporary_directory) / "findings.jsonl"
            records = [
                {"group_id": f"group-{index}", "value": index}
                for index in range(5)
            ]
            index_path.write_text(
                "".join(json.dumps(record) + "\n" for record in records),
                encoding="utf-8",
            )

            result = csv_review_index.read_jsonl_page(
                index_path,
                offset=1,
                limit=2,
                exclude_ids=["group-1"],
                id_field="group_id",
            )

            self.assertTrue(result["success"])
            self.assertEqual(result["total"], 5)
            self.assertEqual(result["remaining_total"], 4)
            self.assertEqual(
                [item["group_id"] for item in result["items"]],
                ["group-2", "group-3"],
            )
            self.assertEqual(result["next_offset"], 3)
            self.assertTrue(result["has_more"])


class CsvDecisionAndExportContractTests(unittest.TestCase):
    def test_review_session_round_trips_decisions_and_is_keyed_by_path(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            app_data = Path(temporary_directory) / "app-data"
            dataset = Path(temporary_directory) / "people.csv"
            write_dataset(dataset)
            payload = {
                "csv_path": str(dataset),
                "duplicate_decisions": {"group-1": {"decision": "approved_duplicate"}},
                "suspicious_decisions": {"issue-1": {"decision": "accepted"}},
            }

            saved = csv_review_session.save_session(str(app_data), payload)
            loaded = csv_review_session.load_session(str(app_data), str(dataset))

            self.assertTrue(saved["success"])
            self.assertTrue(loaded["success"])
            self.assertEqual(
                loaded["session"]["duplicate_decisions"],
                payload["duplicate_decisions"],
            )
            self.assertEqual(
                loaded["session"]["session_id"],
                csv_review_session.get_session_id(str(dataset)),
            )

            dataset.write_text("replacement revision", encoding="utf-8")
            self.assertEqual(
                csv_review_session.get_session_id(str(dataset)),
                loaded["session"]["session_id"],
            )

    def test_clean_copy_applies_review_decisions_without_mutating_source(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            dataset = root / "people.csv"
            write_dataset(dataset)
            original = dataset.read_bytes()
            duplicate_group = {
                "group_id": "group-1",
                "row_numbers": [1, 2],
            }

            export_directory = root / "exports"
            export_directory.mkdir()

            with patch.object(
                csv_action,
                "ensure_export_dir",
                return_value=str(export_directory),
            ):
                result = csv_action.export_clean_copy(
                    app_data_path=str(root / "app-data"),
                    csv_path=str(dataset),
                    duplicate_groups=[duplicate_group],
                    dataset_decisions={
                        "group-1": {"decision": "approved_duplicate"}
                    },
                    exclude_duplicate_rows=True,
                )

            self.assertTrue(result["success"])
            self.assertEqual(result["row_count"], 2)
            self.assertEqual(result["removed_rows"], 1)
            self.assertEqual(result["removed_columns"], 1)
            self.assertEqual(dataset.read_bytes(), original)

            with Path(result["export_path"]).open(
                "r", encoding="utf-8", newline=""
            ) as file:
                exported_rows = list(csv.DictReader(file))

            self.assertEqual(len(exported_rows), 2)
            self.assertNotIn("DTM Row Number", exported_rows[0])
            self.assertEqual(exported_rows[0]["First Name"], "Alice")


if __name__ == "__main__":
    unittest.main()
