/**
 * selectors.ts
 *
 * Pure state transitions and scan-result reconciliation for filesystem actions.
 *
 * Responsibilities:
 * - Track action-session progress without double counting
 * - Remove resolved paths from displayed scan queues
 * - Reconcile insight previews after a displayed action
 * - Preserve duplicate-primary and adjusted-total behavior
 *
 * This module DOES NOT:
 * - Execute Electron operations
 * - Manage React state
 * - Coordinate scanning or action history
 */

import type {
  ClassifiedFile,
  DuplicateGroup,
  DuplicateGroupItem,
  ScanInsightItem,
  ScanResult,
} from '../../types/dtm';
import type {
  AdjustedFilesystemTotals,
  FilesystemActionSessionAction,
  FilesystemActionSessionState,
} from './types';

export const initialFilesystemActionSessionState: FilesystemActionSessionState = {
  resolvedPaths: [],
  reviewResolved: 0,
  archiveResolved: 0,
  removeResolved: 0,
  duplicateGroupsResolved: 0,
  resolvedDuplicateGroupIds: [],
  filesArchived: 0,
  filesRemoved: 0,
  filesKept: 0,
  needsRescan: false,
};

export function filesystemActionSessionReducer(
  state: FilesystemActionSessionState,
  action: FilesystemActionSessionAction,
): FilesystemActionSessionState {
  if (action.type === 'RESET_AFTER_RESCAN') {
    return initialFilesystemActionSessionState;
  }

  if (action.type === 'FILE_ACTION_SUCCEEDED') {
    const alreadyResolved = state.resolvedPaths.includes(action.filePath);

    return {
      ...state,
      resolvedPaths: alreadyResolved
        ? state.resolvedPaths
        : [...state.resolvedPaths, action.filePath],
      reviewResolved:
        !alreadyResolved && action.sourceQueue === 'review'
          ? state.reviewResolved + 1
          : state.reviewResolved,
      archiveResolved:
        !alreadyResolved && action.sourceQueue === 'archive'
          ? state.archiveResolved + 1
          : state.archiveResolved,
      removeResolved:
        !alreadyResolved && action.sourceQueue === 'remove'
          ? state.removeResolved + 1
          : state.removeResolved,
      duplicateGroupsResolved:
        !alreadyResolved && action.sourceQueue === 'duplicate'
          ? state.duplicateGroupsResolved + 1
          : state.duplicateGroupsResolved,
      filesArchived:
        !alreadyResolved && action.fileAction === 'archive'
          ? state.filesArchived + 1
          : state.filesArchived,
      filesRemoved:
        !alreadyResolved && action.fileAction === 'remove'
          ? state.filesRemoved + 1
          : state.filesRemoved,
      filesKept:
        !alreadyResolved && action.fileAction === 'keep'
          ? state.filesKept + 1
          : state.filesKept,
      needsRescan: true,
    };
  }

  if (action.type === 'DUPLICATE_GROUP_RESOLVED') {
    const alreadyResolved = state.resolvedDuplicateGroupIds.includes(
      action.groupId,
    );

    return {
      ...state,
      resolvedDuplicateGroupIds: alreadyResolved
        ? state.resolvedDuplicateGroupIds
        : [...state.resolvedDuplicateGroupIds, action.groupId],
      needsRescan: true,
    };
  }

  return state;
}

export function removeResolvedFiles(
  items: ClassifiedFile[],
  resolvedPaths: string[],
) {
  const resolved = new Set(resolvedPaths);
  return items.filter((item) => !resolved.has(item.path));
}

function withoutPaths<T extends { path: string }>(items: T[], paths: Set<string>) {
  return items.filter((item) => !paths.has(item.path));
}

export function removePathsFromScanResult(
  scanData: ScanResult,
  paths: string[],
): ScanResult {
  const removedPaths = new Set(paths);
  const duplicates = scanData.duplicates
    .map((group) => ({
      ...group,
      items: withoutPaths(group.items, removedPaths),
    }))
    .filter((group) => group.items.length >= 2);

  return {
    ...scanData,
    review_files: withoutPaths(scanData.review_files, removedPaths),
    archive_candidates: withoutPaths(scanData.archive_candidates, removedPaths),
    remove_candidates: withoutPaths(scanData.remove_candidates, removedPaths),
    system_files: withoutPaths(scanData.system_files, removedPaths),
    duplicates,
    duplicates_total: duplicates.length,
    review_total: scanData.review_total,
    archive_total: scanData.archive_total,
    remove_total: scanData.remove_total,
  };
}

