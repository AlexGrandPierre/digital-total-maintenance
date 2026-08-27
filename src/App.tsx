/**
 * App.tsx
 *
 * Primary application coordinator for Digital Total Maintenance.
 *
 * Responsibilities:
 * - Coordinate local filesystem and CSV review workflows
 * - Manage application-level workspace state
 * - Coordinate Electron actions and persistence
 * - Compose DTM's primary user interfaces
 *
 * This module currently contains both orchestration and workspace rendering.
 * Those responsibilities are being progressively extracted into focused
 * components and hooks while preserving existing behavior.
 *
 * Used by:
 * React application entry point.
 */


import { useEffect, useMemo, useReducer, useRef, useState } from 'react';

import Header from './components/Header';
import ScanButton from './components/ScanButton';
import QueueFileCard from './components/QueueFileCard';
import FileBadge from './components/FileBadge';

import SectionCard from './components/SectionCard';
import KeyValueList from './components/KeyValueList';
import InsightList, {
  type InsightActionType,
  type QueueFilter,
} from './components/InsightList';
import ModePill from './components/ModePill';
import ReviewCapacityControl, {
  type ReviewCapacity,
} from './components/ReviewCapacityControl';
import QueueSortControls from './components/QueueSortControls';
import SupportDrawer from './components/SupportDrawer';

import { useCsvReviewIndex } from './hooks/useCsvReviewIndex';
import { useActionHistory } from './domains/history/useActionHistory';
import { useCsvReviewSession } from './domains/csv-review/useCsvReviewSession';
import { useScanSession } from './domains/scanning/useScanSession';
import type { ScanCompletion } from './domains/scanning/types';

import type {
  SortKey,
  SortDirection,
  ClassifiedFile,
  DuplicateGroup,
  DuplicateGroupItem,
  ScanResult,
  CsvScanResult,
} from './types/dtm';

type BatchPreview = {
  filter: Exclude<QueueFilter, null>;
  action: 'archive' | 'remove' | 'keep';
  items: ClassifiedFile[];
  total: number;
} | null;

type SourceQueue = 'review' | 'archive' | 'remove' | 'duplicate';

type SessionFileAction = 'keep' | 'archive' | 'remove';

type InsightSectionKind = 'context_type' | 'reason';

type SessionState = {
  resolvedPaths: string[];
  reviewResolved: number;
  archiveResolved: number;
  removeResolved: number;
  duplicateGroupsResolved: number;
  resolvedDuplicateGroupIds: string[];
  filesArchived: number;
  filesRemoved: number;
  filesKept: number;
  needsRescan: boolean;
};

type SessionAction =
  | {
      type: 'FILE_ACTION_SUCCEEDED';
      sourceQueue: SourceQueue;
      fileAction: SessionFileAction;
      filePath: string;
    }
  | {
      type: 'DUPLICATE_GROUP_RESOLVED';
      groupId: string;
    }
  | {
      type: 'RESET_AFTER_RESCAN';
    };

