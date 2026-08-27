/**
 * ipc.ts
 *
 * Renderer transport boundary for Electron operations extracted into domains.
 *
 * Responsibilities:
 * - Request action-history records
 * - Request individual and bulk history restores
 * - Request local action-history clearing
 *
 * This module DOES NOT:
 * - Own history state or selection behavior
 * - Interpret history responses
 * - Wrap unrelated Electron operations
 */

import type { ActionHistoryEntry } from '../domains/history/types';
import type {
  DatasetDecisionRecord,
  SuspiciousDecisionRecord,
} from '../domains/csv-review/types';

export async function readActionHistory(limit = 100) {
  return window.electronAPI?.getActionHistory?.(limit);
}

export async function clearActionHistory() {
  return window.electronAPI?.clearActionHistory?.();
}

export async function restoreHistoryEntry(entry: ActionHistoryEntry) {
  return window.electronAPI?.restoreFromHistory?.(entry);
}

export async function bulkRestoreHistoryEntries(entries: ActionHistoryEntry[]) {
  return window.electronAPI?.bulkRestoreFromHistory?.({
    entries,
    mode: 'bulk',
  });
}

export async function readLegacyDatasetDecisions() {
  return window.electronAPI?.getDatasetDecisions?.();
}

export async function loadCsvReviewSession(csvPath: string) {
  return window.electronAPI?.loadCsvReviewSession?.({
    csv_path: csvPath,
  });
}

export async function saveCsvReviewSession(
  csvPath: string,
  duplicateDecisions: Record<string, DatasetDecisionRecord>,
  suspiciousDecisions: Record<string, SuspiciousDecisionRecord>,
) {
  return window.electronAPI?.saveCsvReviewSession?.({
    csv_path: csvPath,
    duplicate_decisions: duplicateDecisions,
    suspicious_decisions: suspiciousDecisions,
  });
}
