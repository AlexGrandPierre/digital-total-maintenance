/**
 * csv-review-selectors.test.mjs
 *
 * Focused regression tests for CSV review decision behavior moved out of
 * App.tsx during the session/adjudication extraction.
 *
 * Covers:
 * - Existing suspicious-value issue identifiers
 * - Single and bulk decision record transformations
 * - Dataset-scoped decision summaries
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createBulkDatasetDecisionRecords,
  createDatasetDecisionRecord,
  createSuspiciousDecisionRecord,
  getSuspiciousIssueId,
  summarizeDatasetDecisions,
  summarizeSuspiciousDecisions,
} from '../../src/domains/csv-review/selectors.ts';

const updatedAt = '2026-08-27T12:00:00.000Z';

function duplicateGroup(groupId) {
  return {
    group_id: groupId,
    confidence: 'high',
    reason: 'matching identity fields',
    matching_columns: ['First Name'],
    varying_id_columns: [],
    rows: [],
    row_numbers: [],
    rows_total: 2,
    hidden_rows_count: 0,
  };
}

test('existing issue IDs take precedence over fallback construction', () => {
  const example = {
    issue_id: 'csv-suspicious-existing',
    row_number: 4,
    column: 'Email',
    value: 'bad-email',
  };

  assert.equal(
    getSuspiciousIssueId(example, '/datasets/people.csv'),
    'csv-suspicious-existing',
  );
});

test('fallback issue IDs preserve path, row, column, and optional value behavior', () => {
  assert.equal(
    getSuspiciousIssueId(
      { row_number: 4, column: 'Email', value: 'bad-email' },
      '/datasets/people.csv',
    ),
    '/datasets/people.csv::4::Email::bad-email',
  );
  assert.equal(
    getSuspiciousIssueId({ row_number: 5, column: 'Phone' }),
    'unknown-dataset::5::Phone::',
  );
});

test('single decision transformations preserve current record shapes', () => {
  assert.deepEqual(
    createDatasetDecisionRecord(
      'group-1',
      'approved_duplicate',
      '/datasets/people.csv',
      updatedAt,
    ),
    {
      group_id: 'group-1',
      decision: 'approved_duplicate',
      csv_path: '/datasets/people.csv',
      updated_at: updatedAt,
    },
  );
  assert.deepEqual(
    createSuspiciousDecisionRecord(
      { row_number: 7, column: 'DOB' },
      'valid_data',
      '/datasets/people.csv',
      updatedAt,
    ),
    {
      issue_id: '/datasets/people.csv::7::DOB::',
      decision: 'valid_data',
      csv_path: '/datasets/people.csv',
      row_number: 7,
      column: 'DOB',
      updated_at: updatedAt,
    },
  );
});

test('bulk duplicate decisions use one timestamp and group-keyed records', () => {
  const records = createBulkDatasetDecisionRecords(
    [duplicateGroup('group-1'), duplicateGroup('group-2')],
    'needs_review',
    '/datasets/people.csv',
    updatedAt,
  );

  assert.deepEqual(Object.keys(records), ['group-1', 'group-2']);
  assert.equal(records['group-1'].decision, 'needs_review');
  assert.equal(records['group-2'].updated_at, updatedAt);
});

test('duplicate summaries include only decisions for the active dataset', () => {
  const decisions = {
    one: createDatasetDecisionRecord(
      'one',
      'approved_duplicate',
      '/datasets/people.csv',
      updatedAt,
    ),
    two: createDatasetDecisionRecord(
      'two',
      'pending',
      '/datasets/people.csv',
      updatedAt,
    ),
    other: createDatasetDecisionRecord(
      'other',
      'ignored',
      '/datasets/other.csv',
      updatedAt,
    ),
  };

  assert.deepEqual(
    summarizeDatasetDecisions(decisions, '/datasets/people.csv', 5),
    {
      totalVisible: 5,
      approved_duplicate: 1,
      legitimate_records: 0,
      needs_review: 0,
      ignored: 0,
      pending: 4,
      reviewed: 1,
    },
  );
});

test('suspicious summaries preserve pending and capped completion behavior', () => {
  const decisions = {
    one: createSuspiciousDecisionRecord(
      { row_number: 1, column: 'DOB' },
      'valid_data',
      '/datasets/people.csv',
      updatedAt,
    ),
    two: createSuspiciousDecisionRecord(
      { row_number: 2, column: 'DOB' },
      'corrupted',
      '/datasets/people.csv',
      updatedAt,
    ),
    other: createSuspiciousDecisionRecord(
      { row_number: 3, column: 'DOB' },
      'ignored',
      '/datasets/other.csv',
      updatedAt,
    ),
  };

  assert.deepEqual(
    summarizeSuspiciousDecisions(decisions, '/datasets/people.csv', 3),
    { reviewed: 2, pending: 1, completionPercentage: 67 },
  );
  assert.deepEqual(
    summarizeSuspiciousDecisions(decisions, '/datasets/people.csv', 1),
    { reviewed: 2, pending: 0, completionPercentage: 100 },
  );
});
