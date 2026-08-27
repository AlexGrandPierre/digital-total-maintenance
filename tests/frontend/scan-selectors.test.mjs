/**
 * scan-selectors.test.mjs
 *
 * Focused regression tests for consequential scan interpretation moved out of
 * App.tsx during the scan lifecycle extraction.
 *
 * Covers:
 * - Filesystem, CSV, and invalid completion routing
 * - Default normalization of filesystem and CSV progress
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  interpretScanCompletion,
  normalizeScanProgress,
} from '../../src/domains/scanning/selectors.ts';

test('scan completion distinguishes filesystem and CSV results', () => {
  const filesystem = interpretScanCompletion(
    JSON.stringify({ type: 'scan', total_files: 3 }),
  );
  const csv = interpretScanCompletion(
    JSON.stringify({ type: 'csv_scan', path: '/datasets/people.csv' }),
  );

  assert.equal(filesystem.kind, 'filesystem');
  assert.equal(filesystem.result.total_files, 3);
  assert.equal(csv.kind, 'csv');
  assert.equal(csv.result.path, '/datasets/people.csv');
});

test('missing and malformed completion output remain invalid', () => {
  assert.deepEqual(interpretScanCompletion(), {
    kind: 'invalid',
    output: 'Scan completed with no output.',
  });
  assert.deepEqual(interpretScanCompletion('not-json'), {
    kind: 'invalid',
    output: 'not-json',
  });
});

test('CSV progress preserves values and applies existing defaults', () => {
  assert.deepEqual(
    normalizeScanProgress({
      status: 'scanning',
      target: 'CSV Dataset',
      rows_scanned: 12,
      elapsed_seconds: 2,
      current_stage: 'analyzing_rows',
    }),
    {
      type: 'csv_progress',
      status: 'scanning',
      target: 'CSV Dataset',
      rows_scanned: 12,
      rows_per_second: 0,
      elapsed_seconds: 2,
      current_stage: 'analyzing_rows',
      duplicate_candidates: 0,
      suspicious_values: 0,
      missing_values: 0,
      total_rows_estimate: null,
    },
  );
});

test('filesystem progress preserves values and defaults excluded directories', () => {
  assert.deepEqual(
    normalizeScanProgress({
      status: 'scanning',
      target: 'Desktop',
      files_scanned: 8,
      current_path: '/Desktop/report.pdf',
      elapsed_seconds: 1,
      review_total: 2,
      archive_total: 1,
      remove_total: 0,
      duplicates_total: 1,
    }),
    {
      type: 'progress',
      status: 'scanning',
      target: 'Desktop',
      files_scanned: 8,
      current_path: '/Desktop/report.pdf',
      elapsed_seconds: 1,
      review_total: 2,
      archive_total: 1,
      remove_total: 0,
      duplicates_total: 1,
      excluded_dirs_count: 0,
    },
  );
});
