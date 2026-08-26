/**
 * selectors.ts
 *
 * Pure action-history eligibility, filtering, and selection behavior.
 *
 * Responsibilities:
 * - Determine whether a recorded move can be undone
 * - Filter history by current review mode
 * - Update and resolve selected undoable entries
 *
 * This module DOES NOT:
 * - Manage React state
 * - Execute restores
 * - Call Electron APIs
 */

import type { ActionHistoryEntry, HistoryFilter } from './types';

const MOVE_ACTIONS = new Set<ActionHistoryEntry['action']>([
  'move_to_review',
  'move_to_archive',
  'move_to_trash',
]);

const RESTORE_ACTIONS = new Set<ActionHistoryEntry['action']>([
  'restore_from_review',
  'restore_from_archive',
  'restore_from_trash',
]);

export function canUndoHistoryEntry(
  entry: ActionHistoryEntry,
  history: ActionHistoryEntry[],
) {
  if (
    entry.status !== 'success' ||
    !MOVE_ACTIONS.has(entry.action) ||
    !entry.source_path ||
    !entry.destination_path
  ) {
    return false;
  }

  return !history.some(
    (historyEntry) =>
      RESTORE_ACTIONS.has(historyEntry.action) &&
      historyEntry.status === 'success' &&
      historyEntry.reverts_history_id === entry.id,
  );
}

export function filterActionHistory(
  history: ActionHistoryEntry[],
  filter: HistoryFilter,
) {
  if (filter === 'undoable') {
    return history.filter((entry) => canUndoHistoryEntry(entry, history));
  }

  if (filter === 'restored') {
    return history.filter((entry) => RESTORE_ACTIONS.has(entry.action));
  }

  return history;
}

export function toggleHistorySelection(
  selectedIds: Set<string>,
  entryId: string,
) {
  const next = new Set(selectedIds);

  if (next.has(entryId)) {
    next.delete(entryId);
  } else {
    next.add(entryId);
  }

  return next;
}

export function getSelectedUndoableEntries(
  visibleHistory: ActionHistoryEntry[],
  selectedIds: Set<string>,
  fullHistory: ActionHistoryEntry[],
) {
  return visibleHistory.filter(
    (entry) =>
      selectedIds.has(entry.id) && canUndoHistoryEntry(entry, fullHistory),
  );
}
