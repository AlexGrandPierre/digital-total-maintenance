/**
 * selectors.ts
 *
 * Pure CSV review decision construction and summary behavior.
 *
 * Responsibilities:
 * - Preserve current suspicious-value issue identifiers
 * - Build duplicate and suspicious-value decision records
 * - Summarize review completion for the active CSV path
 *
 * This module DOES NOT:
 * - Load or save review sessions
 * - Manage React state
 * - Filter or paginate CSV findings
 */

import type { CsvDuplicateGroup } from '../../types/dtm';
import type {
  DatasetDecision,
  DatasetDecisionRecord,
  SuspiciousDecision,
  SuspiciousDecisionRecord,
} from './types';

export type SuspiciousIssueInput = {
  issue_id?: string;
  row_number: number;
  column: string;
  value?: string;
};

export function getSuspiciousIssueId(
  example: SuspiciousIssueInput,
  datasetPath?: string,
) {
  if (example.issue_id) return example.issue_id;

  return [
    datasetPath ?? 'unknown-dataset',
    example.row_number,
    example.column,
    example.value ?? '',
  ].join('::');
}

export function createDatasetDecisionRecord(
  groupId: string,
  decision: DatasetDecision,
  csvPath: string,
  updatedAt: string,
): DatasetDecisionRecord {
  return {
    group_id: groupId,
    decision,
    csv_path: csvPath,
    updated_at: updatedAt,
  };
}

export function createSuspiciousDecisionRecord(
  example: SuspiciousIssueInput,
  decision: SuspiciousDecision,
  csvPath: string,
  updatedAt: string,
): SuspiciousDecisionRecord {
  return {
    issue_id: getSuspiciousIssueId(example, csvPath),
    decision,
    csv_path: csvPath,
    row_number: example.row_number,
    column: example.column,
    updated_at: updatedAt,
  };
}

export function createBulkDatasetDecisionRecords(
  groups: CsvDuplicateGroup[],
  decision: DatasetDecision,
  csvPath: string,
  updatedAt: string,
) {
  return Object.fromEntries(
    groups.map((group) => [
      group.group_id,
      createDatasetDecisionRecord(
        group.group_id,
        decision,
        csvPath,
        updatedAt,
      ),
    ]),
  ) as Record<string, DatasetDecisionRecord>;
}

export function summarizeDatasetDecisions(
  decisions: Record<string, DatasetDecisionRecord>,
  csvPath: string | undefined,
  totalVisible: number,
) {
  const activeRecords = Object.values(decisions).filter(
    (record) => record.csv_path === csvPath,
  );
  const reviewed = activeRecords.filter(
    (record) => record.decision !== 'pending',
  ).length;

  return {
    totalVisible,
    approved_duplicate: activeRecords.filter(
      (record) => record.decision === 'approved_duplicate',
    ).length,
    legitimate_records: activeRecords.filter(
      (record) => record.decision === 'legitimate_records',
    ).length,
    needs_review: activeRecords.filter(
      (record) => record.decision === 'needs_review',
    ).length,
    ignored: activeRecords.filter((record) => record.decision === 'ignored')
      .length,
    pending: Math.max(0, totalVisible - reviewed),
    reviewed,
  };
}

export function summarizeSuspiciousDecisions(
  decisions: Record<string, SuspiciousDecisionRecord>,
  csvPath: string | undefined,
  total: number,
) {
  const reviewed = csvPath
    ? Object.values(decisions).filter(
        (record) =>
          record.csv_path === csvPath && record.decision !== 'pending',
      ).length
    : 0;

  return {
    reviewed,
    pending: Math.max(0, total - reviewed),
    completionPercentage:
      total === 0
        ? 0
        : Math.min(100, Math.round((reviewed / total) * 100)),
  };
}
