/**
 * filesystem-action-selectors.test.mjs
 *
 * Focused regression tests for consequential frontend filesystem-session logic.
 *
 * Covers:
 * - Idempotent session accounting and rescan reset
 * - Queue and duplicate reconciliation
 * - Existing insight and duplicate-primary behavior
 * - Session-adjusted workspace totals
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  filesystemActionSessionReducer,
  getAdjustedFilesystemTotals,
  getSelectedDuplicatePrimaryPath,
  initialFilesystemActionSessionState,
  reconcileScanInsightsAfterAction,
  removePathsFromScanResult,
} from '../../src/domains/filesystem-actions/selectors.ts';

function file(path, overrides = {}) {
  return {
    path,
    name: path.split('/').at(-1),
    context_type: 'download',
    reason: 'old export',
    ...overrides,
  };
}

function scanResult(overrides = {}) {
  const target = file('/source/report.csv');
  const companion = file('/source/report copy.csv');

  return {
    total_files: 4,
    review_files: [target],
    review_total: 3,
    archive_candidates: [target],
    archive_total: 2,
    remove_candidates: [target],
    remove_total: 1,
    system_files: [target],
    duplicates: [
      {
        group_id: 'duplicate-1',
        items: [target, companion],
      },
    ],
    duplicates_total: 1,
    scan_insights: {
      review_context_summary: [{ label: 'download', count: 1 }],
      top_review_reasons: [{ label: 'old export', count: 2 }],
      pattern_previews: {
        'context_type:download': {
          review: { total: 2, items: [target, companion] },
          archive: { total: 2, items: [target, companion] },
          remove: { total: 2, items: [target, companion] },
        },
      },
    },
    ...overrides,
  };
}

test('session accounting is idempotent by path and resets after rescan', () => {
  const action = {
    type: 'FILE_ACTION_SUCCEEDED',
    sourceQueue: 'review',
    fileAction: 'archive',
    filePath: '/source/report.csv',
  };
  const once = filesystemActionSessionReducer(
    initialFilesystemActionSessionState,
    action,
  );
  const twice = filesystemActionSessionReducer(once, action);

  assert.equal(twice.reviewResolved, 1);
  assert.equal(twice.filesArchived, 1);
  assert.deepEqual(twice.resolvedPaths, ['/source/report.csv']);
  assert.equal(twice.needsRescan, true);
  assert.equal(
    filesystemActionSessionReducer(twice, { type: 'RESET_AFTER_RESCAN' }),
    initialFilesystemActionSessionState,
  );
});

test('queue reconciliation removes a path everywhere but preserves reported totals', () => {
  const original = scanResult();
  const reconciled = removePathsFromScanResult(original, [
    '/source/report.csv',
  ]);

  assert.equal(reconciled.review_files.length, 0);
  assert.equal(reconciled.archive_candidates.length, 0);
  assert.equal(reconciled.remove_candidates.length, 0);
  assert.equal(reconciled.system_files.length, 0);
  assert.equal(reconciled.duplicates.length, 0);
  assert.equal(reconciled.duplicates_total, 0);
  assert.equal(reconciled.review_total, 3);
  assert.equal(reconciled.archive_total, 2);
  assert.equal(reconciled.remove_total, 1);
  assert.equal(original.review_files.length, 1);
});

test('insight reconciliation preserves current action-specific total behavior', () => {
  const original = scanResult();
  const target = original.review_files[0];
  const reconciled = reconcileScanInsightsAfterAction(
    original,
    target,
    'archive',
  );
  const preview = reconciled.scan_insights.pattern_previews[
    'context_type:download'
  ];

  assert.deepEqual(reconciled.scan_insights.review_context_summary, []);
  assert.deepEqual(reconciled.scan_insights.top_review_reasons, [
    { label: 'old export', count: 1 },
  ]);
  assert.equal(preview.review.total, 1);
  assert.equal(preview.archive.total, 1);
  assert.equal(preview.remove.total, 2);
  assert.equal(preview.review.items.length, 1);
  assert.equal(original.scan_insights.pattern_previews['context_type:download'].review.total, 2);
});

test('duplicate primary selection accepts a valid manual choice and rejects stale choices', () => {
  const group = {
    group_id: 'duplicate-1',
    items: [
      { path: '/source/report.csv', name: 'report.csv' },
      { path: '/source/report copy.csv', name: 'report copy.csv' },
    ],
  };

  assert.equal(
    getSelectedDuplicatePrimaryPath(group, '/source/report copy.csv'),
    '/source/report copy.csv',
  );
  assert.equal(
    getSelectedDuplicatePrimaryPath(group, '/missing/report.csv'),
    '/source/report.csv',
  );
});

test('adjusted totals preserve scanned estimates and session action semantics', () => {
  const session = {
    ...initialFilesystemActionSessionState,
    reviewResolved: 1,
    archiveResolved: 1,
    filesArchived: 1,
    filesKept: 1,
    resolvedDuplicateGroupIds: ['duplicate-1'],
  };

  assert.deepEqual(getAdjustedFilesystemTotals(scanResult(), session), {
    totalFiles: 3,
    review: 2,
    archive: 1,
    remove: 1,
    duplicateGroups: 0,
    sessionActions: 2,
  });
});
