/**
 * useActionHistory.ts
 *
 * State and commands for the frontend action-history workflow.
 *
 * Responsibilities:
 * - Load and filter action history
 * - Track selection and restore activity
 * - Coordinate individual, bulk, and clear commands
 * - Report outcomes through the existing application status seam
 *
 * This module DOES NOT:
 * - Render history UI
 * - Perform filesystem operations directly
 * - Own application-wide scanning or action state
 */

import { useCallback, useMemo, useState } from 'react';

import {
  bulkRestoreHistoryEntries,
  clearActionHistory,
  readActionHistory,
  restoreHistoryEntry,
} from '../../services/ipc';
import {
  canUndoHistoryEntry as selectCanUndoHistoryEntry,
  filterActionHistory,
  getSelectedUndoableEntries,
  toggleHistorySelection,
} from './selectors';
import type {
  ActionHistoryEntry,
  HistoryFilter,
  HistoryStatus,
} from './types';

type UseActionHistoryOptions = {
  onStatusChange: (status: HistoryStatus | null) => void;
};

export function useActionHistory({
  onStatusChange,
}: UseActionHistoryOptions) {
  const [actionHistory, setActionHistory] = useState<ActionHistoryEntry[]>([]);
  const [historyFilter, setHistoryFilter] =
    useState<HistoryFilter>('undoable');
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<Set<string>>(
    new Set(),
  );
  const [busyHistoryId, setBusyHistoryId] = useState<string | null>(null);
  const [isBulkRestoring, setIsBulkRestoring] = useState(false);

  const refreshActionHistory = useCallback(async () => {
    try {
      const history = await readActionHistory(100);
      setActionHistory(
        Array.isArray(history) ? (history as ActionHistoryEntry[]) : [],
      );
    } catch {
      setActionHistory([]);
    }
  }, []);

  const canUndoHistoryEntry = useCallback(
    (entry: ActionHistoryEntry) =>
      selectCanUndoHistoryEntry(entry, actionHistory),
    [actionHistory],
  );

  const filteredActionHistory = useMemo(
    () => filterActionHistory(actionHistory, historyFilter),
    [actionHistory, historyFilter],
  );

  const selectedUndoableHistoryEntries = useMemo(
    () =>
      getSelectedUndoableEntries(
        filteredActionHistory,
        selectedHistoryIds,
        actionHistory,
      ),
    [actionHistory, filteredActionHistory, selectedHistoryIds],
  );

  const handleClearActionHistory = useCallback(async () => {
    try {
      const result = await clearActionHistory();

      if (result?.success) {
        setActionHistory([]);
        onStatusChange({
          tone: 'success',
          message: result.message,
        });
      } else {
        onStatusChange({
          tone: 'error',
          message: result?.message || 'Failed to clear action history.',
        });
      }
    } catch (error) {
      onStatusChange({
        tone: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Unexpected clear history failure.',
      });
    }
  }, [onStatusChange]);

  const handleUndoHistoryEntry = useCallback(
    async (entry: ActionHistoryEntry) => {
      if (!selectCanUndoHistoryEntry(entry, actionHistory)) {
        return;
      }

      setBusyHistoryId(entry.id);
      onStatusChange(null);

      try {
        const result = await restoreHistoryEntry(entry);

        if (result?.success) {
          onStatusChange({
            tone: 'success',
            message: result.destination
              ? `Restored file: ${result.destination}. Refresh scan when you want to reconcile results.`
              : `${result.message} Refresh scan when you want to reconcile results.`,
          });

          await refreshActionHistory();
        } else {
          console.error('Restore result:', result);
          onStatusChange({
            tone: 'error',
            message: result?.message
              ? `Restore failed: ${result.message}`
              : 'Restore failed with no detailed message.',
          });
        }
      } catch (error) {
        console.error('Undo exception:', error);
        onStatusChange({
          tone: 'error',
          message:
            error instanceof Error
              ? `Undo exception: ${error.message}`
              : 'Unexpected undo failure.',
        });
      } finally {
        setBusyHistoryId(null);
      }
    },
    [actionHistory, onStatusChange, refreshActionHistory],
  );

  const toggleSelectedHistoryId = useCallback((entryId: string) => {
    setSelectedHistoryIds((previous) =>
      toggleHistorySelection(previous, entryId),
    );
  }, []);

  const handleBulkRestoreSelected = useCallback(async () => {
    if (selectedUndoableHistoryEntries.length === 0 || isBulkRestoring) {
      return;
    }

    setIsBulkRestoring(true);
    onStatusChange(null);

    try {
      const result = await bulkRestoreHistoryEntries(
        selectedUndoableHistoryEntries,
      );

      if (result?.success || result?.partial_success) {
        await refreshActionHistory();
        setSelectedHistoryIds(new Set());

        onStatusChange({
          tone: result.failure_count === 0 ? 'success' : 'error',
          message:
            result.message ||
            `Restored ${result.success_count ?? 0} selected item(s).`,
        });
      } else {
        onStatusChange({
          tone: 'error',
          message: result?.message || 'Bulk restore failed.',
        });
      }
    } catch (error) {
      onStatusChange({
        tone: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Unexpected bulk restore failure.',
      });
    } finally {
      setIsBulkRestoring(false);
    }
  }, [
    isBulkRestoring,
    onStatusChange,
    refreshActionHistory,
    selectedUndoableHistoryEntries,
  ]);

  return {
    historyFilter,
    setHistoryFilter,
    filteredActionHistory,
    selectedHistoryIds,
    selectedUndoableHistoryEntries,
    busyHistoryId,
    isBulkRestoring,
    canUndoHistoryEntry,
    refreshActionHistory,
    handleClearActionHistory,
    handleUndoHistoryEntry,
    toggleSelectedHistoryId,
    handleBulkRestoreSelected,
  };
}
