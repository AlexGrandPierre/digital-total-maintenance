/**
 * useFilesystemActionSession.ts
 *
 * State and commands for ordinary frontend filesystem queue actions.
 *
 * Responsibilities:
 * - Track session progress, busy state, and bulk progress
 * - Execute single, keep-in-place, and bulk queue actions
 * - Reconcile displayed queues and insights after actions
 * - Refresh action history through an explicit cross-domain callback
 *
 * This module DOES NOT:
 * - Own scanning or action history
 * - Resolve duplicate groups
 * - Render queue or batch-preview UI
 */

import {
  useCallback,
  useMemo,
  useReducer,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

import {
  runBulkFilesystemAction,
  runFilesystemAction,
} from '../../services/ipc';
import type { ClassifiedFile, ScanResult } from '../../types/dtm';
import {
  filesystemActionSessionReducer,
  getAdjustedFilesystemTotals,
  initialFilesystemActionSessionState,
  reconcileScanInsightsAfterAction,
  removePathsFromScanResult,
} from './selectors';
import type {
  ActionStatus,
  FilesystemActionMode,
  FilesystemActionType,
  SessionFileAction,
  SourceQueue,
} from './types';

type UseFilesystemActionSessionOptions = {
  scanData: ScanResult | null;
  setScanData: Dispatch<SetStateAction<ScanResult | null>>;
  isScanInProgress: () => boolean;
  refreshActionHistory: () => Promise<void>;
  onStatusChange: (status: ActionStatus | null) => void;
};

type QueueActionResult = {
  success: boolean;
  message: string;
};

function getSuccessMessage(
  actionType: FilesystemActionType,
  result: { destination?: string; message?: string },
) {
  if (result.destination) {
    if (actionType === 'review') {
      return `Moved to DTM Review: ${result.destination}`;
    }

    if (actionType === 'archive') {
      return `Moved to DTM Archive: ${result.destination}`;
    }

    return `Moved to Trash: ${result.destination}`;
  }

  return result.message || 'Action completed successfully.';
}

function getFailureMessage(actionType: FilesystemActionType) {
  if (actionType === 'review') return 'Failed to move file to DTM Review.';
  if (actionType === 'archive') return 'Failed to move file to DTM Archive.';
  return 'Failed to move file to Trash.';
}

export function useFilesystemActionSession({
  scanData,
  setScanData,
  isScanInProgress,
  refreshActionHistory,
  onStatusChange,
}: UseFilesystemActionSessionOptions) {
  const [sessionState, dispatchSession] = useReducer(
    filesystemActionSessionReducer,
    initialFilesystemActionSessionState,
  );
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [isBulkActing, setIsBulkActing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{
    action: FilesystemActionType;
    current: number;
    total: number;
    currentFileName: string;
  } | null>(null);

  const removePathsFromQueues = useCallback(
    (paths: string[]) => {
      setScanData((previous) =>
        previous ? removePathsFromScanResult(previous, paths) : previous,
      );
    },
    [setScanData],
  );

  const recordSuccessfulAction = useCallback(
    (
      sourceQueue: SourceQueue,
      fileAction: SessionFileAction,
      filePath: string,
    ) => {
      dispatchSession({
        type: 'FILE_ACTION_SUCCEEDED',
        sourceQueue,
        fileAction,
        filePath,
      });
    },
    [],
  );

  const performQueueAction = useCallback(
    async (
      actionType: FilesystemActionType,
      filePath: string,
      mode: FilesystemActionMode = 'single',
    ): Promise<QueueActionResult> => {
      const result = await runFilesystemAction(actionType, filePath, mode);

      if (result?.success) {
        removePathsFromQueues([filePath]);
        await refreshActionHistory();

        return {
          success: true,
          message: getSuccessMessage(actionType, result),
        };
      }

      return {
        success: false,
        message: result?.message || getFailureMessage(actionType),
      };
    },
    [refreshActionHistory, removePathsFromQueues],
  );

  const withBusyPath = useCallback(
    async (filePath: string, command: () => Promise<void>) => {
      setBusyPath(filePath);
      try {
        await command();
      } finally {
        setBusyPath(null);
      }
    },
    [],
  );

  const handleMove = useCallback(
    async (actionType: 'archive' | 'remove', filePath: string) => {
      if (isBulkActing) return;

      await withBusyPath(filePath, async () => {
        onStatusChange(null);

        try {
          const result = await performQueueAction(actionType, filePath);
          onStatusChange({
            tone: result.success ? 'success' : 'error',
            message: result.message,
          });
        } catch (error) {
          onStatusChange({
            tone: 'error',
            message:
              error instanceof Error
                ? error.message
                : `Unexpected ${actionType} action failure.`,
          });
        }
      });
    },
    [isBulkActing, onStatusChange, performQueueAction, withBusyPath],
  );

  const handleKeepFile = useCallback(
    async (filePath: string) => {
      removePathsFromQueues([filePath]);
      onStatusChange({
        tone: 'success',
        message:
          'Kept file in place. Refresh scan when you want to reconcile results.',
      });
    },
    [onStatusChange, removePathsFromQueues],
  );

  const handleQueueFileAction = useCallback(
    async (
      file: ClassifiedFile,
      sourceQueue: Exclude<SourceQueue, 'duplicate'>,
      fileAction: SessionFileAction,
    ) => {
      if (fileAction === 'archive') {
        await handleMove('archive', file.path);
      } else if (fileAction === 'remove') {
        await handleMove('remove', file.path);
      } else {
        await handleKeepFile(file.path);
      }

      // Preserve the current UI contract: cards record and reconcile after the
      // command returns, including when the command reports a handled failure.
      recordSuccessfulAction(sourceQueue, fileAction, file.path);
      setScanData((previous) =>
        previous
          ? reconcileScanInsightsAfterAction(
              previous,
              file,
              fileAction === 'keep' ? 'review' : fileAction,
            )
          : previous,
      );
    },
    [handleKeepFile, handleMove, recordSuccessfulAction, setScanData],
  );

  const handleBulkQueueAction = useCallback(
    async (
      sourceQueue: SourceQueue,
      actionType: FilesystemActionType,
      files: ClassifiedFile[],
    ) => {
      if (isBulkActing || isScanInProgress() || files.length === 0) return;

      setIsBulkActing(true);
      setBusyPath(null);
      onStatusChange(null);

      try {
        setBulkProgress({
          action: actionType,
          current: 1,
          total: files.length,
          currentFileName: `Processing ${files.length} files...`,
        });

        const result = await runBulkFilesystemAction(
          actionType,
          files.map((file) => file.path),
        );
        const successCount = result?.success_count ?? 0;
        const failureCount = result?.failure_count ?? files.length;

        if (Array.isArray(result?.results)) {
          for (const item of result.results) {
            if (!item.success) continue;

            removePathsFromQueues([item.source_path]);
            recordSuccessfulAction(
              sourceQueue,
              actionType === 'archive'
                ? 'archive'
                : actionType === 'remove'
                  ? 'remove'
                  : 'keep',
              item.source_path,
            );
          }
        }

        await refreshActionHistory();

        const actionLabel =
          actionType === 'review'
            ? 'sent to review'
            : actionType === 'archive'
              ? 'archived'
              : 'moved to Trash';

        onStatusChange({
          tone: failureCount === 0 ? 'success' : 'error',
          message:
            failureCount === 0
              ? `Action complete: ${successCount} visible file${successCount === 1 ? '' : 's'} ${actionLabel}. Refresh when ready to reconcile.`
              : `Bulk action finished with partial success: ${successCount} succeeded, ${failureCount} failed.`,
        });
      } catch (error) {
        onStatusChange({
          tone: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Unexpected bulk action failure.',
        });
      } finally {
        setBulkProgress(null);
        setIsBulkActing(false);
      }
    },
    [
      isBulkActing,
      isScanInProgress,
      onStatusChange,
      recordSuccessfulAction,
      refreshActionHistory,
      removePathsFromQueues,
    ],
  );

  const resetSessionAfterRescan = useCallback(() => {
    dispatchSession({ type: 'RESET_AFTER_RESCAN' });
  }, []);

  const recordDuplicateGroupResolved = useCallback((groupId: string) => {
    dispatchSession({ type: 'DUPLICATE_GROUP_RESOLVED', groupId });
  }, []);

  const adjustedTotals = useMemo(
    () => getAdjustedFilesystemTotals(scanData, sessionState),
    [scanData, sessionState],
  );

  return {
    sessionState,
    adjustedTotals,
    busyPath,
    isBulkActing,
    bulkProgress,
    performQueueAction,
    withBusyPath,
    recordSuccessfulAction,
    recordDuplicateGroupResolved,
    handleQueueFileAction,
    handleBulkQueueAction,
    resetSessionAfterRescan,
  };
}
