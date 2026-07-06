#!/bin/bash
set -e

pyinstaller --onefile --name csv_scan modules/csv_scan.py
cp dist/csv_scan bundled-python/csv_scan

pyinstaller --onefile --name csv_review_index modules/csv_review_index.py
cp dist/csv_review_index bundled-python/csv_review_index

pyinstaller --onefile --name csv_review_session modules/csv_review_session.py
cp dist/csv_review_session bundled-python/csv_review_session

pyinstaller --onefile --name dataset_decision modules/dataset_decision.py
cp dist/dataset_decision bundled-python/dataset_decision

pyinstaller --onefile --name csv_action modules/csv_action.py
cp dist/csv_action bundled-python/csv_action

pyinstaller --onefile --name batch_action modules/batch_action.py
cp dist/batch_action bundled-python/batch_action

pyinstaller --onefile --name restore_action modules/restore_action.py
cp dist/restore_action bundled-python/restore_action