const initialSessionState: SessionState = {
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

function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  if (action.type === 'RESET_AFTER_RESCAN') {
    return initialSessionState;
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
    const alreadyResolved = state.resolvedDuplicateGroupIds.includes(action.groupId);
  
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

const confidenceRank: Record<'high' | 'medium' | 'low', number> = {
  low: 0,
  medium: 1,
  high: 2,
};

const reviewPriorityRank: Record<'high' | 'medium' | 'low', number> = {
  low: 0,
  medium: 1,
  high: 2,
}

function compareValues(
  a: ClassifiedFile,
  b: ClassifiedFile,
  key: SortKey,
  direction: SortDirection
) {
  let result = 0;

  if (key === 'confidence') {
    result = confidenceRank[a.confidence] - confidenceRank[b.confidence];
  } else if (key === 'review_priority') {
    const aPriority = a.review_priority ? reviewPriorityRank[a.review_priority] : -1;
    const bPriority = b.review_priority ? reviewPriorityRank[b.review_priority] : -1;
    result = aPriority - bPriority;
  } else if (key === 'name') {
    result = a.name.localeCompare(b.name);
  } else if (key === 'age_days') {
    result = a.age_days - b.age_days;
  } else if (key === 'size') {
    result = a.size - b.size;
  }

  return direction === 'asc' ? result : -result;
}

function sortQueue(
  items: ClassifiedFile[],
  key: SortKey,
  direction: SortDirection
) {
  return [...items].sort((a, b) => compareValues(a, b, key, direction));
}

function applyQueueFilter(items: ClassifiedFile[], filter: QueueFilter) {
  if (!filter) return items;

  return items.filter((item) => {
    const itemValue = item[filter.key];

    if (typeof itemValue !== 'string') return false;

    return itemValue === filter.value;
  });
}

function getActionForInsightLabel(label: string): InsightActionType | null {
  const normalized = label.toLowerCase();

  if (
    normalized.includes('archive') ||
    normalized.includes('compressed') ||
    normalized.includes('export') ||
    normalized.includes('installer')
  ) {
    return 'archive';
  }

  if (
    normalized.includes('temporary') ||
    normalized.includes('temp') ||
    normalized.includes('log') ||
    normalized.includes('generated')
  ) {
    return 'remove';
  }

  return null;
}

function removeResolvedFiles(items: ClassifiedFile[], resolvedPaths: string[]) {
  const resolved = new Set(resolvedPaths);
  return items.filter((item) => !resolved.has(item.path));
}

function getConfidenceBreakdown(items: ClassifiedFile[]) {
  const counts = {
    high: 0,
    medium: 0,
    low: 0,
  };

  for (const item of items) {
    const c = item.action_confidence || 'low';
    if (counts[c as keyof typeof counts] !== undefined) {
      counts[c as keyof typeof counts]++;
    }
  }

  return counts;
}

function getRiskSummary(items: ClassifiedFile[]) {
  const riskMap: Record<string, number> = {};

  for (const item of items) {
    if (!item.risk_flags) continue;

    for (const flag of item.risk_flags) {
      riskMap[flag] = (riskMap[flag] || 0) + 1;
    }
  }

  return Object.entries(riskMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3); // top 3 risks
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes}m ${remainingSeconds}s`;
}

function App() {
  const [scanData, setScanData] = useState<ScanResult | null>(null);
  const [showSystemFiles, setShowSystemFiles] = useState(false);
  const [actionStatus, setActionStatus] = useState<{
    tone: 'success' | 'error';
    message: string;
  } | null>(null);

  const {
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
  } = useActionHistory({ onStatusChange: setActionStatus });

  const [busyPath, setBusyPath] = useState<string | null>(null);

  const [isBulkActing, setIsBulkActing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{
    action: 'review' | 'archive' | 'remove';
    current: number;
    total: number;
    currentFileName: string;
  } | null>(null);

  const [reviewSortKey, setReviewSortKey] = useState<SortKey>('review_priority');
  const [reviewSortDirection, setReviewSortDirection] = useState<SortDirection>('desc');

  const [archiveSortKey, setArchiveSortKey] = useState<SortKey>('age_days');
  const [archiveSortDirection, setArchiveSortDirection] = useState<SortDirection>('desc');

  const [removeSortKey, setRemoveSortKey] = useState<SortKey>('age_days');
  const [removeSortDirection, setRemoveSortDirection] = useState<SortDirection>('desc');

  const [reviewVisibleCount, setReviewVisibleCount] = useState(8);
  const [archiveVisibleCount, setArchiveVisibleCount] = useState(8);
  const [removeVisibleCount, setRemoveVisibleCount] = useState(8);

  const [duplicateVisibleCount, setDuplicateVisibleCount] = useState(8);

  const [duplicatePrimarySelections, setDuplicatePrimarySelections] = useState<Record<string, string>>({});
  const [busyDuplicateGroupId, setBusyDuplicateGroupId] = useState<string | null>(null);

  const [isSupportOpen, setIsSupportOpen] = useState(false);

  const [activeQueueFilter, setActiveQueueFilter] = useState<QueueFilter>(null);

  const [csvData, setCsvData] = useState<CsvScanResult | null>(null);

  const [showDuplicateBulkMenu, setShowDuplicateBulkMenu] = useState(false);

  const [showSuspiciousBulkMenu, setShowSuspiciousBulkMenu] = useState(false);

  const [reviewQueueFilter, setReviewQueueFilter] = useState<
    'all' | 'high' | 'medium' | 'low'
  >('all');

  const [decisionFilter, setDecisionFilter] = useState<
    | 'all'
    | 'pending'
    | 'approved_duplicate'
    | 'legitimate_records'
    | 'needs_review'
    | 'ignored'
  >('pending');

  const [suspiciousDecisionFilter, setSuspiciousDecisionFilter] = useState<
    'all' | 'pending' | 'valid_data' | 'corrupted' | 'needs_review' | 'ignored'
  >('pending');

  const [suspiciousSeverityFilter, setSuspiciousSeverityFilter] = useState<
    'all' | 'critical' | 'high' | 'medium' | 'low'
  >('all');

  const [batchPreview, setBatchPreview] = useState<{
    filter: Exclude<QueueFilter, null>;
    action: 'archive' | 'remove' | 'keep';
    items: ClassifiedFile[];
    total: number;
  } | null>(null);

  const [sessionState, dispatchSession] = useReducer(
    sessionReducer,
    initialSessionState
  );

  const [selectedBatchPaths, setSelectedBatchPaths] = useState<Set<string>>(new Set());

  const [duplicateReviewCapacity, setDuplicateReviewCapacity] =
  useState<ReviewCapacity>(25);

  const [suspiciousReviewCapacity, setSuspiciousReviewCapacity] =
    useState<ReviewCapacity>(25);


    const {
      loadedDuplicateGroups,
      loadedSuspiciousExamples,
      duplicateIndexTotal,
      suspiciousIndexTotal,
      duplicateHasMore,
      suspiciousHasMore,
      isLoadingDuplicatePage,
      isLoadingSuspiciousPage,
      initializeFromScan,
      loadNextDuplicateBatch,
      loadNextSuspiciousBatch,
      resetDuplicateReviewIndex,
      resetSuspiciousReviewIndex,
    } = useCsvReviewIndex();

  const {
    datasetDecisions,
    suspiciousDecisions,
    csvReviewSession,
    busyDatasetDecisionId,
    busySuspiciousDecisionId,
    datasetDecisionSummary,
    suspiciousReviewedCount,
    suspiciousPendingCount,
    suspiciousCompletionPercentage,
    getSuspiciousIssueId,
    loadLegacyDatasetDecisions,
    loadCsvReviewSession,
    handleSaveDatasetDecision,
    handleBulkDatasetDecision,
    handleSaveSuspiciousDecision,
    handleBulkSuspiciousDecision,
    handleResetDatasetDecisions,
  } = useCsvReviewSession({
    csvPath: csvData?.path,
    csvReady: csvData?.success === true,
    duplicateIndexTotal,
    suspiciousIndexTotal,
    onStatusChange: setActionStatus,
  });

  const handleScanCompleted = (completion: ScanCompletion) => {
    setReviewVisibleCount(8);
    setArchiveVisibleCount(8);
    setRemoveVisibleCount(8);
    setDuplicateVisibleCount(8);

    refreshActionHistory();
    dispatchSession({ type: 'RESET_AFTER_RESCAN' });

    try {
      if (completion.kind === 'csv') {
        setCsvData(completion.result);
        setScanData(null);
        initializeFromScan(completion.result);
        loadCsvReviewSession(completion.result.path);
        return;
      }

      if (completion.kind === 'filesystem') {
        setScanData(completion.result);
        setCsvData(null);
        loadLegacyDatasetDecisions();
        return;
      }

      setScanData(null);
      setCsvData(null);
    } catch {
      setScanData(null);
      setCsvData(null);
    }
  };

  const {
    isScanning,
    scanPreset,
    setScanPreset,
    customPath,
    setCustomPath,
    csvPath,
    setCsvPath,
    scanProgress,
    scanTargetLabel,
    handleBrowseForFolder,
    handleBrowseForCsv,
    handleScan,
    triggerRescan,
  } = useScanSession({
    isBulkActing,
    onStatusChange: setActionStatus,
    onScanStarted: () => {
      setScanData(null);
      setCsvData(null);
    },
    onScanCompleted: handleScanCompleted,
  });

  const [duplicatePriorityFilter, setDuplicatePriorityFilter] = useState<
    'all' | 'critical' | 'high' | 'medium' | 'low'
  >('all');

  const openBatchPreview = (preview: Exclude<BatchPreview, null>) => {
    setBatchPreview(preview);
    setSelectedBatchPaths(new Set(preview.items.map((item) => item.path)));
  };

  const getFilterMatchedPaths = (filter: Exclude<QueueFilter, null>) => {
    const matches = [
      ...applyQueueFilter(sortedReviewFiles, filter),
      ...applyQueueFilter(sortedArchiveCandidates, filter),
      ...applyQueueFilter(sortedRemoveCandidates, filter),
    ];
  
    return matches
      .map((file) => file.path)
      .sort()
      .join('|');
  };

  const duplicateActionMenuRef = useRef<HTMLDivElement | null>(null);
  const suspiciousActionMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
  
      if (
        duplicateActionMenuRef.current &&
        !duplicateActionMenuRef.current.contains(target)
      ) {
        setShowDuplicateExportMenu(false);
        setShowDuplicateBulkMenu(false);
      }
  
      if (
        suspiciousActionMenuRef.current &&
        !suspiciousActionMenuRef.current.contains(target)
      ) {
        setShowSuspiciousExportMenu(false);
        setShowSuspiciousBulkMenu(false);
      }
    };
  
    document.addEventListener('mousedown', handleClickOutside);
  
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!scanData) {
      setDuplicatePrimarySelections({});
      return;
    }

    setDuplicatePrimarySelections((prev) => {
      const next: Record<string, string> = {};

      for (const group of scanData.duplicates) {
        const existingSelection = prev[group.group_id];
        if (existingSelection && group.items.some((item) => item.path === existingSelection)) {
          next[group.group_id] = existingSelection;
        }
      }

      return next;
    });
  }, [scanData]);

  const sortedReviewFiles = useMemo(() => {
    if (!scanData) return [];
    return sortQueue(
      removeResolvedFiles(scanData.review_files, sessionState.resolvedPaths),
      reviewSortKey,
      reviewSortDirection
    );
  }, [scanData, reviewSortKey, reviewSortDirection, sessionState.resolvedPaths]);
  
  const sortedArchiveCandidates = useMemo(() => {
    if (!scanData) return [];
    return sortQueue(
      removeResolvedFiles(scanData.archive_candidates, sessionState.resolvedPaths),
      archiveSortKey,
      archiveSortDirection
    );
  }, [scanData, archiveSortKey, archiveSortDirection, sessionState.resolvedPaths]);
  
  const sortedRemoveCandidates = useMemo(() => {
    if (!scanData) return [];
    return sortQueue(
      removeResolvedFiles(scanData.remove_candidates, sessionState.resolvedPaths),
      removeSortKey,
      removeSortDirection
    );
  }, [scanData, removeSortKey, removeSortDirection, sessionState.resolvedPaths]);

  const decisionReasonSignatures = useMemo(() => {
    if (!scanData?.scan_insights) return new Set<string>();
  
    const signatures = new Set<string>();
  
    for (const entry of scanData.scan_insights.top_review_reasons) {
      const filter: Exclude<QueueFilter, null> = {
        label: entry.label,
        key: 'reason',
        value: entry.label,
      };
  
      const signature = getFilterMatchedPaths(filter);
      if (signature) signatures.add(signature);
    }
  
    return signatures;
  }, [scanData, sortedReviewFiles, sortedArchiveCandidates, sortedRemoveCandidates]);

  const buildInsightPreview = (
    sectionKind: InsightSectionKind,
    entry: { label: string; count: number },
    action: InsightActionType
  ): Exclude<BatchPreview, null> => {
    const filter: Exclude<QueueFilter, null> = {
      label: entry.label,
      key: sectionKind,
      value: entry.label,
    };
  
    const reviewMatches = applyQueueFilter(sortedReviewFiles, filter);
    const archiveMatches = applyQueueFilter(sortedArchiveCandidates, filter);
    const removeMatches = applyQueueFilter(sortedRemoveCandidates, filter);
  
    let items: ClassifiedFile[] = [];
  
    if (action === 'archive') {
      items = [...reviewMatches, ...archiveMatches];
    }
  
    if (action === 'remove') {
      items = [...reviewMatches, ...removeMatches];
    }
  
    return {
      filter,
      action,
      items: items.slice(0, 25), // bounded preview
      total: items.length,
    };
  };

  const handleInsightPreview = (
    sectionKind: InsightSectionKind,
    entry: { label: string; count: number },
    action: InsightActionType
  ) => {
    const preview = buildInsightPreview(sectionKind, entry, action);
    openBatchPreview(preview);
  };

  const visibleDuplicates = useMemo(() => {
    if (!scanData) return [];
    return scanData.duplicates.slice(0, duplicateVisibleCount);
  }, [scanData, duplicateVisibleCount]);

  const dedupedReviewContexts = useMemo(() => {
    if (!scanData?.scan_insights) return [];
  
    const seen = new Set<string>();
  
    return scanData.scan_insights.review_context_summary.filter((entry) => {
      const filter: Exclude<QueueFilter, null> = {
        label: entry.label,
        key: 'context_type',
        value: entry.label,
      };
  
      const signature = getFilterMatchedPaths(filter);
  
      if (!signature) return false;
      if (decisionReasonSignatures.has(signature)) return false;
      if (seen.has(signature)) return false;
  
      seen.add(signature);
      return true;
    });
  }, [
    scanData,
    sortedReviewFiles,
    sortedArchiveCandidates,
    sortedRemoveCandidates,
    decisionReasonSignatures,
  ]);
  
  const dedupedDecisionReasons = useMemo(() => {
    if (!scanData?.scan_insights) return [];
  
    const seen = new Set<string>();
  
    return scanData.scan_insights.top_review_reasons.filter((entry) => {
      const filter: Exclude<QueueFilter, null> = {
        label: entry.label,
        key: 'reason',
        value: entry.label,
      };
  
      const signature = getFilterMatchedPaths(filter);
  
      if (!signature || seen.has(signature)) return false;
  
      seen.add(signature);
      return true;
    });
  }, [scanData, sortedReviewFiles, sortedArchiveCandidates, sortedRemoveCandidates]);

  const removePathFromQueues = (
    filePath: string,
  ) => {
    setScanData((prev) => {
      if (!prev) return prev;

      const updatedGroups = prev.duplicates
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => item.path !== filePath),
        }))
        .filter((group) => group.items.length >= 2);

      const next = {
        ...prev,
        review_files: prev.review_files.filter((f) => f.path !== filePath),
        archive_candidates: prev.archive_candidates.filter((f) => f.path !== filePath),
        remove_candidates: prev.remove_candidates.filter((f) => f.path !== filePath),
        system_files: prev.system_files.filter((f) => f.path !== filePath),
        duplicates: updatedGroups,
        duplicates_total: updatedGroups.length,
        review_total: prev.review_total,
        archive_total: prev.archive_total,
        remove_total: prev.remove_total,
      };

      return next;
    });
  };

  const removeDuplicateFromQueue = (duplicatePath: string) => {
    setScanData((prev) => {
      if (!prev) return prev;

      const updatedGroups = prev.duplicates
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => item.path !== duplicatePath),
        }))
        .filter((group) => group.items.length >= 2);

      return {
        ...prev,
        duplicates: updatedGroups,
        duplicates_total: updatedGroups.length,
      };
    });
  };

  const decrementInsightEntries = (
    entries: Array<{ label: string; count: number }> = [],
    label: string,
    decrement: number
  ) => {
    return entries
      .map((entry) => {
        if (entry.label !== label) return entry;
  
        return {
          ...entry,
          count: Math.max(0, entry.count - decrement),
        };
      })
      .filter((entry) => entry.count > 0);
  };

  const reconcileInsightsAfterSingleAction = (
    file: ClassifiedFile,
    actionType: 'review' | 'archive' | 'remove'
  ) => {
    setScanData((prev) => {
      if (!prev?.scan_insights) return prev;
  
      const decrement = 1;
  
      const contextType = file.context_type;
      const reason = file.reason;
  
      const updatedPreviews = { ...(prev.scan_insights.pattern_previews || {}) };
  
      const updatePatternPreview = (key: string) => {
        const existingPreview = updatedPreviews[key];
        if (!existingPreview) return;
  
        updatedPreviews[key] = {
          ...existingPreview,
          review: {
            ...existingPreview.review,
            total: Math.max(0, existingPreview.review.total - decrement),
            items: existingPreview.review.items.filter((item) => item.path !== file.path),
          },
          archive: {
            ...existingPreview.archive,
            total:
              actionType === 'archive'
                ? Math.max(0, existingPreview.archive.total - decrement)
                : existingPreview.archive.total,
            items: existingPreview.archive.items.filter((item) => item.path !== file.path),
          },
          remove: {
            ...existingPreview.remove,
            total:
              actionType === 'remove'
                ? Math.max(0, existingPreview.remove.total - decrement)
                : existingPreview.remove.total,
            items: existingPreview.remove.items.filter((item) => item.path !== file.path),
          },
        };
      };
  
      if (contextType) {
        updatePatternPreview(`context_type:${contextType}`);
      }
  
      if (reason) {
        updatePatternPreview(`reason:${reason}`);
      }
  
      return {
        ...prev,
        scan_insights: {
          ...prev.scan_insights,
          review_context_summary: contextType
            ? decrementInsightEntries(
                prev.scan_insights.review_context_summary,
                contextType,
                decrement
              )
            : prev.scan_insights.review_context_summary,
  
          top_review_reasons: reason
            ? decrementInsightEntries(
                prev.scan_insights.top_review_reasons,
                reason,
                decrement
              )
            : prev.scan_insights.top_review_reasons,
  
          pattern_previews: updatedPreviews,
        },
      };
    });
  };

  const isLikelyPrimaryDuplicateItem = (item: DuplicateGroupItem, itemIndex: number) => {
    return (
      itemIndex === 0 &&
      !item.name.toLowerCase().includes('copy') &&
      !item.name.match(/\(\d+\)/)
    );
  };

  const getSelectedDuplicatePrimaryPath = (group: DuplicateGroup) => {
    const manualSelection = duplicatePrimarySelections[group.group_id];

    if (manualSelection && group.items.some((item) => item.path === manualSelection)) {
      return manualSelection;
    }

    const likelyPrimary = group.items.find((item, index) =>
      isLikelyPrimaryDuplicateItem(item, index)
    );

    return likelyPrimary?.path || group.items[0]?.path || '';
  };

  const setDuplicatePrimarySelection = (groupId: string, filePath: string) => {
    setDuplicatePrimarySelections((prev) => ({
      ...prev,
      [groupId]: filePath,
    }));
  };

  const removeDuplicateItemsFromQueue = (duplicatePaths: string[]) => {
    setScanData((prev) => {
      if (!prev) return prev;

      const duplicatePathSet = new Set(duplicatePaths);

      const updatedGroups = prev.duplicates
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => !duplicatePathSet.has(item.path)),
        }))
        .filter((group) => group.items.length >= 2);

      return {
        ...prev,
        duplicates: updatedGroups,
        duplicates_total: updatedGroups.length,
      };
    });
  };

  const handleMoveToArchive = async (filePath: string) => {
    if (isBulkActing) return;

    setBusyPath(filePath);
    setActionStatus(null);

    try {
      const result = await performQueueAction('archive', filePath);

      setActionStatus({
        tone: result.success ? 'success' : 'error',
        message: result.message,
      });
    } catch (error) {
      setActionStatus({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unexpected archive action failure.',
      });
    } finally {
      setBusyPath(null);
    }
  };

  const handleMoveToTrash = async (filePath: string) => {
    if (isBulkActing) return;

    setBusyPath(filePath);
    setActionStatus(null);

    try {
      const result = await performQueueAction('remove', filePath);

      setActionStatus({
        tone: result.success ? 'success' : 'error',
        message: result.message,
      });
    } catch (error) {
      setActionStatus({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unexpected remove action failure.',
      });
    } finally {
      setBusyPath(null);
    }
  };

  const handleArchiveDuplicate = async (duplicatePath: string) => {
    if (busyDuplicateGroupId || isBulkActing || isScanning) return;

    setBusyPath(duplicatePath);
    setActionStatus(null);

    try {
      const result = await performQueueAction('archive', duplicatePath, {
        mode: 'single',
      });

      if (result.success) {
        removeDuplicateFromQueue(duplicatePath);
        await refreshActionHistory();

        setActionStatus({
          tone: 'success',
          message: `${result.message} Refresh scan when you want to reconcile duplicate groups.`,
        });

        dispatchSession({
          type: 'FILE_ACTION_SUCCEEDED',
          sourceQueue: 'duplicate',
          fileAction: 'archive',
          filePath: duplicatePath,
        });
      } else {
        setActionStatus({
          tone: 'error',
          message: result.message,
        });
      }
    } catch (error) {
      setActionStatus({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unexpected duplicate archive failure.',
      });
    } finally {
      setBusyPath(null);
    }
  };

  const handleArchiveDuplicateGroup = async (group: DuplicateGroup) => {
    if (isBulkActing || isScanning || busyDuplicateGroupId) {
      return;
    }

    const keepPath = getSelectedDuplicatePrimaryPath(group);
    const itemsToArchive = group.items.filter((item) => item.path !== keepPath);

    if (!keepPath || itemsToArchive.length === 0) {
      return;
    }

    setBusyDuplicateGroupId(group.group_id);
    setActionStatus(null);

    let successCount = 0;
    let failureCount = 0;
    const archivedPaths: string[] = [];

    for (const item of itemsToArchive) {
      try {
        const result = await performQueueAction('archive', item.path, {
          mode: 'single'
        });

        if (result.success) {
          successCount += 1;
          archivedPaths.push(item.path);
        
          dispatchSession({
            type: 'FILE_ACTION_SUCCEEDED',
            sourceQueue: 'duplicate',
            fileAction: 'archive',
            filePath: item.path,
          });
        } else {
          failureCount += 1;
        }
      } catch {
        failureCount += 1;
      }
    }

    if (archivedPaths.length > 0) {
      removeDuplicateItemsFromQueue(archivedPaths);
    
      dispatchSession({
        type: 'DUPLICATE_GROUP_RESOLVED',
        groupId: group.group_id,
      });
    
      await refreshActionHistory();
    }

    if (failureCount === 0) {
      setActionStatus({
        tone: 'success',
        message: `Archived ${successCount} duplicate copie${successCount === 1 ? 'y' : 's'} while keeping the selected primary file.`,
      });
    } else {
      setActionStatus({
        tone: 'error',
        message: `Duplicate group resolution finished with partial success: ${successCount} archived, ${failureCount} failed.`,
      });
    }

    setBusyDuplicateGroupId(null);
  };

  const insights = useMemo(() => {
    if (!scanData) return null;
  
    const review = scanData.review_total;
    const archive = scanData.archive_total;
    const remove = scanData.remove_total;
    const oldFiles = scanData.age_buckets['>180d'] || 0;
  
    let summary = '';
  
    if (review > 10000) {
      summary = 'Your workspace is heavily cluttered.';
    } else if (review > 1000) {
      summary = 'Your workspace is moderately cluttered.';
    } else {
      summary = 'Your workspace is relatively clean.';
    }
  
    return {
      summary,
      review,
      archive,
      remove,
      oldFiles,
    };
  }, [scanData]);

  const topExtensions = useMemo(() => {
    if (!scanData) return [];
    return Object.entries(scanData.by_ext).slice(0, 5);
  }, [scanData]);

  const ageBucketEntries = useMemo(() => {
    if (!scanData) return [];
    return Object.entries(scanData.age_buckets);
  }, [scanData]);

  const csvHealth = useMemo(() => {
    if (!csvData?.success) return null;
  
    const missingEntries = Object.entries(csvData.missing_by_column || {});
    const totalMissing = missingEntries.reduce(
      (sum, [, count]) => sum + Number(count || 0),
      0
    );
  
    const emptyColumns = missingEntries
      .filter(([, count]) => Number(count) >= csvData.row_count)
      .map(([column]) => column);
  
    return {
      totalMissing,
      emptyColumns,
      hasMissingValues: totalMissing > 0,
      status:
        totalMissing === 0 && emptyColumns.length === 0
          ? 'Dataset looks healthy'
          : 'Dataset needs review',
    };
  }, [csvData]);

  const filteredReviewFiles = useMemo(() => {
    return applyQueueFilter(sortedReviewFiles, activeQueueFilter);
  }, [sortedReviewFiles, activeQueueFilter]);
  
  const visibleReviewFiles = useMemo(() => {
    return filteredReviewFiles.slice(0, reviewVisibleCount);
  }, [filteredReviewFiles, reviewVisibleCount]);
  
  const filteredArchiveCandidates = useMemo(() => {
    return applyQueueFilter(sortedArchiveCandidates, activeQueueFilter);
  }, [sortedArchiveCandidates, activeQueueFilter]);
  
  const visibleArchiveCandidates = useMemo(() => {
    return filteredArchiveCandidates.slice(0, archiveVisibleCount);
  }, [filteredArchiveCandidates, archiveVisibleCount]);
  
  const filteredRemoveCandidates = useMemo(() => {
    return applyQueueFilter(sortedRemoveCandidates, activeQueueFilter);
  }, [sortedRemoveCandidates, activeQueueFilter]);
  
  const visibleRemoveCandidates = useMemo(() => {
    return filteredRemoveCandidates.slice(0, removeVisibleCount);
  }, [filteredRemoveCandidates, removeVisibleCount]);

  const previewConfidence = useMemo(() => {
    if (!batchPreview) return null;
    return getConfidenceBreakdown(batchPreview.items);
  }, [batchPreview]);
  
  const previewRisks = useMemo(() => {
    if (!batchPreview) return [];
    return getRiskSummary(batchPreview.items);
  }, [batchPreview]);

  const adjustedTotals = useMemo(() => {
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
          sessionState.filesRemoved
      ),
  
      review: Math.max(0, scanData.review_total - sessionState.reviewResolved),
      archive: Math.max(0, scanData.archive_total - sessionState.archiveResolved),
      remove: Math.max(0, scanData.remove_total - sessionState.removeResolved),
  
      duplicateGroups: Math.max(
        0,
        scanData.duplicates_total - sessionState.resolvedDuplicateGroupIds.length
      ),
      sessionActions,
    };
  }, [scanData, sessionState]);

  const getFilterMatchCount = (filter: Exclude<QueueFilter, null>) => {
    return (
      applyQueueFilter(sortedReviewFiles, filter).length +
      applyQueueFilter(sortedArchiveCandidates, filter).length +
      applyQueueFilter(sortedRemoveCandidates, filter).length
    );
  };

  const invokeAction = async (
    actionType: 'review' | 'archive' | 'remove',
    filePath: string,
    mode: 'single' | 'bulk' = 'single'
  ) => {
    if (actionType === 'review') {
      return await window.electronAPI?.moveToReview?.(filePath, mode);
    }

    if (actionType === 'archive') {
      return await window.electronAPI?.moveToArchive?.(filePath, mode);
    }

    return await window.electronAPI?.moveToTrash?.(filePath, mode);
  };

  const getSuccessMessage = (
    actionType: 'review' | 'archive' | 'remove',
    result: { destination?: string; message?: string }
  ) => {
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
  };

  const performQueueAction = async (
    actionType: 'review' | 'archive' | 'remove',
    filePath: string,
    options?: {mode?: 'single' | 'bulk' }
  ) => {
    const mode = options?.mode ?? 'single';

    const result = await invokeAction(actionType, filePath, mode);

    if (result?.success) {
      removePathFromQueues(filePath);
    
      await refreshActionHistory();
    
      return {
        success: true,
        message: getSuccessMessage(actionType, result),
      };
    }

    return {
      success: false,
      message:
        result?.message ||
        (actionType === 'review'
          ? 'Failed to move file to DTM Review.'
          : actionType === 'archive'
          ? 'Failed to move file to DTM Archive.'
          : 'Failed to move file to Trash.'),
    };
  };

  const handleBulkQueueAction = async (
    sourceQueue: SourceQueue,
    actionType: 'review' | 'archive' | 'remove',
    files: ClassifiedFile[]
  ) => {
    if (isBulkActing || isScanning || files.length === 0) {
      return;
    }
  
    setIsBulkActing(true);
    setBusyPath(null);
    setActionStatus(null);
  
    try {
      setBulkProgress({
        action: actionType,
        current: 1,
        total: files.length,
        currentFileName: `Processing ${files.length} files...`,
      });
  
      const result = await window.electronAPI?.bulkFileAction?.({
        action: actionType,
        paths: files.map((file) => file.path),
        mode: 'bulk',
      });
  
      const successCount = result?.success_count ?? 0;
      const failureCount = result?.failure_count ?? files.length;
  
      if (Array.isArray(result?.results)) {
        for (const item of result.results) {
          if (!item.success) continue;
  
          removePathFromQueues(item.source_path);
  
          dispatchSession({
            type: 'FILE_ACTION_SUCCEEDED',
            sourceQueue,
            fileAction:
              actionType === 'archive'
                ? 'archive'
                : actionType === 'remove'
                ? 'remove'
                : 'keep',
            filePath: item.source_path,
          });
        }
      }
  
      await refreshActionHistory();
  
      const actionLabel =
        actionType === 'review'
          ? 'sent to review'
          : actionType === 'archive'
          ? 'archived'
          : 'moved to Trash';
  
      setActionStatus({
        tone: failureCount === 0 ? 'success' : 'error',
        message:
          failureCount === 0
            ? `Action complete: ${successCount} visible file${successCount === 1 ? '' : 's'} ${actionLabel}. Refresh when ready to reconcile.`
            : `Bulk action finished with partial success: ${successCount} succeeded, ${failureCount} failed.`,
      });
    } catch (error) {
      setActionStatus({
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
  };

  const handleBulkArchiveFromReview = async () => {
    await handleBulkQueueAction('review', 'archive', visibleReviewFiles);
  };
  
  const handleBulkMoveToArchive = async () => {
    await handleBulkQueueAction('archive', 'archive', visibleArchiveCandidates);
  };
  
  const handleBulkMoveToTrash = async () => {
    await handleBulkQueueAction('remove', 'remove', visibleRemoveCandidates);
  };

  const handleKeepFile = async (filePath: string) => {
    removePathFromQueues(filePath);
  
    setActionStatus({
      tone: 'success',
      message: 'Kept file in place. Refresh scan when you want to reconcile results.',
    });
  };

  const handleExecutePreview = async () => {
    if (!batchPreview) return;
    if (selectedBatchItems.length === 0) return;
  
    const action = batchPreview.action;
  
    if (action === 'archive') {
      const reviewFiles = selectedBatchItems.filter((file) =>
        sortedReviewFiles.some((candidate) => candidate.path === file.path)
      );
  
      const archiveFiles = selectedBatchItems.filter((file) =>
        sortedArchiveCandidates.some((candidate) => candidate.path === file.path)
      );
  
      if (reviewFiles.length > 0) {
        await handleBulkQueueAction('review', 'archive', reviewFiles);
      }
  
      if (archiveFiles.length > 0) {
        await handleBulkQueueAction('archive', 'archive', archiveFiles);
      }
    }
  
    if (action === 'remove') {
      const reviewFiles = selectedBatchItems.filter((file) =>
        sortedReviewFiles.some((candidate) => candidate.path === file.path)
      );
  
      const removeFiles = selectedBatchItems.filter((file) =>
        sortedRemoveCandidates.some((candidate) => candidate.path === file.path)
      );
  
      if (reviewFiles.length > 0) {
        await handleBulkQueueAction('review', 'remove', reviewFiles);
      }
  
      if (removeFiles.length > 0) {
        await handleBulkQueueAction('remove', 'remove', removeFiles);
      }
    }
  
    setBatchPreview(null);
    setSelectedBatchPaths(new Set());
  };

  const toggleBatchPath = (filePath: string) => {
    setSelectedBatchPaths((prev) => {
      const next = new Set(prev);
  
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
  
      return next;
    });
  };

  const handleCsvAction = async (
    action:
      | 'export_duplicate_groups'
      | 'export_suspicious_rows'
      | 'export_clean_copy'
      | 'export_approved_duplicates'
      | 'export_duplicate_needs_review'
      | 'export_corrupted_suspicious_rows'
      | 'export_suspicious_needs_review'
  ) => {
    if (!csvData?.success) return;
  
    setActionStatus(null);
  
    try {
      const result = await window.electronAPI?.runCsvAction?.({
        action,
        csv_path: csvData.path,
        duplicate_groups: csvData.duplicate_groups ?? [],
        suspicious_examples: csvData.suspicious_value_summary?.examples ?? [],
        suspicious_row_numbers: csvData.suspicious_value_summary?.row_numbers ?? [],
        duplicate_row_numbers_to_exclude: csvData.duplicate_row_numbers_to_exclude ?? [],
        dataset_decisions: datasetDecisions,
        suspicious_decisions: suspiciousDecisions,
      
        remove_empty_columns: true,
        remove_empty_rows: true,
        trim_whitespace: true,
        exclude_duplicate_rows: true,
        exclude_suspicious_rows: true,
      });

  
      setActionStatus({
        tone: result?.success ? 'success' : 'error',
        message: result?.success
          ? `${result.message} Export path: ${result.export_path}`
          : result?.message || 'CSV action failed.',
      });
    } catch (error) {
      setActionStatus({
        tone: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Unexpected CSV action failure.',
      });
    }
  };

  const handleOpenCsvExportFolder = async () => {
    try {
      const result = await window.electronAPI?.openCsvExportFolder?.();
  
      setActionStatus({
        tone: result?.success ? 'success' : 'error',
        message: result?.message || 'Unable to open export folder.',
      });
    } catch (error) {
      setActionStatus({
        tone: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Unexpected failure opening CSV export folder.',
      });
    }
  };

  const filteredDuplicateGroups = useMemo(() => {
    let groups =
      reviewQueueFilter === 'high'
        ? csvData?.duplicate_group_samples?.high_priority ?? []
        : reviewQueueFilter === 'medium'
        ? csvData?.duplicate_group_samples?.medium_priority ?? []
        : reviewQueueFilter === 'low'
        ? csvData?.duplicate_group_samples?.low_priority ?? []
        : loadedDuplicateGroups;
    
    if (duplicatePriorityFilter !== 'all') {
      groups = groups.filter(
        (group) => group.priority_label === duplicatePriorityFilter
      );
    }
  
    if (decisionFilter !== 'all') {
      groups = groups.filter((group) => {
        const decision = datasetDecisions[group.group_id]?.decision || 'pending';
        return decision === decisionFilter;
      });
    }
  
    return groups;
  }, [csvData, loadedDuplicateGroups, reviewQueueFilter, duplicatePriorityFilter, decisionFilter, datasetDecisions]);

  const filteredSuspiciousExamples = useMemo(() => {
    const examples = loadedSuspiciousExamples;
  
    let sortedExamples = [...examples].sort((a, b) => {
      const scoreA = a.severity_score ?? 0;
      const scoreB = b.severity_score ?? 0;
  
      if (scoreA !== scoreB) return scoreB - scoreA;
  
      return (b.issues?.length ?? 0) - (a.issues?.length ?? 0);
    });
  
    if (suspiciousSeverityFilter !== 'all') {
      sortedExamples = sortedExamples.filter(
        (example) => example.severity_label === suspiciousSeverityFilter
      );
    }
  
    if (suspiciousDecisionFilter === 'all') {
      return sortedExamples;
    }
  
    return sortedExamples.filter((example) => {
      const issueId = getSuspiciousIssueId(example);
      const decision = suspiciousDecisions[issueId]?.decision || 'pending';
  
      return decision === suspiciousDecisionFilter;
    });
  }, [
    loadedSuspiciousExamples,
    suspiciousSeverityFilter,
    suspiciousDecisionFilter,
    suspiciousDecisions,
    getSuspiciousIssueId,
  ]);

  const visibleDuplicateGroupsForReview = useMemo(() => {
    return filteredDuplicateGroups;
  }, [filteredDuplicateGroups]);
  
  const visibleSuspiciousExamplesForReview = useMemo(() => {
    return filteredSuspiciousExamples;
  }, [filteredSuspiciousExamples]);

  const [showDuplicateExportMenu, setShowDuplicateExportMenu] = useState(false);
  const [showSuspiciousExportMenu, setShowSuspiciousExportMenu] = useState(false);

  
  const selectedBatchItems = useMemo(() => {
    if (!batchPreview) return [];
    return batchPreview.items.filter((item) => selectedBatchPaths.has(item.path));
  }, [batchPreview, selectedBatchPaths]);

  const estimatedCsvRemainingSeconds = useMemo(() => {
    if (!scanProgress || scanProgress.type !== 'csv_progress') return null;
    if (!scanProgress.total_rows_estimate) return null;
    if (!scanProgress.rows_per_second || scanProgress.rows_per_second <= 0) return null;
  
    const remainingRows =
      scanProgress.total_rows_estimate - scanProgress.rows_scanned;
  
    return Math.max(
      0,
      Math.round(remainingRows / scanProgress.rows_per_second)
    );
  }, [scanProgress]);

  return (
    <div className="min-h-screen bg-[#f7f7f2] text-slate-900">
      <button
        onClick={() => setIsSupportOpen(prev => !prev)}
        className="fixed left-4 top-10 z-40 flex h-18 w-18 items-center justify-center rounded-xl bg-white shadow-md border border-slate-200 hover:bg-slate-100 transition"
      >
        <div className="space-y-2">
          <div className="h-[1.5px] w-8 bg-slate-700" />
          <div className="h-[1.5px] w-8 bg-slate-700" />
          <div className="h-[1.5px] w-8 bg-slate-700" />
        </div>
      </button>

      <div className="mx-auto flex min-h-screen w-full max-w-[1700px] flex-col px-5 py-6 md:px-8 lg:px-10">
      <Header
        isScanning={isScanning}
      />
        <main className="mt-8 space-y-8">
          
        <SupportDrawer
          isOpen={isSupportOpen}
          onClose={() => setIsSupportOpen(false)}
          insights={insights}
          scanData={scanData}
          historyFilter={historyFilter}
          filteredActionHistory={filteredActionHistory}
          selectedHistoryIds={selectedHistoryIds}
          selectedUndoableCount={
            selectedUndoableHistoryEntries.length
          }
          busyHistoryId={busyHistoryId}
          isBulkRestoring={isBulkRestoring}
          isBulkActing={isBulkActing}
          isScanning={isScanning}
          canUndoHistoryEntry={canUndoHistoryEntry}
          onHistoryFilterChange={setHistoryFilter}
          onToggleSelectedHistoryId={toggleSelectedHistoryId}
          onUndoHistoryEntry={handleUndoHistoryEntry}
          onBulkRestoreSelected={handleBulkRestoreSelected}
          onClearActionHistory={handleClearActionHistory}
        />

          <div className="flex flex-col gap-5 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-400">
                  Scan Scope
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                  Choose a target and explore your file landscape
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                  Start with a familiar high-impact location, or enter a custom folder path to inspect
                  a different part of your computer.
                </p>
              </div>

              <div className="flex shrink-0 items-center">
                <ScanButton
                  onClick={handleScan}
                  isScanning={isScanning}
                  label={`Scan ${scanTargetLabel}`}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <ModePill
                active={scanPreset === 'desktop'}
                label="Desktop"
                disabled={isBulkActing}
                onClick={() => setScanPreset('desktop')}
              />
              <ModePill
                active={scanPreset === 'downloads'}
                label="Downloads"
                disabled={isBulkActing}
                onClick={() => setScanPreset('downloads')}
              />
              <ModePill
                active={scanPreset === 'documents'}
                label="Documents"
                disabled={isBulkActing}
                onClick={() => setScanPreset('documents')}
              />
              <ModePill
                active={scanPreset === 'custom'}
                label="Custom"
                disabled={isBulkActing}
                onClick={() => setScanPreset('custom')}
              />
              <ModePill
                active={scanPreset === 'csv'}
                label="CSV Dataset"
                disabled={isBulkActing}
                onClick={() => setScanPreset('csv')}
              />
            </div>

            {scanPreset === 'custom' ? (
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="custom-path"
                  className="text-sm font-medium text-slate-700"
                >
                  Custom folder path
                </label>

                <div className="flex flex-col gap-3 md:flex-row">
                  <input
                    id="custom-path"
                    type="text"
                    value={customPath}
                    disabled={isBulkActing}
                    onChange={(e) => setCustomPath(e.target.value)}
                    placeholder="/Users/yourname/Documents/example-folder"
                    className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
                  />

                  <button
                    type="button"
                    onClick={handleBrowseForFolder}
                    disabled={isBulkActing}
                    className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
                  >
                    Browse…
                  </button>
                </div>

                <p className="text-xs text-slate-500">
                  Enter an absolute folder path or choose one with the folder picker.
                </p>
              </div>
            ) : null}

            {scanPreset === 'csv' ? (
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="csv-path"
                  className="text-sm font-medium text-slate-700"
                >
                  CSV file path
                </label>

                <div className="flex flex-col gap-3 md:flex-row">
                  <input
                    id="csv-path"
                    type="text"
                    value={csvPath}
                    disabled={isBulkActing}
                    onChange={(e) => setCsvPath(e.target.value)}
                    placeholder="/Users/yourname/Documents/example.csv"
                    className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
                  />

                  <button
                    type="button"
                    onClick={handleBrowseForCsv}
                    disabled={isBulkActing}
                    className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    Browse…
                  </button>
                </div>

                <p className="text-xs text-slate-500">
                  Enter an absolute path to a CSV file. This scan will inspect the dataset without modifying it.
                </p>
              </div>
            ) : null}

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowSystemFiles((prev) => !prev)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  showSystemFiles
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {showSystemFiles ? 'Hide System Files' : 'Show System Files'}
              </button>

              <span className="text-sm text-slate-500">
                {scanData ? `${scanData.system_files.length} system files available` : 'System files hidden by default'}
              </span>
            </div>
          </div>

          {actionStatus ? (
            <section
              className={`rounded-2xl border px-5 py-4 shadow-sm ${
                actionStatus.tone === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-rose-200 bg-rose-50 text-rose-900'
              }`}
            >
              <p className="text-sm font-medium">{actionStatus.message}</p>
            </section>
          ) : null}

          {activeQueueFilter ? (
            <section className="rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-600">
                    Filter Active
                  </div>

                  <div className="mt-1 text-sm text-slate-700">
                    <span className="font-semibold text-sky-900">
                      {activeQueueFilter.key.replace(/_/g, ' ')}
                    </span>{' '}
                    ={' '}
                    <span className="font-semibold text-sky-900">
                      {activeQueueFilter.value.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div className="mt-1 text-xs text-slate-600">
                    Showing ranked candidates that match this pattern. Preview counts may differ by action because Archive and Remove are separate recommendation paths.
                  </div>
                </div>

                <button
                  onClick={() => setActiveQueueFilter(null)}
                  className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-sky-200 transition hover:bg-sky-100"
                >
                  Clear filter
                </button>
              </div>
            </section>
          ) : null}

          {batchPreview ? (
            <section className="rounded-[2rem] border border-slate-200 bg-white px-6 py-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    Action Preview
                  </div>

                  <h3 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                    {batchPreview.action === 'archive'
                      ? 'Preview archive action'
                      : 'Preview remove action'}
                  </h3>

                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                    Review the bounded sample below before applying this insight action.
                  </p>

                  <p className="mt-1 text-sm text-slate-600">
                    Pattern:{' '}
                    <span className="font-semibold">
                      {batchPreview.filter.value.replace(/_/g, ' ')}
                    </span>{' '}
                    · {batchPreview.total.toLocaleString()} matching file
                    {batchPreview.total === 1 ? '' : 's'}
                  </p>
                </div>

                <button
                  onClick={() => setBatchPreview(null)}
                  className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
                >
                  Close
                </button>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {previewConfidence ? (
                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Action Confidence
                    </div>
                    <div className="mt-2 text-sm text-slate-700">
                      High: <span className="font-semibold">{previewConfidence.high}</span> ·{' '}
                      Medium: <span className="font-semibold">{previewConfidence.medium}</span> ·{' '}
                      Low: <span className="font-semibold">{previewConfidence.low}</span>
                    </div>
                  </div>
                ) : null}

                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Top Risk Signals
                  </div>

                  <div className="mt-2 text-sm text-slate-700">
                    {previewRisks.length === 0
                      ? 'No significant risk signals detected.'
                      : previewRisks.map(([risk, count]) => (
                          <div key={risk}>
                            {risk.replace(/_/g, ' ')} ·{' '}
                            <span className="font-semibold">{count}</span>
                          </div>
                        ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                <div className="text-sm text-slate-700">
                  Selected{' '}
                  <span className="font-semibold">
                    {selectedBatchItems.length.toLocaleString()}
                  </span>{' '}
                  of{' '}
                  <span className="font-semibold">
                    {batchPreview.items.length.toLocaleString()}
                  </span>{' '}
                  shown files.
                </div>

                <button
                  onClick={handleExecutePreview}
                  disabled={isBulkActing || isScanning || selectedBatchItems.length === 0}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    isBulkActing || isScanning || selectedBatchItems.length === 0
                      ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                      : batchPreview.action === 'archive'
                      ? 'bg-sky-900 text-white hover:bg-sky-700'
                      : 'bg-rose-900 text-white hover:bg-rose-700'
                  }`}
                >
                  {batchPreview.action === 'archive'
                    ? `Apply archive to ${selectedBatchItems.length}`
                    : `Move ${selectedBatchItems.length} to Trash`}
                </button>
              </div>

              <div className="mt-4 max-h-[300px] space-y-2 overflow-y-auto">
                {batchPreview.items.length === 0 ? (
                  <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                    No matching files found for this preview.
                  </div>
                ) : (
                  batchPreview.items.map((file) => (
                    <div key={file.path} className="rounded-xl bg-slate-50 px-4 py-3">
                      <label className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={selectedBatchPaths.has(file.path)}
                          onChange={() => toggleBatchPath(file.path)}
                          className="mt-1"
                        />

                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-slate-900">
                            {file.name}
                          </div>

                          <div className="mt-1 break-all text-xs text-slate-500">
                            {file.path}
                          </div>

                          <div className="mt-2 text-xs text-slate-600">
                            {file.recommended_action} · {file.action_confidence || 'unknown'} confidence
                          </div>
                        </div>
                      </label>
                    </div>
                  ))
                )}
              </div>
            </section>
          ) : null}

          {isBulkActing && bulkProgress ? (
            <section className="rounded-[2rem] border border-violet-200 bg-violet-50 p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="mt-1 h-3 w-3 rounded-full bg-violet-500" />
                <div>
                  <h3 className="text-lg font-semibold text-violet-900">
                    Bulk action in progress
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-violet-800">
                    Processing {bulkProgress.current} of {bulkProgress.total}:{' '}
                    <span className="font-medium">{bulkProgress.currentFileName}</span>
                  </p>
                  <p className="mt-2 text-xs uppercase tracking-[0.18em] text-violet-600">
                    Action: {bulkProgress.action}
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          {isScanning ? (
            <section className="rounded-[2rem] border border-sky-200 bg-sky-50 p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="mt-1 h-3 w-3 rounded-full bg-sky-500" />
                <div>
                  <h3 className="text-lg font-semibold text-sky-900">Scanning in progress</h3>
                  <p className="mt-1 text-sm leading-6 text-sky-800">
                    {scanPreset === 'desktop'
                      ? 'Running a broader Desktop scan. This may take longer depending on file volume.'
                      : scanPreset === 'downloads'
                      ? 'Scanning Downloads for clutter, archives, and disposable files.'
                      : scanPreset === 'documents'
                      ? 'Scanning Documents for files that may need review, archive, or cleanup.'
                      : scanPreset === 'custom'
                      ? `Scanning custom folder: ${customPath || 'No path provided'}`
                      : 'Running a fast development scan on your test folder.'}
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          {isScanning && scanProgress ? (
            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              {scanProgress.type === 'csv_progress' ? (
                <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-400">
                      CSV Scan Activity
                    </p>

                    <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                    {scanProgress.current_stage === 'starting'
                      ? 'Preparing dataset scan'
                      : scanProgress.current_stage === 'finalizing_results'
                      ? 'Finalizing dataset results'
                      : scanProgress.current_stage === 'building_duplicate_groups'
                      ? 'Building duplicate groups'
                      : 'Analyzing dataset rows'}
                    </h3>

                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      DTM is processing the CSV in bounded mode so large datasets can be analyzed without overwhelming the interface.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 xl:w-[32rem]">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                        Rows Scanned
                      </div>
                      <div className="mt-2 text-2xl font-semibold text-slate-900">
                        {scanProgress.rows_scanned.toLocaleString()}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                        Elapsed
                      </div>
                      <div className="mt-2 text-2xl font-semibold text-slate-900">
                        {scanProgress.elapsed_seconds}s
                      </div>
                    </div>

                    <div className="rounded-2xl bg-emerald-50 p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-emerald-700">
                        Processing Rate
                      </div>
                      <div className="mt-2 text-2xl font-semibold text-emerald-950">
                        {(scanProgress.rows_per_second ?? 0).toLocaleString()}/s
                      </div>
                    </div>

                    <div className="rounded-2xl bg-amber-50 p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-amber-700">
                        Duplicate Candidates
                      </div>

                      <div className="mt-2 text-2xl font-semibold text-amber-950">
                        {(scanProgress.duplicate_candidates ?? 0).toLocaleString()}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-rose-50 p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-rose-700">
                        Suspicious Values
                      </div>

                      <div className="mt-2 text-2xl font-semibold text-rose-950">
                        {(scanProgress.suspicious_values ?? 0).toLocaleString()}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-sky-50 p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-sky-700">
                        Missing Values
                      </div>

                      <div className="mt-2 text-2xl font-semibold text-sky-950">
                        {(scanProgress.missing_values ?? 0).toLocaleString()}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-violet-50 p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-violet-700">
                        Estimated Remaining
                      </div>

                      <div className="mt-2 text-2xl font-semibold text-violet-950">
                        {estimatedCsvRemainingSeconds === null
                          ? '—'
                          : formatDuration(estimatedCsvRemainingSeconds)}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-400">
                      Scan Activity
                    </p>

                    <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                      {scanProgress.status === 'starting'
                        ? 'Initializing scan'
                        : scanProgress.status === 'finalizing'
                        ? 'Finalizing results'
                        : 'Exploring file landscape'}
                    </h3>

                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      DTM is currently inspecting the selected target and building bounded summaries for safe review.
                    </p>

                    <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-4">
                      <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                        Current Path
                      </div>
                      <div className="mt-2 break-all text-sm text-slate-700">
                        {scanProgress.current_path}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 xl:w-[26rem]">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                        Files Processed
                      </div>
                      <div className="mt-2 text-2xl font-semibold text-slate-900">
                        {scanProgress.files_scanned.toLocaleString()}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                        Elapsed
                      </div>
                      <div className="mt-2 text-2xl font-semibold text-slate-900">
                        {scanProgress.elapsed_seconds}s
                      </div>
                    </div>

                    <div className="rounded-2xl bg-amber-50 p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-amber-500">
                        Review
                      </div>
                      <div className="mt-2 text-2xl font-semibold text-amber-900">
                        {scanProgress.review_total.toLocaleString()}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-sky-50 p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-sky-500">
                        Archive
                      </div>
                      <div className="mt-2 text-2xl font-semibold text-sky-900">
                        {scanProgress.archive_total.toLocaleString()}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-rose-50 p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-rose-500">
                        Remove
                      </div>
                      <div className="mt-2 text-2xl font-semibold text-rose-900">
                        {scanProgress.remove_total.toLocaleString()}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                        Duplicates
                      </div>
                      <div className="mt-2 text-2xl font-semibold text-slate-900">
                        {scanProgress.duplicates_total.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-5 flex flex-wrap gap-3 text-xs text-slate-500">
                <span className="rounded-full bg-slate-100 px-3 py-1">
                  Target: {scanProgress.target}
                </span>

                {scanProgress.type === 'csv_progress' ? (
                  <span className="rounded-full bg-slate-100 px-3 py-1">
                    Stage: {scanProgress.current_stage.replace(/_/g, ' ')}
                  </span>
                ) : (
                  <>
                    {typeof scanProgress.excluded_dirs_count === 'number' ? (
                      <span className="rounded-full bg-slate-100 px-3 py-1">
                        Excluded dirs: {scanProgress.excluded_dirs_count}
                      </span>
                    ) : null}
                    <span className="rounded-full bg-slate-100 px-3 py-1">
                      Status: {scanProgress.status}
                    </span>
                  </>
                )}
              </div>
            </section>
          ) : null}

          {csvData ? (
            <section className="space-y-6">
              <section className="rounded-[2rem] border border-sky-100 bg-sky-50/50 px-6 py-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-5">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-600">
                      CSV Dataset
                    </div>

                    <h3 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                      {csvData.success ? csvData.filename : 'CSV scan failed'}
                    </h3>

                    <p className="mt-2 break-all text-sm text-slate-600">
                      {csvData.path}
                    </p>
                  </div>

                  {csvData.success ? (
                    <div className="grid min-w-[280px] grid-cols-3 gap-3">
                      <div className="rounded-2xl bg-white px-4 py-3 text-center ring-1 ring-sky-100">
                        <div className="text-2xl font-semibold text-sky-900">
                          {(csvData.row_count ?? 0).toLocaleString()}
                        </div>
                        <div className="mt-1 text-xs font-medium text-slate-500">Rows</div>
                      </div>

                      <div className="rounded-2xl bg-white px-4 py-3 text-center ring-1 ring-sky-100">
                        <div className="text-2xl font-semibold text-sky-900">
                          {(csvData.column_count ?? 0).toLocaleString()}
                        </div>
                        <div className="mt-1 text-xs font-medium text-slate-500">Columns</div>
                      </div>

                      <div className="rounded-2xl bg-white px-4 py-3 text-center ring-1 ring-sky-100">
                        <div className="text-2xl font-semibold text-sky-900">
                          {(csvData.duplicate_row_count ?? 0).toLocaleString()}
                        </div>
                        <div className="mt-1 text-xs font-medium text-slate-500">Duplicates</div>
                      </div>
                    </div>
                  ) : null}
                </div>

                {!csvData.success ? (
                  <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                    {csvData.error || 'Unknown CSV scan error.'}
                  </div>
                ) : null}
              </section>

              {csvData.success ? (
                <>
                  <section className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                    {csvHealth ? (
                      <section className="rounded-[2rem] border border-emerald-100 bg-emerald-50/60 px-6 py-5 shadow-sm">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                          Dataset Health
                        </div>

                        <h3 className="mt-1 text-xl font-semibold text-emerald-950">
                          {csvHealth.status}
                        </h3>

                        <p className="mt-2 text-sm leading-6 text-emerald-900/80">
                          DTM checked structure, missing values, duplicate rows, and column completeness.
                        </p>

                        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">
                          <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-emerald-100">
                            <div className="text-xs font-medium text-emerald-700">Missing values</div>
                            <div className="mt-1 text-2xl font-semibold text-emerald-950">
                              {csvHealth.totalMissing.toLocaleString()}
                            </div>
                          </div>

                          <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-emerald-100">
                            <div className="text-xs font-medium text-emerald-700">Empty columns</div>
                            <div className="mt-1 text-2xl font-semibold text-emerald-950">
                              {csvHealth.emptyColumns.length}
                            </div>
                          </div>

                          <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-emerald-100">
                            <div className="text-xs font-medium text-emerald-700">Near-empty columns</div>
                            <div className="mt-1 text-2xl font-semibold text-emerald-950">
                              {(csvData.near_empty_columns ?? []).length}
                            </div>
                          </div>
                        </div>
                      </section>
                    ) : null}

                    <section className="rounded-[2rem] border border-amber-100 bg-amber-50/50 px-6 py-5 shadow-sm">
                      <div className="mb-4 flex items-start justify-between gap-4">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
                            Data Quality Insights
                          </div>

                          <h3 className="mt-1 text-xl font-semibold text-amber-950">
                            What needs attention
                          </h3>
                        </div>

                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                          {(csvData.data_quality_insights ?? []).length} insights
                        </span>
                      </div>

                      {(csvData.data_quality_insights ?? []).length > 0 ? (
                        <div className="space-y-3">
                          {csvData.data_quality_insights.map((insight) => (
                            <div
                              key={insight.id}
                              className={`rounded-2xl border px-4 py-4 ${
                                insight.severity === 'high'
                                  ? 'border-rose-200 bg-rose-50'
                                  : insight.severity === 'medium'
                                  ? 'border-amber-200 bg-white'
                                  : 'border-sky-100 bg-white'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold text-slate-900">
                                    {insight.title}
                                  </div>

                                  <div className="mt-1 text-xs text-slate-500">
                                    {insight.category.replace(/_/g, ' ')} ·{' '}
                                    {insight.count.toLocaleString()} affected
                                  </div>
                                </div>

                                <span
                                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${
                                    insight.severity === 'high'
                                      ? 'bg-rose-100 text-rose-800 ring-rose-200'
                                      : insight.severity === 'medium'
                                      ? 'bg-amber-100 text-amber-800 ring-amber-200'
                                      : 'bg-sky-50 text-sky-800 ring-sky-200'
                                  }`}
                                >
                                  {insight.severity}
                                </span>
                              </div>

                              <p className="mt-3 text-sm leading-6 text-slate-600">
                                {insight.summary}
                              </p>

                              <div className="mt-3 rounded-xl bg-white/80 px-3 py-2 text-xs leading-5 text-slate-600 ring-1 ring-slate-200">
                                <span className="font-semibold text-slate-800">
                                  Recommended action:
                                </span>{' '}
                                {insight.recommended_action}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                          No major data quality insights detected.
                        </div>
                      )}
                    </section>
                  </section>

                  {csvData?.success ? (
                    <section className="rounded-[2rem] border border-sky-100 bg-sky-50/50 px-6 py-5 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
                            Dataset Review Session
                          </div>

                          <h3 className="mt-1 text-xl font-semibold text-slate-900">
                            Review state is being saved locally
                          </h3>

                          <p className="mt-2 text-sm leading-6 text-slate-600">
                            DTM preserves duplicate-group decisions for this CSV so review work can continue across sessions.
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-sky-800 ring-1 ring-sky-200">
                            {csvReviewSession?.last_updated ? 'Session restored' : 'New session'}
                          </span>

                          <button
                            onClick={() =>
                              handleResetDatasetDecisions(() => {
                                resetDuplicateReviewIndex();
                                resetSuspiciousReviewIndex();
                                if (csvData) initializeFromScan(csvData);
                              })
                            }
                            className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-rose-800 ring-1 ring-rose-200 transition hover:bg-rose-50 active:scale-[0.98]"
                          >
                            Reset decisions
                          </button>
                        </div>
                      </div>

                      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                        <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-sky-100">
                          <div className="text-xs font-medium text-sky-700">Dataset</div>
                          <div className="mt-1 truncate text-sm font-semibold text-slate-900">
                            {csvData.filename}
                          </div>
                        </div>

                        <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-sky-100">
                          <div className="text-xs font-medium text-sky-700">Saved decisions</div>
                          <div className="mt-1 text-2xl font-semibold text-slate-900">
                          {Object.keys(datasetDecisions).length + Object.keys(suspiciousDecisions).length}
                          </div>
                        </div>

                        <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-sky-100">
                          <div className="text-xs font-medium text-sky-700">Last saved</div>
                          <div className="mt-1 text-sm font-semibold text-slate-900">
                            {csvReviewSession?.last_updated
                              ? new Date(csvReviewSession.last_updated).toLocaleString()
                              : 'Not saved yet'}
                          </div>
                        </div>
                      </div>
                    </section>
                  ) : null}

                  <section className="rounded-[2rem] border border-slate-200 bg-white px-6 py-5 shadow-sm">
                    <div className="mb-5">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Review Queue
                      </div>

                      <h3 className="mt-1 text-xl font-semibold text-slate-900">
                        Prioritized dataset findings
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                      <button
                        onClick={() => {
                          setReviewQueueFilter('all');
                          setDuplicateReviewCapacity(25);
                        }}
                        className={`rounded-2xl border px-4 py-4 text-left transition ${
                          reviewQueueFilter === 'all'
                            ? 'border-slate-400 bg-slate-100 ring-2 ring-slate-200'
                            : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                        }`}
                      >
                        <div className="text-xs font-medium text-slate-500">
                          All Findings
                        </div>

                        <div className="mt-1 text-2xl font-semibold text-slate-900">
                          {(csvData?.duplicate_groups_total ?? 0).toLocaleString()}
                        </div>
                      </button>

                      <button
                        onClick={() => {
                          setReviewQueueFilter('high');
                          setDuplicateReviewCapacity(25);
                        }}
                        className={`rounded-2xl border px-4 py-4 text-left transition ${
                          reviewQueueFilter === 'high'
                            ? 'border-rose-400 bg-rose-100 ring-2 ring-rose-200'
                            : 'border-rose-200 bg-rose-50 hover:bg-rose-100'
                        }`}
                      >
                        <div className="text-xs font-medium text-rose-700">
                          High Priority
                        </div>

                        <div className="mt-1 text-2xl font-semibold text-rose-900">
                          {(csvData?.review_queue?.high_priority ?? []).length.toLocaleString()}
                        </div>
                      </button>

                      <button
                        onClick={() => {
                          setReviewQueueFilter('medium');
                          setDuplicateReviewCapacity(25);
                        }}
                        className={`rounded-2xl border px-4 py-4 text-left transition ${
                          reviewQueueFilter === 'medium'
                            ? 'border-amber-400 bg-amber-100 ring-2 ring-amber-200'
                            : 'border-amber-200 bg-amber-50 hover:bg-amber-100'
                        }`}
                      >
                        <div className="text-xs font-medium text-amber-700">
                          Medium Priority
                        </div>

                        <div className="mt-1 text-2xl font-semibold text-amber-900">
                          {(csvData?.review_queue?.medium_priority ?? []).length.toLocaleString()}
                        </div>
                      </button>

                      <button
                        onClick={() => {
                          setReviewQueueFilter('low');
                          setDuplicateReviewCapacity(25);
                        }}
                        className={`rounded-2xl border px-4 py-4 text-left transition ${
                          reviewQueueFilter === 'low'
                            ? 'border-sky-400 bg-sky-100 ring-2 ring-sky-200'
                            : 'border-sky-200 bg-sky-50 hover:bg-sky-100'
                        }`}
                      >
                        <div className="text-xs font-medium text-sky-700">
                          Low Priority
                        </div>

                        <div className="mt-1 text-2xl font-semibold text-sky-900">
                          {(csvData?.review_queue?.low_priority ?? []).length.toLocaleString()}
                        </div>
                      </button>
                    </div>
                  </section>

                  <section className="rounded-[2rem] border border-slate-200 bg-white px-6 py-5 shadow-sm">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                          Issue Review Workspace
                        </div>

                        <h3 className="mt-1 text-xl font-semibold text-slate-900">
                          Review flagged records before taking action
                        </h3>

                        <p className="mt-2 text-sm leading-6 text-slate-500">
                          DTM groups likely duplicate records and suspicious values so you can inspect them before exporting or cleaning.
                        </p>
                      </div>
                    </div>

                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <button
                        onClick={() => handleCsvAction('export_clean_copy')}
                        className="rounded-full bg-emerald-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800"
                      >
                        Export clean copy
                      </button>

                      <button
                        onClick={handleOpenCsvExportFolder}
                        className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-700"
                      >
                        Open Export Folder
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50/50 px-5 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
                              Duplicate Groups
                            </div>

                            <h4 className="mt-1 text-base font-semibold text-amber-950">
                              {filteredDuplicateGroups.length} visible group
                              {(csvData.duplicate_groups ?? []).length === 1 ? '' : 's'} detected
                            </h4>
                          </div>
                        </div>

                        <div
                          ref={duplicateActionMenuRef}
                          className="mt-2 flex flex-wrap items-center justify-between gap-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="relative">
                              <button
                                onClick={() => {
                                  setShowDuplicateExportMenu((value) => !value);
                                  setShowSuspiciousExportMenu(false);
                                }}
                                className="rounded-full bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white"
                              >
                                Export ▼
                              </button>

                              {showDuplicateExportMenu ? (
                                <div className="absolute left-0 z-20 mt-2 w-56 rounded-xl border border-slate-200 bg-white shadow-lg">
                                  <button
                                    onClick={() => {
                                      handleCsvAction('export_duplicate_groups');
                                      setShowDuplicateExportMenu(false);
                                    }}
                                    className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50"
                                  >
                                    All duplicate rows
                                  </button>

                                  <button
                                    onClick={() => {
                                      handleCsvAction('export_approved_duplicates');
                                      setShowDuplicateExportMenu(false);
                                    }}
                                    className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50"
                                  >
                                    Approved duplicates
                                  </button>

                                  <button
                                    onClick={() => {
                                      handleCsvAction('export_duplicate_needs_review');
                                      setShowDuplicateExportMenu(false);
                                    }}
                                    className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50"
                                  >
                                    Needs-review duplicates
                                  </button>
                                </div>
                              ) : null}
                            </div>

                            <div className="relative">
                              <button
                                onClick={() => setShowDuplicateBulkMenu((value) => !value)}
                                className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                              >
                                Bulk Action ▼
                              </button>

                              {showDuplicateBulkMenu ? (
                                <div className="absolute left-0 z-20 mt-2 w-56 rounded-xl border border-slate-200 bg-white shadow-lg">
                                  <button
                                    onClick={() => {
                                      handleBulkDatasetDecision(
                                        'approved_duplicate',
                                        visibleDuplicateGroupsForReview,
                                      );
                                      setShowDuplicateBulkMenu(false);
                                    }}
                                    className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50"
                                  >
                                    Approve Visible
                                  </button>

                                  <button
                                    onClick={() => {
                                      handleBulkDatasetDecision(
                                        'legitimate_records',
                                        visibleDuplicateGroupsForReview,
                                      );
                                      setShowDuplicateBulkMenu(false);
                                    }}
                                    className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50"
                                  >
                                    Legitimate Visible
                                  </button>

                                  <button
                                    onClick={() => {
                                      handleBulkDatasetDecision(
                                        'needs_review',
                                        visibleDuplicateGroupsForReview,
                                      );
                                      setShowDuplicateBulkMenu(false);
                                    }}
                                    className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50"
                                  >
                                    Needs Review Visible
                                  </button>

                                  <button
                                    onClick={() => {
                                      handleBulkDatasetDecision(
                                        'ignored',
                                        visibleDuplicateGroupsForReview,
                                      );
                                      setShowDuplicateBulkMenu(false);
                                    }}
                                    className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50"
                                  >
                                    Ignore Visible
                                  </button>
                                </div>
                              ) : null}
                            </div>

                            <div className="relative">
                              <select
                                value={duplicatePriorityFilter}
                                onChange={(event) => {
                                  setDuplicatePriorityFilter(
                                    event.target.value as 'all' | 'critical' | 'high' | 'medium' | 'low'
                                  );
                                  setDuplicateReviewCapacity(25);
                                  resetDuplicateReviewIndex();
                                }}
                                className="h-8 w-24 rounded-full border border-amber-200 bg-white px-2 text-xs font-semibold text-amber-900 outline-none transition hover:bg-amber-50"
                              >
                                <option value="all">Filter</option>
                                <option value="critical">Critical Priority</option>
                                <option value="high">High Priority</option>
                                <option value="medium">Medium Priority</option>
                                <option value="low">Low Priority</option>
                              </select>
                            </div>
                          </div>

                          <ReviewCapacityControl
                            label="Review Capacity"
                            value={duplicateReviewCapacity}
                            total={Math.max(0, duplicateIndexTotal - datasetDecisionSummary.reviewed)}
                            visible={visibleDuplicateGroupsForReview.length}
                            onChange={setDuplicateReviewCapacity}
                          />
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {[
                            ['all', 'All'],
                            ['pending', 'Pending'],
                            ['approved_duplicate', 'Approved'],
                            ['legitimate_records', 'Legitimate'],
                            ['needs_review', 'Needs Review'],
                            ['ignored', 'Ignored'],
                          ].map(([value, label]) => (
                            <button
                              key={value}
                              onClick={() => {
                                setDecisionFilter(
                                  value as
                                    | 'all'
                                    | 'pending'
                                    | 'approved_duplicate'
                                    | 'legitimate_records'
                                    | 'needs_review'
                                    | 'ignored'
                                );
                                setDuplicateReviewCapacity(25);
                                resetDuplicateReviewIndex();
                              }}
                              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                                decisionFilter === value
                                  ? 'bg-amber-900 text-white'
                                  : 'bg-white text-amber-800 ring-1 ring-amber-200 hover:bg-amber-50'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>

                        <div className="mt-4 grid grid-cols-3 gap-3">
                          <div className="rounded-xl bg-white px-3 py-3 ring-1 ring-amber-100">
                            <div className="text-xs uppercase tracking-[0.16em] text-amber-700">
                              Reviewed
                            </div>
                            <div className="mt-1 text-xl font-semibold text-slate-900">
                              {datasetDecisionSummary.reviewed}
                            </div>
                          </div>

                          <div className="rounded-xl bg-white px-3 py-3 ring-1 ring-amber-100">
                            <div className="text-xs uppercase tracking-[0.16em] text-amber-700">
                              Pending
                            </div>
                            <div className="mt-1 text-xl font-semibold text-slate-900">
                              {datasetDecisionSummary.pending}
                            </div>
                          </div>

                          <div className="rounded-xl bg-white px-3 py-3 ring-1 ring-amber-100">
                            <div className="text-xs uppercase tracking-[0.16em] text-amber-700">
                              Completion
                            </div>
                            <div className="mt-1 text-xl font-semibold text-slate-900">
                              {datasetDecisionSummary.totalVisible === 0
                                ? 0
                                : Math.round(
                                    (datasetDecisionSummary.reviewed /
                                      datasetDecisionSummary.totalVisible) *
                                      100
                                  )}
                              %
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 h-2 overflow-hidden rounded-full bg-amber-100">
                          <div
                            className="h-full rounded-full bg-amber-500 transition-all"
                            style={{
                              width: `${
                                datasetDecisionSummary.totalVisible === 0
                                  ? 0
                                  : Math.min(
                                      100,
                                      (datasetDecisionSummary.reviewed /
                                        datasetDecisionSummary.totalVisible) *
                                        100
                                    )
                              }%`,
                            }}
                          />
                        </div>

                        <p className="mt-2 text-xs text-slate-500">
                          {datasetDecisionSummary.reviewed} of {datasetDecisionSummary.totalVisible} duplicate groups reviewed.
                        </p>

                        {visibleDuplicateGroupsForReview.length === 0 ? (
                          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                            {decisionFilter === 'all'
                              ? 'No duplicate group examples are currently loaded. Use Load next to continue reviewing.'
                              : `No ${decisionFilter.replace(/_/g, ' ')} duplicate groups are currently loaded.`}
                          </div>
                        ) : (
                          <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">
                              {visibleDuplicateGroupsForReview.map((group, index) => (
                              <div
                                key={group.group_id}
                                className="rounded-2xl border border-amber-200 bg-white px-4 py-4"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <div className="text-sm font-semibold text-slate-900">
                                        Duplicate Group {index + 1}
                                      </div>

                                      {group.priority_label ? (
                                        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-800 ring-1 ring-amber-200">
                                          {group.priority_label} priority
                                        </span>
                                      ) : null}
                                    </div>

                                    <div className="mt-1 text-xs text-slate-500">
                                      {group.rows_total} rows · confidence: {group.confidence}
                                      {typeof group.priority_score === 'number'
                                        ? ` · score: ${group.priority_score}`
                                        : ''}
                                    </div>
                                  </div>

                                  {(() => {
                                    const savedDecision = datasetDecisions[group.group_id]?.decision || 'pending';

                                    return (
                                      <span
                                        className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${
                                          savedDecision === 'approved_duplicate'
                                            ? 'bg-emerald-100 text-emerald-800 ring-emerald-200'
                                            : savedDecision === 'legitimate_records'
                                            ? 'bg-sky-100 text-sky-800 ring-sky-200'
                                            : savedDecision === 'needs_review'
                                            ? 'bg-amber-100 text-amber-800 ring-amber-200'
                                            : savedDecision === 'ignored'
                                            ? 'bg-slate-100 text-slate-600 ring-slate-200'
                                            : 'bg-white text-slate-600 ring-slate-200'
                                        }`}
                                      >
                                        {savedDecision.replace(/_/g, ' ')}
                                      </span>
                                    );
                                  })()}
                                </div>

                                {group.priority_reason ? (
                                  <div className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800 ring-1 ring-blue-100">
                                    {group.priority_reason}
                                  </div>
                                ) : null}

                                <p className="mt-3 text-sm leading-6 text-slate-600">
                                  {group.reason}
                                </p>

                                <div className="mt-4 flex flex-wrap gap-2">
                                  <button
                                    onClick={() => handleSaveDatasetDecision(group.group_id, 'approved_duplicate')}
                                    disabled={busyDatasetDecisionId === group.group_id}
                                    className="rounded-full bg-emerald-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                                  >
                                    Approve duplicate
                                  </button>

                                  <button
                                    onClick={() => handleSaveDatasetDecision(group.group_id, 'legitimate_records')}
                                    disabled={busyDatasetDecisionId === group.group_id}
                                    className="rounded-full bg-sky-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                                  >
                                    Legitimate records
                                  </button>

                                  <button
                                    onClick={() => handleSaveDatasetDecision(group.group_id, 'needs_review')}
                                    disabled={busyDatasetDecisionId === group.group_id}
                                    className="rounded-full bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                                  >
                                    Needs review
                                  </button>

                                  <button
                                    onClick={() => handleSaveDatasetDecision(group.group_id, 'ignored')}
                                    disabled={busyDatasetDecisionId === group.group_id}
                                    className="rounded-full bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                                  >
                                    Ignore
                                  </button>
                                </div>

                                <div className="mt-3 flex flex-wrap gap-2">
                                  {group.matching_columns.map((column) => (
                                    <span
                                      key={`${group.group_id}-${column}`}
                                      className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200"
                                    >
                                      {column}
                                    </span>
                                  ))}
                                </div>

                                {group.varying_id_columns.length > 0 ? (
                                  <div className="mt-3 rounded-xl bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-900 ring-1 ring-sky-100">
                                    ID-like fields differ:{' '}
                                    <span className="font-semibold">
                                      {group.varying_id_columns.join(', ')}
                                    </span>
                                  </div>
                                ) : null}

                                <div className="mt-4 space-y-2">
                                  {group.rows.map((row) => (
                                    <div
                                      key={`${group.group_id}-${row.row_number}`}
                                      className="rounded-xl bg-slate-50 px-3 py-3"
                                    >
                                      <div className="text-xs font-semibold text-slate-500">
                                        Row {row.row_number}
                                      </div>

                                      <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-slate-700">
                                        {group.matching_columns.slice(0, 4).map((column) => (
                                          <div key={`${row.row_number}-${column}`} className="break-all">
                                            <span className="font-semibold">{column}:</span>{' '}
                                            {row.values[column] || '—'}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                {group.hidden_rows_count > 0 ? (
                                  <div className="mt-3 text-xs text-slate-500">
                                    {group.hidden_rows_count} additional row
                                    {group.hidden_rows_count === 1 ? '' : 's'} hidden in this bounded preview.
                                  </div>
                                ) : null}
                              </div>
                            ))}
                            </div>
                        
                        )}

                        {duplicateHasMore ? (
                          <div className="mt-4 flex justify-center">
                            <button
                              disabled={isLoadingDuplicatePage || !duplicateHasMore}
                              onClick={() => {
                                if (!csvData?.path) return;
                                loadNextDuplicateBatch(
                                  csvData.path,
                                  duplicateReviewCapacity,
                                  decisionFilter === 'pending' ? Object.keys(datasetDecisions) : []
                                );
                              }}
                              className="rounded-full bg-amber-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-amber-800 active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:active:scale-100"
                            >
                              {isLoadingDuplicatePage
                                ? 'Loading...'
                                : duplicateHasMore
                                ? `Load next ${duplicateReviewCapacity}`
                                : 'All Loaded'}
                            </button>
                          </div>
                        ) : null}
                      </div>

                      <div className="rounded-[1.5rem] border border-rose-200 bg-rose-50/40 px-5 py-4">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-700">
                            Suspicious Values
                          </div>

                          <h4 className="mt-1 text-base font-semibold text-rose-950">
                            {filteredSuspiciousExamples.length} visible suspicious cell
                            {filteredSuspiciousExamples.length === 1 ? '' : 's'}
                          </h4>
                        </div>

                        <div
                          ref={suspiciousActionMenuRef}
                          className="mt-2 flex flex-wrap items-center justify-between gap-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="relative">
                              <button
                                onClick={() => {
                                  setShowSuspiciousExportMenu((value) => !value);
                                  setShowDuplicateExportMenu(false);
                                  setShowDuplicateBulkMenu(false);
                                }}
                                className="rounded-full bg-rose-900 px-3 py-1.5 text-xs font-semibold text-white"
                              >
                                Export ▼
                              </button>

                              {showSuspiciousExportMenu ? (
                                <div className="absolute left-0 z-20 mt-2 w-64 rounded-xl border border-slate-200 bg-white shadow-lg">
                                  <button
                                    onClick={() => {
                                      handleCsvAction('export_suspicious_rows');
                                      setShowSuspiciousExportMenu(false);
                                    }}
                                    className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50"
                                  >
                                    All suspicious rows
                                  </button>

                                  <button
                                    onClick={() => {
                                      handleCsvAction('export_corrupted_suspicious_rows');
                                      setShowSuspiciousExportMenu(false);
                                    }}
                                    className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50"
                                  >
                                    Corrupted suspicious rows
                                  </button>

                                  <button
                                    onClick={() => {
                                      handleCsvAction('export_suspicious_needs_review');
                                      setShowSuspiciousExportMenu(false);
                                    }}
                                    className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50"
                                  >
                                    Needs-review suspicious rows
                                  </button>
                                </div>
                              ) : null}
                            </div>

                            <div className="relative">
                              <button
                                onClick={() => setShowSuspiciousBulkMenu((value) => !value)}
                                className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                              >
                                Bulk Action ▼
                              </button>

                              {showSuspiciousBulkMenu ? (
                                <div className="absolute left-0 z-20 mt-2 w-56 rounded-xl border border-slate-200 bg-white shadow-lg">
                                  <button
                                    onClick={() => {
                                      handleBulkSuspiciousDecision(
                                        'valid_data',
                                        visibleSuspiciousExamplesForReview,
                                      );
                                      setShowSuspiciousBulkMenu(false);
                                    }}
                                    className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50"
                                  >
                                    Valid Visible
                                  </button>

                                  <button
                                    onClick={() => {
                                      handleBulkSuspiciousDecision(
                                        'corrupted',
                                        visibleSuspiciousExamplesForReview,
                                      );
                                      setShowSuspiciousBulkMenu(false);
                                    }}
                                    className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50"
                                  >
                                    Corrupted Visible
                                  </button>

                                  <button
                                    onClick={() => {
                                      handleBulkSuspiciousDecision(
                                        'needs_review',
                                        visibleSuspiciousExamplesForReview,
                                      );
                                      setShowSuspiciousBulkMenu(false);
                                    }}
                                    className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50"
                                  >
                                    Needs Review Visible
                                  </button>

                                  <button
                                    onClick={() => {
                                      handleBulkSuspiciousDecision(
                                        'ignored',
                                        visibleSuspiciousExamplesForReview,
                                      );
                                      setShowSuspiciousBulkMenu(false);
                                    }}
                                    className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50"
                                  >
                                    Ignore Visible
                                  </button>
                                </div>
                              ) : null}
                            </div>

                            <div className="relative">
                              <select
                                value={suspiciousSeverityFilter}
                                onChange={(event) => {
                                  setSuspiciousSeverityFilter(
                                    event.target.value as 'all' | 'critical' | 'high' | 'medium' | 'low'
                                  );
                                  setSuspiciousReviewCapacity(25);
                                  resetSuspiciousReviewIndex();
                                }}
                                className="h-8 w-24 rounded-full border border-rose-200 bg-white px-2 text-xs font-semibold text-rose-900 outline-none transition hover:bg-rose-50"
                              >
                                <option value="all">Filter</option>
                                <option value="critical">Critical Severity</option>
                                <option value="high">High Severity</option>
                                <option value="medium">Medium Severity</option>
                                <option value="low">Low Severity</option>
                              </select>
                            </div>
                          </div>

                          <ReviewCapacityControl
                            label="Review Capacity"
                            value={suspiciousReviewCapacity}
                            total={suspiciousPendingCount}
                            visible={visibleSuspiciousExamplesForReview.length}
                            onChange={setSuspiciousReviewCapacity}
                          />
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {[
                            ['all', 'All'],
                            ['pending', 'Pending'],
                            ['valid_data', 'Valid'],
                            ['corrupted', 'Corrupted'],
                            ['needs_review', 'Needs Review'],
                            ['ignored', 'Ignored'],
                          ].map(([value, label]) => (
                            <button
                              key={value}
                              onClick={() => {
                                setSuspiciousDecisionFilter(
                                  value as
                                    | 'all'
                                    | 'pending'
                                    | 'valid_data'
                                    | 'corrupted'
                                    | 'needs_review'
                                    | 'ignored'
                                );
                                setSuspiciousReviewCapacity(25);
                                resetSuspiciousReviewIndex();
                              }}
                              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                                suspiciousDecisionFilter === value
                                  ? 'bg-rose-900 text-white'
                                  : 'bg-white text-rose-800 ring-1 ring-rose-200 hover:bg-rose-50'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>

                        <div className="mt-4 grid grid-cols-3 gap-3">
                          <div className="rounded-xl bg-white px-3 py-3 ring-1 ring-rose-100">
                            <div className="text-xs uppercase tracking-[0.16em] text-rose-700">
                              Reviewed
                            </div>

                            <div className="mt-1 text-xl font-semibold text-slate-900">
                              {suspiciousReviewedCount}
                            </div>
                          </div>

                          <div className="rounded-xl bg-white px-3 py-3 ring-1 ring-rose-100">
                            <div className="text-xs uppercase tracking-[0.16em] text-rose-700">
                              Pending
                            </div>

                            <div className="mt-1 text-xl font-semibold text-slate-900">
                              {suspiciousPendingCount}
                            </div>
                          </div>

                          <div className="rounded-xl bg-white px-3 py-3 ring-1 ring-rose-100">
                            <div className="text-xs uppercase tracking-[0.16em] text-rose-700">
                              Completion
                            </div>

                            <div className="mt-1 text-xl font-semibold text-slate-900">
                              {suspiciousCompletionPercentage}%
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 h-2 overflow-hidden rounded-full bg-rose-100">
                          <div
                            className="h-full rounded-full bg-rose-500 transition-all"
                            style={{ width: `${suspiciousCompletionPercentage}%` }}
                          />
                        </div>

                        <p className="mt-2 text-xs text-slate-500">
                          {suspiciousReviewedCount} of {suspiciousIndexTotal} suspicious values reviewed.
                        </p>

                        {visibleSuspiciousExamplesForReview.length === 0 ? (
                          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                            {suspiciousDecisionFilter === 'all'
                              ? 'No suspicious value examples are currently loaded. Use Load next to continue reviewing.'
                              : `No ${suspiciousDecisionFilter.replace(/_/g, ' ')} suspicious values are currently loaded.`}
                          </div>
                        ) : (
                          <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">
                            {visibleSuspiciousExamplesForReview.map((example) => {
                              const issueId = getSuspiciousIssueId(example);
                              const savedDecision = suspiciousDecisions[issueId]?.decision || 'pending';

                              return (
                                <div
                                  key={issueId}
                                  className="rounded-2xl border border-rose-200 bg-white px-4 py-4"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <div className="text-sm font-semibold text-slate-900">
                                        Row {example.row_number}
                                      </div>

                                      <div className="mt-1 text-xs text-slate-500">
                                        Column: {example.column}
                                      </div>
                                    </div>

                                    {example.severity_label ? (
                                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-rose-800 ring-1 ring-rose-200">
                                        {example.severity_label} severity
                                      </span>
                                    ) : (
                                      <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-medium text-rose-800 ring-1 ring-rose-200">
                                        review
                                      </span>
                                    )}
                                  </div>

                                  <div className="mt-3">
                                    <span
                                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${
                                        savedDecision === 'corrupted'
                                          ? 'bg-rose-100 text-rose-800 ring-rose-200'
                                          : savedDecision === 'valid_data'
                                          ? 'bg-emerald-100 text-emerald-800 ring-emerald-200'
                                          : savedDecision === 'needs_review'
                                          ? 'bg-amber-100 text-amber-800 ring-amber-200'
                                          : savedDecision === 'ignored'
                                          ? 'bg-slate-100 text-slate-600 ring-slate-200'
                                          : 'bg-white text-slate-600 ring-slate-200'
                                      }`}
                                    >
                                      {savedDecision.replace(/_/g, ' ')}
                                    </span>
                                  </div>

                                  {example.severity_reason ? (
                                    <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800 ring-1 ring-rose-100">
                                      {example.severity_reason}
                                    </div>
                                  ) : null}

                                  <div className="mt-4 flex flex-wrap gap-2">
                                    <button
                                      onClick={() => handleSaveSuspiciousDecision(example, 'valid_data')}
                                      disabled={busySuspiciousDecisionId === issueId}
                                      className="rounded-full bg-emerald-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                                    >
                                      Valid data
                                    </button>

                                    <button
                                      onClick={() => handleSaveSuspiciousDecision(example, 'corrupted')}
                                      disabled={busySuspiciousDecisionId === issueId}
                                      className="rounded-full bg-rose-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                                    >
                                      Corrupted
                                    </button>

                                    <button
                                      onClick={() => handleSaveSuspiciousDecision(example, 'needs_review')}
                                      disabled={busySuspiciousDecisionId === issueId}
                                      className="rounded-full bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                                    >
                                      Needs review
                                    </button>

                                    <button
                                      onClick={() => handleSaveSuspiciousDecision(example, 'ignored')}
                                      disabled={busySuspiciousDecisionId === issueId}
                                      className="rounded-full bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                                    >
                                      Ignore
                                    </button>
                                  </div>

                                  <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700 break-all">
                                    {example.value || '—'}
                                  </div>

                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {example.issues.map((issue) => (
                                      <span
                                        key={`${issueId}-${issue}`}
                                        className="rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-800 ring-1 ring-rose-200"
                                      >
                                        {issue.replace(/_/g, ' ')}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {suspiciousHasMore ? (
                          <div className="mt-4 flex justify-center">
                            <button
                              disabled={isLoadingSuspiciousPage || !suspiciousHasMore}
                              onClick={() => {
                                if (!csvData?.path) return;
                                loadNextSuspiciousBatch(
                                  csvData.path,
                                  suspiciousReviewCapacity,
                                  suspiciousDecisionFilter === 'pending' ? Object.keys(suspiciousDecisions) : []
                                );
                              }}
                              className="rounded-full bg-rose-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-rose-800 active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:active:scale-100"
                            >
                              {isLoadingSuspiciousPage
                                ? 'Loading...'
                                : suspiciousHasMore
                                ? `Load next ${suspiciousReviewCapacity}`
                                : 'All Loaded'}
                            </button>
                          </div>
                        ) : null}
                        </div>
                      </div>
                    </section>
  
                    <section className="rounded-[2rem] border border-sky-100 bg-sky-50/40 px-6 py-5 shadow-sm">
                      <div className="mb-4 flex items-start justify-between gap-4">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
                            Column Intelligence
                          </div>

                          <h3 className="mt-1 text-xl font-semibold text-slate-900">
                            Structure and value patterns
                          </h3>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                        {Object.values(csvData.column_profiles ?? {}).map((profile) => (
                          <div
                            key={profile.name}
                            className="rounded-2xl border border-sky-100 bg-white px-4 py-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-slate-900">
                                  {profile.name}
                                </div>

                                <div className="mt-1 text-xs text-slate-500">
                                  {profile.non_empty_count.toLocaleString()} filled ·{' '}
                                  {profile.empty_count.toLocaleString()} empty
                                </div>
                              </div>

                              <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-800 ring-1 ring-sky-200">
                                {profile.inferred_type}
                              </span>
                            </div>

                            <div className="mt-3 text-sm text-slate-700">
                              <span className="font-semibold">
                                {profile.unique_count.toLocaleString()}
                              </span>{' '}
                              unique value{profile.unique_count === 1 ? '' : 's'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-[2rem] border border-slate-200 bg-white px-6 py-5 shadow-sm">
                      <div className="mb-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                          Table Preview
                        </div>

                        <h3 className="mt-1 text-xl font-semibold text-slate-900">
                          First rows for visual validation
                        </h3>
                      </div>

                      {(csvData.preview_rows ?? []).length === 0 ? (
                        <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-500">
                          No preview rows available.
                        </div>
                      ) : (
                        <div className="overflow-hidden rounded-2xl border border-slate-200">
                          <div className="max-h-[420px] overflow-auto">
                            <table className="min-w-full border-collapse text-left text-sm">
                              <thead className="sticky top-0 bg-slate-100 text-xs uppercase tracking-[0.12em] text-slate-500">
                                <tr>
                                  {(csvData.columns ?? []).map((column) => (
                                    <th
                                      key={column}
                                      className="border-b border-slate-200 px-4 py-3 font-semibold"
                                    >
                                      {column}
                                    </th>
                                  ))}
                                </tr>
                              </thead>

                              <tbody className="divide-y divide-slate-100 bg-white">
                                {(csvData.preview_rows ?? []).map((row, rowIndex) => (
                                  <tr key={rowIndex} className="hover:bg-slate-50">
                                    {(csvData.columns ?? []).map((column) => {
                                      const value = row[column];

                                      return (
                                        <td
                                          key={`${rowIndex}-${column}`}
                                          className="max-w-[280px] whitespace-nowrap px-4 py-3 text-slate-700"
                                        >
                                          <span className="block truncate">
                                            {value === null ||
                                            value === undefined ||
                                            String(value).trim() === ''
                                              ? '—'
                                              : String(value)}
                                          </span>
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      <p className="mt-2 text-xs text-slate-500">
                        Showing a bounded preview only. DTM has not modified the original CSV.
                      </p>
                    </section>
                  </>
                ) : null}
              </section>
            ) : null}

          {scanData ? (
            <section className="space-y-8">
              <section className="rounded-[2rem] border border-slate-200 bg-white px-6 py-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-5">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Workspace Progress
                    </div>

                    <h3 className="mt-1 text-xl font-semibold text-slate-900">
                      {adjustedTotals.sessionActions === 0
                        ? 'Ready to improve your workspace'
                        : 'You are actively improving your workspace'}
                    </h3>

                    <p className="mt-2 text-sm text-slate-500">
                      {adjustedTotals.sessionActions === 0
                        ? 'Start with a few decisions, archives, removals, or duplicate resolutions.'
                        : `${adjustedTotals.sessionActions} actions taken this session. Refresh scan when ready to fully reconcile filesystem changes.`}
                    </p>
                  </div>

                  <div className="grid min-w-[280px] grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-2xl bg-slate-50 px-4 py-3">
                      <div className="text-xs font-medium text-slate-500">Files in scope</div>
                      <div className="mt-1 text-2xl font-semibold text-slate-900">
                        {adjustedTotals.totalFiles}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-emerald-50 px-4 py-3">
                      <div className="text-xs font-medium text-emerald-700">Needs decision</div>
                      <div className="mt-1 text-2xl font-semibold text-emerald-900">
                        {adjustedTotals.review}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-amber-50 px-4 py-3">
                      <div className="text-xs font-medium text-amber-700">
                        {sessionState.needsRescan ? 'Duplicates from last scan' : 'Duplicate groups'}
                      </div>
                      <div className="mt-1 text-2xl font-semibold text-amber-900">
                        {adjustedTotals.duplicateGroups}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-sky-50 px-4 py-3">
                      <div className="text-xs font-medium text-sky-700">Session actions</div>
                      <div className="mt-1 text-2xl font-semibold text-sky-900">
                        {adjustedTotals.sessionActions}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-3 text-sm">
                  <span className="rounded-full bg-sky-50 px-3 py-1 font-medium text-sky-800">
                    Archived {sessionState.filesArchived}
                  </span>

                  <span className="rounded-full bg-rose-50 px-3 py-1 font-medium text-rose-800">
                    Removed {sessionState.filesRemoved}
                  </span>

                  <span className="rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-800">
                    Kept {sessionState.filesKept}
                  </span>
                </div>

                <div className="mt-5">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full bg-slate-900 transition-all duration-500"
                      style={{
                        width: `${
                          scanData
                            ? Math.min(
                                100,
                                (adjustedTotals.sessionActions /
                                  Math.max(scanData.total_files, 1)) *
                                  100
                              )
                            : 0
                        }%`,
                      }}
                    />
                  </div>

                  <div className="mt-2 text-xs text-slate-500">
                    Counts reflect the last scan adjusted by this session’s actions.
                  </div>
                </div>
              </section>

              <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_0.8fr]">
                <SectionCard
                  title="Focus Insights"
                  subtitle="Patterns DTM detected. Select one to focus the decision queues."
                >
                  <div className="space-y-6">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
                      Insights currently focus the decision queues only. File actions are performed from the queues so moves, history, and undo stay consistent.
                    </div>
                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                        File Contexts
                      </div>
                      <InsightList
                        entries={dedupedReviewContexts}
                        emptyMessage="No decision-context patterns available."
                        activeFilter={activeQueueFilter}
                        getMatchCount={(entry) => {
                          const filter: Exclude<QueueFilter, null> = {
                            label: entry.label,
                            key: 'context_type',
                            value: entry.label,
                          };

                          return getFilterMatchCount(filter);
                        }}
                        onSelect={(entry) => {
                          const filter: Exclude<QueueFilter, null> = {
                            label: entry.label,
                            key: 'context_type',
                            value: entry.label,
                          };

                          setActiveQueueFilter(filter);
                          setReviewVisibleCount(8);
                          setArchiveVisibleCount(8);
                          setRemoveVisibleCount(8);
                        }}
                        getAction={(entry) => getActionForInsightLabel(entry.label)}
                        onPreviewRequest={(entry, action) => {
                          handleInsightPreview('context_type', entry, action);
                        }}
                      />
                    </div>

                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Decision Reasons
                      </div>
                      <InsightList
                        entries={dedupedDecisionReasons}
                        emptyMessage="No decision reasons available."
                        activeFilter={activeQueueFilter}
                        getMatchCount={(entry) => {
                          const filter: Exclude<QueueFilter, null> = {
                            label: entry.label,
                            key: 'reason',
                            value: entry.label,
                          };

                          return getFilterMatchCount(filter);
                        }}
                        onSelect={(entry) => {
                          const filter: Exclude<QueueFilter, null> = {
                            label: entry.label,
                            key: 'reason',
                            value: entry.label,
                          };

                          setActiveQueueFilter(filter);
                          setReviewVisibleCount(8);
                          setArchiveVisibleCount(8);
                          setRemoveVisibleCount(8);
                        }}
                        getAction={(entry) => getActionForInsightLabel(entry.label)}
                        onPreviewRequest={(entry, action) => {
                          handleInsightPreview('reason', entry, action);
                        }}
                      />
                    </div>
                  </div>
                </SectionCard>

                <div className="space-y-6">
                  <SectionCard
                    title="Queue Summary"
                    subtitle="A compact map of the current decision landscape."
                  >
                    <InsightList
                      entries={scanData.scan_insights?.queue_summary || []}
                      emptyMessage="No queue summary available yet."
                    />
                  </SectionCard>

                  <SectionCard
                    title="Scan Context"
                    subtitle="Supporting file distribution signals from this scan."
                  >
                    <div className="space-y-5">
                      <div>
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                          Age Buckets
                        </div>
                        <KeyValueList
                          entries={ageBucketEntries}
                          emptyMessage="No age information available yet."
                        />
                      </div>

                      <div>
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                          Top File Types
                        </div>
                        <KeyValueList
                          entries={topExtensions}
                          emptyMessage="No file type data available yet."
                        />
                      </div>
                    </div>
                  </SectionCard>
                </div>
              </section>

              {activeQueueFilter && (
                <section className="rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
                        Active Focus
                      </div>

                      <div className="mt-1 text-sm text-sky-900">
                        {activeQueueFilter && (
                          <>
                            Filtering by{' '}
                            <span className="font-semibold">
                              {activeQueueFilter.key.replace(/_/g, ' ')}
                            </span>{' '}
                            ={' '}
                            <span className="font-semibold">
                              {activeQueueFilter.value.replace(/_/g, ' ')}
                            </span>
                          </>
                        )}
                      </div>

                      <div className="mt-1 text-xs text-sky-700">
                        Queues and previews are scoped to this focus.
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setActiveQueueFilter(null);
                      }}
                      className="rounded-full bg-sky-900 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                    >
                      Clear focus
                    </button>

                  </div>
                </section>
              )}

              <section className="space-y-6">
                {(sessionState.filesArchived > 0 || sessionState.filesRemoved > 0 || sessionState.filesKept > 0) && (
                  <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                          Session Activity
                        </div>

                        <div className="mt-1 text-sm text-emerald-900">
                          {sessionState.filesArchived > 0 ? (
                            <span className="mr-3">
                              Archived <span className="font-semibold">{sessionState.filesArchived}</span>
                            </span>
                          ) : null}

                          {sessionState.filesRemoved > 0 ? (
                            <span className="mr-3">
                              Removed <span className="font-semibold">{sessionState.filesRemoved}</span>
                            </span>
                          ) : null}

                          {sessionState.filesKept > 0 ? (
                            <span>
                              Kept <span className="font-semibold">{sessionState.filesKept}</span>
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-1 text-xs text-emerald-700">
                          Your workspace has changed. Refresh scan to fully reconcile results.
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          dispatchSession({ type: 'RESET_AFTER_RESCAN' });
                          triggerRescan();
                        }}
                        className="rounded-full bg-emerald-900 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                      >
                        Refresh Scan
                      </button>

                    </div>
                  </section>
                )}
                <section className="space-y-6">
                  <section className="rounded-[2rem] border border-slate-200 bg-white px-6 py-5 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Detailed Candidate Workspace
                        </div>
                        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                          Review and act on ranked file candidates
                        </h2>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                          These queues show bounded, ranked examples from the current scan
                          {activeQueueFilter ? ' and your active focus' : ''}. Use them for file-level inspection and controlled actions.
                        </p>
                      </div>

                      {activeQueueFilter ? (
                        <span className="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 ring-1 ring-sky-200">
                          Scoped view
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                          Full ranked view
                        </span>
                      )}
                    </div>
                  </section>

                  <div className="space-y-6">
                    {/* MAIN WORKSPACE */}
                    <section className="grid grid-cols-1 gap-6 xl:grid-cols-2"> 
                      <SectionCard
                        title="Decision Queue"
                        subtitle="Filtered, ranked candidates based on your current focus."
                      >

                        {sortedReviewFiles.length > 0 ? (
                          <div className="mb-3 text-xs text-slate-500">
                            Showing top {visibleReviewFiles.length} prioritized decision items
                            {activeQueueFilter
                              ? ` matching current focus from ${filteredReviewFiles.length}`
                              : ` from ~${adjustedTotals.review.toLocaleString()} estimated remaining`}
                          </div>
                        ) : null}

                        {visibleReviewFiles.length > 0 ? (
                          <div className="mb-4 flex flex-wrap gap-3">
                            <button
                              onClick={handleBulkArchiveFromReview}
                              disabled={
                                isBulkActing ||
                                isScanning ||
                                visibleReviewFiles.length === 0
                              }
                              className="rounded-full bg-amber-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                            >
                              {isBulkActing && bulkProgress?.action === 'review'
                                ? 'Bulk moving…'
                                : `Apply archive to visible ${visibleReviewFiles.length}`}
                            </button>
                          </div>
                        ) : null}

                        {sortedReviewFiles.length > 0 ? (
                          <QueueSortControls
                            sortKey={reviewSortKey}
                            sortDirection={reviewSortDirection}
                            onSortKeyChange={setReviewSortKey}
                            onSortDirectionChange={setReviewSortDirection}
                            disabled={isBulkActing}
                          />
                        ) : null}

                        {filteredReviewFiles.length === 0 ? (
                          <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-600">
                          {activeQueueFilter
                            ? 'No decision files match the current focus.'
                            : 'No decision files detected in this scan.'}
                        </div>
                        ) : (
                          <div className="space-y-3">
                            {visibleReviewFiles.map((file) => (
                              <QueueFileCard
                                key={file.path}
                                file={file}
                                tone="review"
                                actionLabel="Archive"
                                busyLabel="Archiving…"
                                onAction={async (filePath) => {
                                  await handleMoveToArchive(filePath);
                                
                                  dispatchSession({
                                    type: 'FILE_ACTION_SUCCEEDED',
                                    sourceQueue: 'review',
                                    fileAction: 'archive',
                                    filePath,
                                  });
                                
                                  reconcileInsightsAfterSingleAction(file, 'archive');
                                }}
                                
                                onKeep={async (filePath) => {
                                  await handleKeepFile(filePath);
                                
                                  dispatchSession({
                                    type: 'FILE_ACTION_SUCCEEDED',
                                    sourceQueue: 'review',
                                    fileAction: 'keep',
                                    filePath,
                                  });
                                
                                  reconcileInsightsAfterSingleAction(file, 'review');
                                }}
                                
                                onRemove={async (filePath) => {
                                  await handleMoveToTrash(filePath);
                                
                                  dispatchSession({
                                    type: 'FILE_ACTION_SUCCEEDED',
                                    sourceQueue: 'review',
                                    fileAction: 'remove',
                                    filePath,
                                  });
                                
                                  reconcileInsightsAfterSingleAction(file, 'remove');
                                }}
                                recommendedAction="archive"
                                isBusy={busyPath === file.path || isBulkActing}
                              />
                            ))}

                            {sortedReviewFiles.length > 8 ? (
                              <div className="mt-4 flex gap-3">
                                {reviewVisibleCount < sortedReviewFiles.length ? (
                                  <button
                                    onClick={() =>
                                      setReviewVisibleCount((prev) =>
                                        Math.min(prev + 8, sortedReviewFiles.length)
                                      )
                                    }
                                    className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
                                  >
                                    Show more
                                  </button>
                                ) : null}

                                {reviewVisibleCount > 8 ? (
                                  <button
                                    onClick={() => setReviewVisibleCount(8)}
                                    className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50"
                                  >
                                    Show less
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        )}
                      </SectionCard>

                      <SectionCard
                        title="Archive Queue"
                        subtitle="Ranked files that appear worth keeping, but not keeping active in the current workspace."
                      >
                        {activeQueueFilter && (
                          <div className="mb-2 text-xs text-sky-700">
                            Showing results scoped to current focus
                          </div>
                        )}

                        {sortedArchiveCandidates.length > 0 ? ( 
                          <div className="mb-3 text-xs text-slate-500">
                            Showing top {visibleArchiveCandidates.length} ranked archive candidates
                            {activeQueueFilter
                              ? ` matching current focus from ${filteredArchiveCandidates.length}`
                              : ` from ~${adjustedTotals.archive.toLocaleString()} estimated remaining`}
                          </div>
                        ) : null}
                        
                        {visibleArchiveCandidates.length > 0 ? ( 
                          <div className="mb-4 flex flex-wrap gap-3">
                            <button
                              onClick={handleBulkMoveToArchive}
                              disabled={
                                isBulkActing ||
                                isScanning ||
                                visibleArchiveCandidates.length === 0
                              }
                              className="rounded-full bg-sky-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                            >
                              {isBulkActing && bulkProgress?.action === 'archive'
                                ? 'Bulk archiving…'
                                : `Apply archive to visible ${visibleArchiveCandidates.length} to Archive`}
                            </button>
                          </div>
                        ) : null}

                        {sortedArchiveCandidates.length > 0 ? (
                          <QueueSortControls
                            sortKey={archiveSortKey}
                            sortDirection={archiveSortDirection}
                            onSortKeyChange={setArchiveSortKey}
                            onSortDirectionChange={setArchiveSortDirection}
                            disabled={isBulkActing}
                          />
                        ) : null}

                        {filteredArchiveCandidates.length === 0 ? (
                          <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-600">
                          {activeQueueFilter
                            ? 'No archive candidates match the current focus.'
                            : 'No archive candidates detected in this scan.'}
                        </div>
                        ) : (
                          <div className="space-y-3">
                            {visibleArchiveCandidates.map((file) => (
                              <QueueFileCard
                                key={file.path}
                                file={file}
                                tone="archive"
                                actionLabel="Move to Archive"
                                busyLabel="Archiving…"
                                onAction={async (filePath) => {
                                  await handleMoveToArchive(filePath);
                                
                                  dispatchSession({
                                    type: 'FILE_ACTION_SUCCEEDED',
                                    sourceQueue: 'archive',
                                    fileAction: 'archive',
                                    filePath,
                                  });
                                
                                  reconcileInsightsAfterSingleAction(file, 'archive');
                                }}
                                
                                onKeep={async (filePath) => {
                                  await handleKeepFile(filePath);
                                
                                  dispatchSession({
                                    type: 'FILE_ACTION_SUCCEEDED',
                                    sourceQueue: 'archive',
                                    fileAction: 'keep',
                                    filePath,
                                  });
                                
                                  reconcileInsightsAfterSingleAction(file, 'review');
                                }}
                                
                                onRemove={async (filePath) => {
                                  await handleMoveToTrash(filePath);
                                
                                  dispatchSession({
                                    type: 'FILE_ACTION_SUCCEEDED',
                                    sourceQueue: 'archive',
                                    fileAction: 'remove',
                                    filePath,
                                  });
                                
                                  reconcileInsightsAfterSingleAction(file, 'remove');
                                }}
                                recommendedAction="archive"
                                isBusy={busyPath === file.path || isBulkActing}
                              />
                            ))}

                            {sortedArchiveCandidates.length > 8 ? (
                              <div className="mt-4 flex gap-3">
                                {archiveVisibleCount < sortedArchiveCandidates.length ? (
                                  <button
                                    onClick={() =>
                                      setArchiveVisibleCount((prev) =>
                                        Math.min(prev + 8, sortedArchiveCandidates.length)
                                      )
                                    }
                                    className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
                                  >
                                    Show more
                                  </button>
                                ) : null}

                                {archiveVisibleCount > 8 ? (
                                  <button
                                    onClick={() => setArchiveVisibleCount(8)}
                                    className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50"
                                  >
                                    Show less
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        )}
                      </SectionCard>

                      <SectionCard
                        title="Remove Queue"
                        subtitle="Ranked files that appear disposable, temporary, or low-value. DTM moves these to Trash, not permanent deletion."
                      >
                        {activeQueueFilter && (
                          <div className="mb-2 text-xs text-sky-700">
                            Showing results scoped to current focus
                          </div>
                        )}

                        {sortedRemoveCandidates.length > 0 ? (
                          <div className="mb-3 text-xs text-slate-500">
                            Showing top {visibleRemoveCandidates.length} ranked remove candidates
                            {activeQueueFilter
                              ? ` matching current focus from ${filteredRemoveCandidates.length}`
                              : ` from ~${adjustedTotals.remove.toLocaleString()} estimated remaining`}
                          </div>
                        ) : null}

                        {visibleRemoveCandidates.length > 0 ? (
                          <div className="mb-4 flex flex-wrap gap-3">
                            <button
                              onClick={handleBulkMoveToTrash}
                              disabled={
                                isBulkActing ||
                                isScanning ||
                                visibleRemoveCandidates.length === 0
                              }
                              className="rounded-full bg-rose-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                            >
                              {isBulkActing && bulkProgress?.action === 'remove'
                                ? 'Bulk removing…'
                                : `Move visible ${visibleRemoveCandidates.length} to Trash`}
                            </button>
                          </div>
                        ) : null}

                        {sortedRemoveCandidates.length > 0 ? (
                          <QueueSortControls
                            sortKey={removeSortKey}
                            sortDirection={removeSortDirection}
                            onSortKeyChange={setRemoveSortKey}
                            onSortDirectionChange={setRemoveSortDirection}
                            disabled={isBulkActing}
                          />
                        ) : null}

                        {filteredRemoveCandidates.length === 0 ? (
                          <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-600">
                          {activeQueueFilter
                            ? 'No remove candidates match the current focus.'
                            : 'No remove candidates detected in this scan.'}
                        </div>
                        ) : (
                          <div className="space-y-3">
                            {visibleRemoveCandidates.map((file) => (
                              <QueueFileCard
                                key={file.path}
                                file={file}
                                tone="remove"
                                actionLabel="Move to Trash"
                                busyLabel="Removing…"
                                onAction={async (filePath) => {
                                  await handleMoveToTrash(filePath);
                                
                                  dispatchSession({
                                    type: 'FILE_ACTION_SUCCEEDED',
                                    sourceQueue: 'remove',
                                    fileAction: 'remove',
                                    filePath,
                                  });
                                
                                  reconcileInsightsAfterSingleAction(file, 'remove');
                                }}
                                
                                onKeep={async (filePath) => {
                                  await handleKeepFile(filePath);
                                
                                  dispatchSession({
                                    type: 'FILE_ACTION_SUCCEEDED',
                                    sourceQueue: 'remove',
                                    fileAction: 'keep',
                                    filePath,
                                  });
                                
                                  reconcileInsightsAfterSingleAction(file, 'review');
                                }}
                                
                                onArchive={async (filePath) => {
                                  await handleMoveToArchive(filePath);
                                
                                  dispatchSession({
                                    type: 'FILE_ACTION_SUCCEEDED',
                                    sourceQueue: 'remove',
                                    fileAction: 'archive',
                                    filePath,
                                  });
                                
                                  reconcileInsightsAfterSingleAction(file, 'archive');
                                }}
                                recommendedAction="remove"
                                isBusy={busyPath === file.path || isBulkActing}
                              />
                            ))}

                            {sortedRemoveCandidates.length > 8 ? (
                              <div className="mt-4 flex gap-3">
                                {removeVisibleCount < sortedRemoveCandidates.length ? (
                                  <button
                                    onClick={() =>
                                      setRemoveVisibleCount((prev) =>
                                        Math.min(prev + 8, sortedRemoveCandidates.length)
                                      )
                                    }
                                    className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
                                  >
                                    Show more
                                  </button>
                                ) : null}

                                {removeVisibleCount > 8 ? (
                                  <button
                                    onClick={() => setRemoveVisibleCount(8)}
                                    className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50"
                                  >
                                    Show less
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        )}
                      </SectionCard>

                      <SectionCard
                        title="Duplicate Queue"
                        subtitle="Grouped file families that appear to contain duplicate copies."
                      >
                        {activeQueueFilter && (
                          <div className="mb-2 text-xs text-sky-700">
                            Showing results scoped to current focus
                          </div>
                        )}

                        {visibleDuplicates.length > 0 ? (
                          <div className="mb-3 text-xs text-slate-500">
                            Showing {visibleDuplicates.length} of {scanData.duplicates_total} duplicate groups
                          </div>
                        ) : null}

                        {scanData.duplicates.length === 0 ? (
                          <div className="rounded-2xl bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                            No duplicate groups detected in this scan.
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {visibleDuplicates.map((group, index) => {
                              const selectedPrimaryPath = getSelectedDuplicatePrimaryPath(group);

                              return (
                                <div
                                  key={`${group.group_id}-${index}`}
                                  className="rounded-3xl border border-slate-200 bg-slate-50 p-4"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                      <div className="text-sm font-semibold text-slate-900">
                                        Duplicate Group {index + 1}
                                      </div>
                                      <div className="mt-1 text-xs text-slate-500">
                                        {group.items_total ?? group.items.length} files · showing {group.items.length} · confidence: {group.confidence}
                                      </div>
                                    </div>

                                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">
                                      Grouped
                                    </span>
                                  </div>

                                  <div className="mt-3 rounded-2xl bg-white p-3">
                                    <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
                                      Reason
                                    </div>
                                    <div className="mt-2 text-sm text-slate-700">{group.reason}</div>
                                  </div>

                                  <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                      <div>
                                        <div className="text-sm font-semibold text-sky-900">
                                          Resolution
                                        </div>
                                        <div className="mt-1 text-xs text-sky-700">
                                          Select one file to keep active, then archive the other shown copies.
                                        </div>
                                      </div>

                                      <button
                                        onClick={() => handleArchiveDuplicateGroup(group)}
                                        disabled={
                                          busyDuplicateGroupId === group.group_id ||
                                          isBulkActing ||
                                          isScanning ||
                                          group.items.length < 2
                                        }
                                        className="rounded-full bg-sky-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                                      >
                                        {busyDuplicateGroupId === group.group_id
                                          ? 'Resolving…'
                                          : `Archive shown copies (${Math.max(group.items.length - 1, 0)})`}
                                      </button>
                                    </div>
                                  </div>

                                  {group.hidden_items_count && group.hidden_items_count > 0 ? (
                                    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                                      {group.hidden_items_count} additional duplicate copies are hidden in this bounded view.
                                      DTM is showing a representative subset so one duplicate family does not dominate the workspace.
                                    </div>
                                  ) : null}

                                  <div className="mt-4 space-y-3">
                                    {group.items.map((item, itemIndex) => {
                                      const likelyPrimary = isLikelyPrimaryDuplicateItem(item, itemIndex);
                                      const isSelectedPrimary = item.path === selectedPrimaryPath;

                                      return (
                                        <div
                                          key={item.path}
                                          className={`rounded-2xl p-3 ring-1 ${
                                            isSelectedPrimary
                                              ? 'bg-emerald-50 ring-emerald-200'
                                              : 'bg-white ring-slate-200'
                                          }`}
                                        >
                                          <div className="flex flex-wrap items-center gap-2">
                                            <div className="text-sm font-semibold text-slate-900">
                                              {item.name}
                                            </div>

                                            {isSelectedPrimary ? (
                                              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium text-emerald-800 ring-1 ring-emerald-200">
                                                Selected primary
                                              </span>
                                            ) : likelyPrimary ? (
                                              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
                                                Likely primary
                                              </span>
                                            ) : (
                                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">
                                                Likely copy
                                              </span>
                                            )}
                                          </div>

                                          <div className="mt-2 break-all text-xs text-slate-600">
                                            {item.path}
                                          </div>

                                          <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                                            <span>Size: {item.size.toLocaleString()} bytes</span>
                                            <span>Age: {item.age_days} days</span>
                                            <span>Type: {item.ext}</span>
                                          </div>

                                          <div className="mt-4 flex flex-wrap gap-3">
                                            <button
                                              onClick={() => setDuplicatePrimarySelection(group.group_id, item.path)}
                                              disabled={busyDuplicateGroupId === group.group_id || isBulkActing || isScanning}
                                              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                                                isSelectedPrimary
                                                  ? 'bg-emerald-700 text-white'
                                                  : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
                                              } disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500`}
                                            >
                                              {isSelectedPrimary ? 'Keeping this one' : 'Keep this one'}
                                            </button>

                                            {!isSelectedPrimary ? (
                                              <button
                                                onClick={() => handleArchiveDuplicate(item.path)}
                                                disabled={
                                                  busyPath === item.path ||
                                                  busyDuplicateGroupId === group.group_id ||
                                                  isBulkActing ||
                                                  isScanning
                                                }
                                                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                                                  busyPath === item.path
                                                    ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                                                    : 'bg-sky-900 text-white hover:bg-sky-700'
                                                }`}
                                              >
                                                {busyPath === item.path ? 'Archiving…' : 'Archive This Copy'}
                                              </button>
                                            ) : null}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}

                            {scanData.duplicates.length > 8 ? (
                              <div className="mt-4 flex gap-3">
                                {duplicateVisibleCount < scanData.duplicates.length ? (
                                  <button
                                    onClick={() =>
                                      setDuplicateVisibleCount((prev) =>
                                        Math.min(prev + 8, scanData.duplicates.length)
                                      )
                                    }
                                    className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
                                  >
                                    Show more
                                  </button>
                                ) : null}

                                {duplicateVisibleCount > 8 ? (
                                  <button
                                    onClick={() => setDuplicateVisibleCount(8)}
                                    className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50"
                                  >
                                    Show less
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        )}
                      </SectionCard>
                    </section>
                  </div>
                </section>  
              </section>

              <section className="mx-auto flex min-h-screen w-full max-w-[1700px] flex-col px-5 py-6 md:px-8 lg:px-10">
                {showSystemFiles ? (
                  <SectionCard
                    title="System Files"
                    subtitle="Files generated by the operating system or tooling, usually safe to ignore."
                  >
                    {scanData.system_files.length === 0 ? (
                      <p className="text-sm text-slate-500">No system files detected in this scan.</p>
                    ) : (
                      <div className="space-y-3">
                        {scanData.system_files.slice(0, 10).map((file) => (
                          <div
                            key={file.path}
                            className="flex items-start gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-4"
                          >
                            <FileBadge filename={file.name} />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-semibold text-slate-900">{file.name}</h3>
                                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200">
                                  {file.category.replace(/_/g, ' ')}
                                </span>
                              </div>
                              <p className="mt-2 break-all text-xs leading-5 text-slate-700">{file.path}</p>

                              <div className="mt-3 text-xs text-slate-600">
                                <span className="font-semibold">Reason:</span> {file.reason}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </SectionCard>
                  ) : (
                <div />
                )}
            </section>
          </section>
            ) : !isScanning && !csvData ? (
              <section className="rounded-[2rem] border border-slate-200 bg-white p-10 shadow-sm">
                <div className="max-w-2xl">
                  <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-400">
                    Ready
                  </p>
                  <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
                    Run a scan to populate the maintenance dashboard
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-slate-500">
                    Start with any local file enviornment and switch when
                    you want broader validation. The dashboard will keep evolving around these
                    structured result states.
                  </p>
                </div>
              </section>
            ) : null}
        </main>
      </div>
    </div>
  );
}

export default App;