export function removeDuplicatePathsFromScanResult(
  scanData: ScanResult,
  paths: string[],
): ScanResult {
  const removedPaths = new Set(paths);
  const duplicates = scanData.duplicates
    .map((group) => ({
      ...group,
      items: withoutPaths(group.items, removedPaths),
    }))
    .filter((group) => group.items.length >= 2);

  return {
    ...scanData,
    duplicates,
    duplicates_total: duplicates.length,
  };
}

function decrementInsightEntries(
  entries: ScanInsightItem[] = [],
  label: string,
) {
  return entries
    .map((entry) =>
      entry.label === label
        ? { ...entry, count: Math.max(0, entry.count - 1) }
        : entry,
    )
    .filter((entry) => entry.count > 0);
}

export function reconcileScanInsightsAfterAction(
  scanData: ScanResult,
  file: ClassifiedFile,
  actionType: 'review' | 'archive' | 'remove',
): ScanResult {
  if (!scanData.scan_insights) return scanData;

  const contextType = file.context_type;
  const reason = file.reason;
  const patternPreviews = { ...(scanData.scan_insights.pattern_previews || {}) };

  const updatePatternPreview = (key: string) => {
    const preview = patternPreviews[key];
    if (!preview) return;

    patternPreviews[key] = {
      ...preview,
      review: {
        ...preview.review,
        total: Math.max(0, preview.review.total - 1),
        items: preview.review.items.filter((item) => item.path !== file.path),
      },
      archive: {
        ...preview.archive,
        total:
          actionType === 'archive'
            ? Math.max(0, preview.archive.total - 1)
            : preview.archive.total,
        items: preview.archive.items.filter((item) => item.path !== file.path),
      },
      remove: {
        ...preview.remove,
        total:
          actionType === 'remove'
            ? Math.max(0, preview.remove.total - 1)
            : preview.remove.total,
        items: preview.remove.items.filter((item) => item.path !== file.path),
      },
    };
  };

  if (contextType) updatePatternPreview(`context_type:${contextType}`);
  if (reason) updatePatternPreview(`reason:${reason}`);

  return {
    ...scanData,
    scan_insights: {
      ...scanData.scan_insights,
      review_context_summary: contextType
        ? decrementInsightEntries(
            scanData.scan_insights.review_context_summary,
            contextType,
          )
        : scanData.scan_insights.review_context_summary,
      top_review_reasons: reason
        ? decrementInsightEntries(
            scanData.scan_insights.top_review_reasons,
            reason,
          )
        : scanData.scan_insights.top_review_reasons,
      pattern_previews: patternPreviews,
    },
  };
}

export function isLikelyPrimaryDuplicateItem(
  item: DuplicateGroupItem,
  itemIndex: number,
) {
  return (
    itemIndex === 0 &&
    !item.name.toLowerCase().includes('copy') &&
    !item.name.match(/\(\d+\)/)
  );
}

export function getSelectedDuplicatePrimaryPath(
  group: DuplicateGroup,
  manualSelection?: string,
) {
  if (
    manualSelection &&
    group.items.some((item) => item.path === manualSelection)
  ) {
    return manualSelection;
  }

  const likelyPrimary = group.items.find((item, index) =>
    isLikelyPrimaryDuplicateItem(item, index),
  );

  return likelyPrimary?.path || group.items[0]?.path || '';
}

export function getAdjustedFilesystemTotals(
  scanData: ScanResult | null,
  sessionState: FilesystemActionSessionState,
): AdjustedFilesystemTotals {
  if (!scanData) {
    return {
      totalFiles: 0,
      review: 0,
      archive: 0,
      remove: 0,
      duplicateGroups: 0,
      sessionActions: 0,
    };
  }

  const sessionActions =
    sessionState.filesArchived +
    sessionState.filesRemoved +
    sessionState.filesKept;

  return {
    totalFiles: Math.max(
      0,
      scanData.total_files -
        sessionState.filesArchived -
        sessionState.filesRemoved,
    ),
    review: Math.max(0, scanData.review_total - sessionState.reviewResolved),
    archive: Math.max(
      0,
      scanData.archive_total - sessionState.archiveResolved,
    ),
    remove: Math.max(0, scanData.remove_total - sessionState.removeResolved),
    duplicateGroups: Math.max(
      0,
      scanData.duplicates_total -
        sessionState.resolvedDuplicateGroupIds.length,
    ),
    sessionActions,
  };
}
