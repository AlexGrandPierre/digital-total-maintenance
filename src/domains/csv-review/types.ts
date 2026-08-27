/**
 * types.ts
 *
 * Frontend contracts for CSV review sessions and adjudication.
 *
 * Responsibilities:
 * - Define duplicate and suspicious-value decisions
 * - Describe persisted review-session metadata
 * - Describe decision summary output
 *
 * This module DOES NOT:
 * - Define CSV scan findings
 * - Manage persistence or React state
 * - Define dataset identity semantics
 */

export type DatasetDecision =
  | 'approved_duplicate'
  | 'legitimate_records'
  | 'needs_review'
  | 'ignored'
  | 'pending';

export type DatasetDecisionRecord = {
  group_id: string;
  decision: DatasetDecision;
  csv_path?: string;
  updated_at: string;
};

export type SuspiciousDecision =
  | 'pending'
  | 'valid_data'
  | 'corrupted'
  | 'needs_review'
  | 'ignored';

export type SuspiciousDecisionRecord = {
  issue_id: string;
  decision: SuspiciousDecision;
  csv_path?: string;
  row_number: number;
  column: string;
  updated_at: string;
};

export type CsvReviewSessionMetadata = {
  csv_path: string;
  session_id: string;
  last_updated: string | null;
};

export type CsvReviewStatus = {
  tone: 'success' | 'error';
  message: string;
};
