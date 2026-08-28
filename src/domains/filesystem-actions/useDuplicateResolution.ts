/**
 * useDuplicateResolution.ts
 *
 * State and commands for resolving filesystem duplicate groups.
 *
 * Responsibilities:
 * - Track and prune selected primary files
 * - Execute single-copy and group archive commands
 * - Reconcile duplicate groups and filesystem session progress
 *
 * This module DOES NOT:
 * - Own general queue or bulk actions
 * - Own scanning or action history
 * - Change duplicate detection or identity semantics
 */

import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

import type { DuplicateGroup, ScanResult } from '../../types/dtm';
import {
  getSelectedDuplicatePrimaryPath as selectDuplicatePrimaryPath,
  removeDuplicatePathsFromScanResult,
} from './selectors';
import type {
  ActionStatus,
  FilesystemActionType,
  SessionFileAction,
  SourceQueue,
} from './types';

type QueueActionResult = {
  success: boolean;
  message: string;
};

type UseDuplicateResolutionOptions = {
  scanData: ScanResult | null;
  setScanData: Dispatch<SetStateAction<ScanResult | null>>;
  isBulkActing: boolean;
  isScanInProgress: () => boolean;
  performQueueAction: (
    actionType: FilesystemActionType,
    filePath: string,
    mode?: 'single' | 'bulk',
  ) => Promise<QueueActionResult>;
  withBusyPath: (filePath: string, command: () => Promise<void>) => Promise<void>;
  recordSuccessfulAction: (
    sourceQueue: SourceQueue,
    fileAction: SessionFileAction,
    filePath: string,
  ) => void;
  recordDuplicateGroupResolved: (groupId: string) => void;
  refreshActionHistory: () => Promise<void>;
  onStatusChange: (status: ActionStatus | null) => void;
};

export function useDuplicateResolution({
  scanData,
  setScanData,
  isBulkActing,
  isScanInProgress,
  performQueueAction,
  withBusyPath,
  recordSuccessfulAction,
  recordDuplicateGroupResolved,
  refreshActionHistory,
  onStatusChange,
}: UseDuplicateResolutionOptions) {
  const [duplicatePrimarySelections, setDuplicatePrimarySelections] = useState<
    Record<string, string>
  >({});
  const [busyDuplicateGroupId, setBusyDuplicateGroupId] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (!scanData) {
      setDuplicatePrimarySelections({});
      return;
    }

    setDuplicatePrimarySelections((previous) => {
      const next: Record<string, string> = {};

      for (const group of scanData.duplicates) {
        const selection = previous[group.group_id];
        if (selection && group.items.some((item) => item.path === selection)) {
          next[group.group_id] = selection;
        }
      }

      return next;
    });
  }, [scanData]);

  const getSelectedDuplicatePrimaryPath = useCallback(
    (group: DuplicateGroup) =>
      selectDuplicatePrimaryPath(
        group,
        duplicatePrimarySelections[group.group_id],
      ),
    [duplicatePrimarySelections],
  );

  const setDuplicatePrimarySelection = useCallback(
    (groupId: string, filePath: string) => {
      setDuplicatePrimarySelections((previous) => ({
        ...previous,
        [groupId]: filePath,
      }));
    },
    [],
  );

  const removeDuplicatePaths = useCallback(
    (paths: string[]) => {
      setScanData((previous) =>
        previous
          ? removeDuplicatePathsFromScanResult(previous, paths)
          : previous,
      );
    },
    [setScanData],
  );

  const handleArchiveDuplicate = useCallback(
    async (duplicatePath: string) => {
      if (busyDuplicateGroupId || isBulkActing || isScanInProgress()) return;

      await withBusyPath(duplicatePath, async () => {
        onStatusChange(null);

        try {
          const result = await performQueueAction(
            'archive',
            duplicatePath,
            'single',
          );

          if (result.success) {
            removeDuplicatePaths([duplicatePath]);
            await refreshActionHistory();
            onStatusChange({
              tone: 'success',
              message: `${result.message} Refresh scan when you want to reconcile duplicate groups.`,
            });
            recordSuccessfulAction(
              'duplicate',
              'archive',
              duplicatePath,
            );
          } else {
            onStatusChange({ tone: 'error', message: result.message });
          }
        } catch (error) {
          onStatusChange({
            tone: 'error',
            message:
              error instanceof Error
                ? error.message
                : 'Unexpected duplicate archive failure.',
          });
        }
      });
    },
    [
      busyDuplicateGroupId,
      isBulkActing,
      isScanInProgress,
      onStatusChange,
      performQueueAction,
      recordSuccessfulAction,
      refreshActionHistory,
      removeDuplicatePaths,
      withBusyPath,
    ],
  );

  const handleArchiveDuplicateGroup = useCallback(
    async (group: DuplicateGroup) => {
      if (isBulkActing || isScanInProgress() || busyDuplicateGroupId) return;

      const keepPath = getSelectedDuplicatePrimaryPath(group);
      const itemsToArchive = group.items.filter(
        (item) => item.path !== keepPath,
      );
      if (!keepPath || itemsToArchive.length === 0) return;

      setBusyDuplicateGroupId(group.group_id);
      onStatusChange(null);

      let successCount = 0;
      let failureCount = 0;
      const archivedPaths: string[] = [];

      for (const item of itemsToArchive) {
        try {
          const result = await performQueueAction(
            'archive',
            item.path,
            'single',
          );

          if (result.success) {
            successCount += 1;
            archivedPaths.push(item.path);
            recordSuccessfulAction('duplicate', 'archive', item.path);
          } else {
            failureCount += 1;
          }
        } catch {
          failureCount += 1;
        }
      }

      if (archivedPaths.length > 0) {
        removeDuplicatePaths(archivedPaths);
        recordDuplicateGroupResolved(group.group_id);
        await refreshActionHistory();
      }

      if (failureCount === 0) {
        onStatusChange({
          tone: 'success',
          message: `Archived ${successCount} duplicate copie${successCount === 1 ? 'y' : 's'} while keeping the selected primary file.`,
        });
      } else {
        onStatusChange({
          tone: 'error',
          message: `Duplicate group resolution finished with partial success: ${successCount} archived, ${failureCount} failed.`,
        });
      }

      setBusyDuplicateGroupId(null);
    },
    [
      busyDuplicateGroupId,
      getSelectedDuplicatePrimaryPath,
      isBulkActing,
      isScanInProgress,
      onStatusChange,
      performQueueAction,
      recordDuplicateGroupResolved,
      recordSuccessfulAction,
      refreshActionHistory,
      removeDuplicatePaths,
    ],
  );

  return {
    busyDuplicateGroupId,
    getSelectedDuplicatePrimaryPath,
    setDuplicatePrimarySelection,
    handleArchiveDuplicate,
    handleArchiveDuplicateGroup,
  };
}
