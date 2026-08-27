/**
 * selectors.ts
 *
 * Pure interpretation helpers for the frontend scan lifecycle.
 *
 * Responsibilities:
 * - Interpret completed scan output without triggering downstream workflows
 * - Normalize Electron filesystem and CSV progress events
 * - Construct the existing starting progress states
 *
 * This module DOES NOT:
 * - Subscribe to Electron events
 * - Manage React state
 * - Coordinate history, review indexes, or review sessions
 */

import type { ScanPreset } from '../../types/dtm';
import type {
  ScanCompletion,
  ScanProgress,
  ScanProgressEvent,
} from './types';

const EMPTY_SCAN_OUTPUT = 'Scan completed with no output.';

export function getScanTargetLabel(preset: ScanPreset) {
  switch (preset) {
    case 'desktop':
      return 'Desktop';
    case 'downloads':
      return 'Downloads';
    case 'documents':
      return 'Documents';
    case 'custom':
      return 'Custom Folder';
    case 'csv':
      return 'CSV Dataset';
    case 'test':
    default:
      return 'Test Folder';
  }
}

export function interpretScanCompletion(output?: string): ScanCompletion {
  const normalizedOutput = output || EMPTY_SCAN_OUTPUT;

  try {
    const parsed = JSON.parse(normalizedOutput);

    if (parsed.type === 'csv_scan') {
      return {
        kind: 'csv',
        output: normalizedOutput,
        result: parsed,
      };
    }

    return {
      kind: 'filesystem',
      output: normalizedOutput,
      result: parsed,
    };
  } catch {
    return {
      kind: 'invalid',
      output: normalizedOutput,
    };
  }
}

export function normalizeScanProgress(
  event: ScanProgressEvent,
): ScanProgress {
  if ('rows_scanned' in event) {
    return {
      type: 'csv_progress',
      status: event.status,
      target: event.target,
      rows_scanned: event.rows_scanned,
      rows_per_second: event.rows_per_second ?? 0,
      elapsed_seconds: event.elapsed_seconds,
      current_stage: event.current_stage,
      duplicate_candidates: event.duplicate_candidates ?? 0,
      suspicious_values: event.suspicious_values ?? 0,
      missing_values: event.missing_values ?? 0,
      total_rows_estimate: event.total_rows_estimate ?? null,
    };
  }

  return {
    type: 'progress',
    status: event.status,
    target: event.target,
    files_scanned: event.files_scanned,
    current_path: event.current_path,
    elapsed_seconds: event.elapsed_seconds,
    review_total: event.review_total,
    archive_total: event.archive_total,
    remove_total: event.remove_total,
    duplicates_total: event.duplicates_total,
    excluded_dirs_count: event.excluded_dirs_count ?? 0,
  };
}

export function createStartingScanProgress(
  preset: ScanPreset,
  target: string,
): ScanProgress {
  if (preset === 'csv') {
    return {
      type: 'csv_progress',
      status: 'starting',
      target,
      rows_scanned: 0,
      rows_per_second: 0,
      elapsed_seconds: 0,
      current_stage: 'starting',
      duplicate_candidates: 0,
      suspicious_values: 0,
      missing_values: 0,
      total_rows_estimate: 0,
    };
  }

  return {
    type: 'progress',
    status: 'starting',
    target,
    files_scanned: 0,
    current_path: 'Preparing scan...',
    elapsed_seconds: 0,
    review_total: 0,
    archive_total: 0,
    remove_total: 0,
    duplicates_total: 0,
    excluded_dirs_count: 0,
  };
}
