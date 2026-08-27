/**
 * types.ts
 *
 * Frontend contracts for scan requests, progress, and interpreted completion.
 *
 * Responsibilities:
 * - Describe scan request inputs and normalized progress
 * - Distinguish filesystem, CSV, and invalid scan completions
 *
 * This module DOES NOT:
 * - Own filesystem or CSV result workflows
 * - Define downstream scan-completion consequences
 */

import type { CsvScanResult, ScanPreset, ScanResult } from '../../types/dtm';

export type ScanRequest = {
  preset: ScanPreset;
  customPath: string;
  csvPath: string;
};

export type FileScanProgressEvent = {
  status: string;
  target: string;
  files_scanned: number;
  current_path: string;
  elapsed_seconds: number;
  review_total: number;
  archive_total: number;
  remove_total: number;
  duplicates_total: number;
  excluded_dirs_count?: number;
};

export type CsvScanProgressEvent = {
  status: string;
  target: string;
  rows_scanned: number;
  rows_per_second?: number;
  elapsed_seconds: number;
  current_stage: string;
  duplicate_candidates?: number;
  suspicious_values?: number;
  missing_values?: number;
  total_rows_estimate?: number | null;
};

export type ScanProgressEvent =
  | FileScanProgressEvent
  | CsvScanProgressEvent;

export type ScanProgress =
  | {
      type: 'csv_progress';
      status: string;
      target: string;
      rows_scanned: number;
      rows_per_second: number;
      elapsed_seconds: number;
      current_stage: string;
      duplicate_candidates: number;
      suspicious_values: number;
      missing_values: number;
      total_rows_estimate: number | null;
    }
  | {
      type: 'progress';
      status: string;
      target: string;
      files_scanned: number;
      current_path: string;
      elapsed_seconds: number;
      review_total: number;
      archive_total: number;
      remove_total: number;
      duplicates_total: number;
      excluded_dirs_count: number;
    };

export type ScanCompletion =
  | {
      kind: 'filesystem';
      output: string;
      result: ScanResult;
    }
  | {
      kind: 'csv';
      output: string;
      result: CsvScanResult;
    }
  | {
      kind: 'invalid';
      output: string;
    };

export type ScanStatus = {
  tone: 'success' | 'error';
  message: string;
};
