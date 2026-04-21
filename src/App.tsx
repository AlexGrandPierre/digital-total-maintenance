import { useEffect, useMemo, useState } from 'react';
import Header from './components/Header';
import ScanButton from './components/ScanButton';

type ScanPreset = 'test' | 'desktop' | 'downloads' | 'documents' | 'custom';

type SortKey = 'name' | 'age_days' | 'size' | 'confidence';
type SortDirection = 'asc' | 'desc';

type ClassifiedFile = {
  path: string;
  name: string;
  ext: string;
  size: number;
  age_days: number;
  hash: string | null;
  category: string;
  confidence: 'high' | 'medium' | 'low';
  recommended_action: 'keep' | 'ignore' | 'review' | 'archive' | 'remove';
  reason: string;
  ui_visibility: 'normal' | 'hidden_by_default';
};

type ScanResult = {
  scanned_at: string;
  folder: string;
  mode: string;
  scan_warnings: string[];
  total_files: number;

  review_files: ClassifiedFile[];
  review_total: number;

  system_files: ClassifiedFile[];
  system_total: number;

  archive_candidates: ClassifiedFile[];
  archive_total: number;

  remove_candidates: ClassifiedFile[];
  remove_total: number;

  duplicates: string[][];
  duplicates_total: number;

  age_buckets: Record<string, number>;
  by_ext: Record<string, number>;

  errors: Array<{ path: string; error: string }>;
  errors_total: number;

  excluded_dirs_count: number;

  detail_caps: {
    review_files: number;
    system_files: number;
    archive_candidates: number;
    remove_candidates: number;
    duplicates: number;
    errors: number;
  };
};

function StatCard({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'warn' | 'good' | 'danger';
}) {
  const toneClasses = {
    neutral: 'bg-white border-slate-200 text-slate-900',
    warn: 'bg-amber-50 border-amber-200 text-amber-900',
    good: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    danger: 'bg-rose-50 border-rose-200 text-rose-900',
  };

  return (
    <div className={`rounded-3xl border p-5 shadow-sm transition hover:shadow-md ${toneClasses[tone]}`}>
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-3 text-4xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function KeyValueList({
  entries,
  emptyMessage,
}: {
  entries: Array<[string, number | string]>;
  emptyMessage: string;
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-slate-500">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-3">
      {entries.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
          <span className="text-sm font-medium text-slate-700">{label}</span>
          <span className="text-sm font-semibold text-slate-900">{value}</span>
        </div>
      ))}
    </div>
  );
}

function ModePill({
  active,
  label,
  onClick,
  disabled = false,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
        disabled
          ? 'cursor-not-allowed bg-slate-100 text-slate-400'
          : active
          ? 'bg-slate-900 text-white shadow-sm'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {label}
    </button>
  );
}

function QueueSortControls({
  sortKey,
  sortDirection,
  onSortKeyChange,
  onSortDirectionChange,
  disabled = false,
}: {
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSortKeyChange: (value: SortKey) => void;
  onSortDirectionChange: (value: SortDirection) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
          Sort by
        </label>
        <select
          value={sortKey}
          disabled={disabled}
          onChange={(e) => onSortKeyChange(e.target.value as SortKey)}
          className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        >
          <option value="confidence">Confidence</option>
          <option value="age_days">Age</option>
          <option value="size">Size</option>
          <option value="name">Name</option>
        </select>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
          Direction
        </label>
        <select
          value={sortDirection}
          disabled={disabled}
          onChange={(e) => onSortDirectionChange(e.target.value as SortDirection)}
          className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        >
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </select>
      </div>
    </div>
  );
}

function FileBadge({ filename }: { filename: string }) {
  const ext = filename.includes('.') ? filename.split('.').pop()?.toUpperCase() : 'FILE';

  return (
    <div className="inline-flex h-10 min-w-[2.75rem] items-center justify-center rounded-2xl bg-slate-100 px-3 text-xs font-semibold text-slate-600">
      {ext || 'FILE'}
    </div>
  );
}

const confidenceRank: Record<'high' | 'medium' | 'low', number> = {
  low: 0,
  medium: 1,
  high: 2,
};

function compareValues(
  a: ClassifiedFile,
  b: ClassifiedFile,
  key: SortKey,
  direction: SortDirection
) {
  let result = 0;

  if (key === 'confidence') {
    result = confidenceRank[a.confidence] - confidenceRank[b.confidence];
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

function App() {
  const [scanOutput, setScanOutput] = useState<string>('No scan yet.');
  const [scanData, setScanData] = useState<ScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanPreset, setScanPreset] = useState<ScanPreset>('test');
  const [customPath, setCustomPath] = useState('');
  const [showSystemFiles, setShowSystemFiles] = useState(false);
  const [actionStatus, setActionStatus] = useState<{
    tone: 'success' | 'error';
    message: string;
  } | null>(null);

  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<{
    status: 'starting' | 'scanning' | 'finalizing';
    target: string;
    files_scanned: number;
    current_path: string;
    elapsed_seconds: number;
    review_total: number;
    archive_total: number;
    remove_total: number;
    duplicates_total: number;
    excluded_dirs_count?: number;
  } | null>(null);

  const [isBulkActing, setIsBulkActing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{
    action: 'review' | 'archive' | 'remove';
    current: number;
    total: number;
    currentFileName: string;
  } | null>(null);

  const [reviewSortKey, setReviewSortKey] = useState<SortKey>('confidence');
  const [reviewSortDirection, setReviewSortDirection] = useState<SortDirection>('asc');

  const [archiveSortKey, setArchiveSortKey] = useState<SortKey>('age_days');
  const [archiveSortDirection, setArchiveSortDirection] = useState<SortDirection>('desc');

  const [removeSortKey, setRemoveSortKey] = useState<SortKey>('age_days');
  const [removeSortDirection, setRemoveSortDirection] = useState<SortDirection>('desc');

  const [reviewVisibleCount, setReviewVisibleCount] = useState(8);
  const [archiveVisibleCount, setArchiveVisibleCount] = useState(8);
  const [removeVisibleCount, setRemoveVisibleCount] = useState(8);

  const [duplicateVisibleCount, setDuplicateVisibleCount] = useState(8);

  const [actionHistory, setActionHistory] = useState<ActionHistoryEntry[]>([]);

  const [busyHistoryId, setBusyHistoryId] = useState<string | null>(null);

  const [historyFilter, setHistoryFilter] = useState<'undoable' | 'all' | 'restored'>('undoable');

  useEffect(() => {
    const unsubscribeFinished = window.electronAPI?.onScanFinished?.((data: { output?: string }) => {
      const output = data.output || 'Scan completed with no output.';
      setScanOutput(output);
      setIsScanning(false);
      setScanProgress(null);

      setReviewVisibleCount(8);
      setArchiveVisibleCount(8);
      setRemoveVisibleCount(8);
      setDuplicateVisibleCount(8);

      loadActionHistory();

      try {
        const parsed = JSON.parse(output);
        setScanData(parsed);
      } catch {
        setScanData(null);
      }
    });

    const unsubscribeProgress = window.electronAPI?.onScanProgress?.((data) => {
      setScanProgress({
        status: data.status,
        target: data.target,
        files_scanned: data.files_scanned,
        current_path: data.current_path,
        elapsed_seconds: data.elapsed_seconds,
        review_total: data.review_total,
        archive_total: data.archive_total,
        remove_total: data.remove_total,
        duplicates_total: data.duplicates_total,
        excluded_dirs_count: data.excluded_dirs_count,
      });
    });

    return () => {
      unsubscribeFinished?.();
      unsubscribeProgress?.();
    };
  }, []);

  const scanTargetLabel = useMemo(() => {
    switch (scanPreset) {
      case 'desktop':
        return 'Desktop';
      case 'downloads':
        return 'Downloads';
      case 'documents':
        return 'Documents';
      case 'custom':
        return 'Custom Folder';
      case 'test':
      default:
        return 'Test Folder';
    }
  }, [scanPreset]);

  const sortedReviewFiles = useMemo(() => {
    if (!scanData) return [];
    return sortQueue(scanData.review_files, reviewSortKey, reviewSortDirection);
  }, [scanData, reviewSortKey, reviewSortDirection]);
  
  const sortedArchiveCandidates = useMemo(() => {
    if (!scanData) return [];
    return sortQueue(scanData.archive_candidates, archiveSortKey, archiveSortDirection);
  }, [scanData, archiveSortKey, archiveSortDirection]);
  
  const sortedRemoveCandidates = useMemo(() => {
    if (!scanData) return [];
    return sortQueue(scanData.remove_candidates, removeSortKey, removeSortDirection);
  }, [scanData, removeSortKey, removeSortDirection]);

  const handleBrowseForFolder = async () => {
    try {
      const result = await window.electronAPI?.browseForFolder?.();

      if (result?.success && result.path) {
        setCustomPath(result.path);
        setActionStatus(null);
      }
    } catch (error) {
      setActionStatus({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Failed to open folder picker.',
      });
    }
  };

  const loadActionHistory = async () => {
    try {
      const history = await window.electronAPI?.getActionHistory?.(100);
      setActionHistory(history || []);
    } catch {
      setActionHistory([]);
    }
  };

  const canUndoHistoryEntry = (entry: ActionHistoryEntry) => {
    if (
      entry.status !== 'success' ||
      (entry.action !== 'move_to_review' && entry.action !== 'move_to_archive') ||
      !entry.source_path ||
      !entry.destination_path
    ) {
      return false;
    }

    const alreadyRestored = actionHistory.some((historyEntry) => {
      return (
        (historyEntry.action === 'restore_from_review' ||
          historyEntry.action === 'restore_from_archive') &&
        historyEntry.status === 'success' &&
        historyEntry.reverts_history_id === entry.id
      );
    });

    return !alreadyRestored;
  };

  const filteredActionHistory = useMemo(() => {
    if (historyFilter === 'undoable') {
      return actionHistory.filter((entry) => canUndoHistoryEntry(entry));
    }

    if (historyFilter === 'restored') {
      return actionHistory.filter(
        (entry) =>
          entry.action === 'restore_from_review' ||
          entry.action === 'restore_from_archive'
      );
    }

    return actionHistory;
  }, [actionHistory, historyFilter]);


  const visibleDuplicates = useMemo(() => {
    if (!scanData) return [];
    return scanData.duplicates.slice(0, duplicateVisibleCount);
  }, [scanData, duplicateVisibleCount]);

  const handleScan = () => {
    if (isBulkActing) {
      setActionStatus({
        tone: 'error',
        message: 'Bulk action in progress. Please wait until it finishes before starting a new scan.',
      });
      return;
    }

    setScanProgress(null);

    if (scanPreset === 'custom' && !customPath.trim()) {
      setActionStatus({
        tone: 'error',
        message: 'Please enter a folder path before scanning a custom location.',
      });
      return;
    }

    const normalizedCustomPath = customPath.trim();

    if (scanPreset === 'custom' && normalizedCustomPath === '/') {
      setActionStatus({
        tone: 'error',
        message:
          'Scanning the system root is restricted in the current safe mode. Choose a more specific folder.',
      });
      return;
    }

    setIsScanning(true);
    setScanData(null);
    setActionStatus(null);
    setScanOutput(`Scanning ${scanTargetLabel}... Please wait.`);

    window.electronAPI?.sendScanRequest?.({
      preset: scanPreset,
      customPath: normalizedCustomPath,
    });
  };

  const removePathFromQueues = (
    filePath: string,
    actionType: 'review' | 'archive' | 'remove'
  ) => {
    setScanData((prev) => {
      if (!prev) return prev;
  
      const next = {
        ...prev,
        review_files: prev.review_files.filter((f) => f.path !== filePath),
        archive_candidates: prev.archive_candidates.filter((f) => f.path !== filePath),
        remove_candidates: prev.remove_candidates.filter((f) => f.path !== filePath),
        system_files: prev.system_files.filter((f) => f.path !== filePath),
        duplicates: prev.duplicates.filter(
          (pair) => pair[0] !== filePath && pair[1] !== filePath
        ),
        review_total: prev.review_total,
        archive_total: prev.archive_total,
        remove_total: prev.remove_total,
      };
  
      if (actionType === 'review') {
        next.review_total = Math.max(0, prev.review_total - 1);
      }
  
      if (actionType === 'archive') {
        next.archive_total = Math.max(0, prev.archive_total - 1);
      }
  
      if (actionType === 'remove') {
        next.remove_total = Math.max(0, prev.remove_total - 1);
      }
  
      return next;
    });
  };

  const removeDuplicateFromQueue = (duplicatePath: string) => {
    setScanData((prev) => {
      if (!prev) return prev;
  
      return {
        ...prev,
        duplicates: prev.duplicates.filter(
          (pair) => pair[0] !== duplicatePath && pair[1] !== duplicatePath
        ),
        duplicates_total: Math.max(0, prev.duplicates_total - 1),
      };
    });
  };

  const handleMoveToReview = async (filePath: string) => {
    if (isBulkActing) return;

    setBusyPath(filePath);
    setActionStatus(null);

    try {
      const result = await performQueueAction('review', filePath);

      setActionStatus({
        tone: result.success ? 'success' : 'error',
        message: result.message,
      });
    } catch (error) {
      setActionStatus({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unexpected action failure.',
      });
    } finally {
      setBusyPath(null);
    }
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
    setBusyPath(duplicatePath);
    setActionStatus(null);
  
    try {
      const result = await window.electronAPI?.moveToArchive?.(duplicatePath, 'single');
  
      if (result?.success) {
        setActionStatus({
          tone: 'success',
          message: result.destination
            ? `Duplicate moved to DTM Archive: ${result.destination}`
            : result.message,
        });
  
        removeDuplicateFromQueue(duplicatePath);

        await loadActionHistory();
  
        window.electronAPI?.sendScanRequest?.({
          preset: scanPreset,
          customPath: customPath.trim(),
        });
      } else {
        setActionStatus({
          tone: 'error',
          message: result?.message || 'Failed to archive duplicate.',
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

  const handleUndoHistoryEntry = async (entry: ActionHistoryEntry) => {
    if (!canUndoHistoryEntry(entry)) {
      return;
    }

    setBusyHistoryId(entry.id);
    setActionStatus(null);

    try {
      const result = await window.electronAPI?.restoreFromHistory?.(entry);

      if (result?.success) {
        setActionStatus({
          tone: 'success',
          message: result.destination
            ? `Restored file: ${result.destination}`
            : result.message,
        });

        await loadActionHistory();
        triggerRescan();
      } else {
        console.error('Restore result:', result);

        setActionStatus({
          tone: 'error',
          message: result?.message
            ? `Restore failed: ${result.message}`
            : 'Restore failed with no detailed message.',
        });
      }
    } catch (error) {
      console.error('Undo exception:', error);

      setActionStatus({
        tone: 'error',
        message: error instanceof Error ? `Undo exception: ${error.message}` : 'Unexpected undo failure.',
      });
    } finally {
      setBusyHistoryId(null);
    }
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

  const reviewSummary = useMemo(() => {
    if (!scanData) return [];
    return [
      ['Needs review', scanData.review_total],
      ['Archive candidates', scanData.archive_total],
      ['Remove candidates', scanData.remove_total],
      ['Duplicate pairs', scanData.duplicates_total],
      ['Excluded directories', scanData.excluded_dirs_count],
      ['Folder scanned', scanData.folder],
      ['Mode', scanData.mode],
    ] as Array<[string, number | string]>;
  }, [scanData]);

  const visibleReviewFiles = useMemo(() => {
    return sortedReviewFiles.slice(0, reviewVisibleCount);
  }, [sortedReviewFiles, reviewVisibleCount]);
  
  const visibleArchiveCandidates = useMemo(() => {
    return sortedArchiveCandidates.slice(0, archiveVisibleCount);
  }, [sortedArchiveCandidates, archiveVisibleCount]);
  
  const visibleRemoveCandidates = useMemo(() => {
    return sortedRemoveCandidates.slice(0, removeVisibleCount);
  }, [sortedRemoveCandidates, removeVisibleCount]);

  const getCurrentScanPayload = () => ({
    preset: scanPreset,
    customPath: customPath.trim(),
  });

  const triggerRescan = () => {
    setIsScanning(true);
    setScanProgress(null);
    setScanOutput(`Refreshing ${scanTargetLabel} after changes...`);
    window.electronAPI?.sendScanRequest?.(getCurrentScanPayload());
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
    options?: { rescanAfterSuccess?: boolean; mode?: 'single' | 'bulk' }
  ) => {
    const rescanAfterSuccess = options?.rescanAfterSuccess ?? true;
    const mode = options?.mode ?? 'single';

    const result = await invokeAction(actionType, filePath, mode);

    if (result?.success) {
      removePathFromQueues(filePath, actionType);

      await loadActionHistory();

      if (rescanAfterSuccess) {
        triggerRescan();
      }

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
    actionType: 'review' | 'archive' | 'remove',
    files: ClassifiedFile[]
  ) => {
    if (isBulkActing || isScanning || files.length === 0) {
      return;
    }

    setIsBulkActing(true);
    setBusyPath(null);
    setActionStatus(null);

    let successCount = 0;
    let failureCount = 0;

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];

      setBulkProgress({
        action: actionType,
        current: index + 1,
        total: files.length,
        currentFileName: file.name,
      });

      try {
        const result = await performQueueAction(actionType, file.path, {
          rescanAfterSuccess: false,
          mode: 'bulk',
        });

        if (result.success) {
          successCount += 1;
        } else {
          failureCount += 1;
        }
      } catch {
        failureCount += 1;
      }
    }

    setBulkProgress(null);
    setIsBulkActing(false);

    if (successCount > 0) {
      triggerRescan();
    }

    const actionLabel =
      actionType === 'review'
        ? 'moved to DTM Review'
        : actionType === 'archive'
        ? 'moved to DTM Archive'
        : 'moved to Trash';

    if (failureCount === 0) {
      setActionStatus({
        tone: 'success',
        message: `Bulk action complete: ${successCount} file${successCount === 1 ? '' : 's'} ${actionLabel}.`,
      });
    } else {
      setActionStatus({
        tone: 'error',
        message: `Bulk action finished with partial success: ${successCount} succeeded, ${failureCount} failed.`,
      });
    }
  };

  const handleBulkMoveToReview = async () => {
    await handleBulkQueueAction('review', visibleReviewFiles);
  };

  const handleBulkMoveToArchive = async () => {
    await handleBulkQueueAction('archive', visibleArchiveCandidates);
  };

  const handleBulkMoveToTrash = async () => {
    await handleBulkQueueAction('remove', visibleRemoveCandidates);
  };

  return (
    <div className="min-h-screen bg-[#f7f7f2] text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 md:px-8 lg:px-10">
        <Header isScanning={isScanning} />

        <main className="mt-8 space-y-8">
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
                active={scanPreset === 'test'}
                label="Test Folder"
                disabled={isBulkActing}
                onClick={() => setScanPreset('test')}
              />
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
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Files Processed</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-900">
                      {scanProgress.files_scanned.toLocaleString()}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Elapsed</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-900">
                      {scanProgress.elapsed_seconds}s
                    </div>
                  </div>

                  <div className="rounded-2xl bg-amber-50 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-amber-500">Review</div>
                    <div className="mt-2 text-2xl font-semibold text-amber-900">
                      {scanProgress.review_total.toLocaleString()}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-sky-50 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-sky-500">Archive</div>
                    <div className="mt-2 text-2xl font-semibold text-sky-900">
                      {scanProgress.archive_total.toLocaleString()}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-rose-50 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-rose-500">Remove</div>
                    <div className="mt-2 text-2xl font-semibold text-rose-900">
                      {scanProgress.remove_total.toLocaleString()}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Duplicates</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-900">
                      {scanProgress.duplicates_total.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3 text-xs text-slate-500">
                <span className="rounded-full bg-slate-100 px-3 py-1">
                  Target: {scanProgress.target}
                </span>
                {typeof scanProgress.excluded_dirs_count === 'number' ? (
                  <span className="rounded-full bg-slate-100 px-3 py-1">
                    Excluded dirs: {scanProgress.excluded_dirs_count}
                  </span>
                ) : null}
                <span className="rounded-full bg-slate-100 px-3 py-1">
                  Status: {scanProgress.status}
                </span>
              </div>
            </section>
          ) : null}

          {scanData ? (
            <>
              {insights && (
                <SectionCard
                  title="DTM Insights"
                  subtitle="High-level interpretation of your current digital environment."
                >
                  <div className="space-y-3 text-sm text-slate-700">
                    <p className="font-medium text-slate-900">{insights.summary}</p>

                    <ul className="space-y-1">
                      <li>• {insights.review} files need review</li>
                      <li>• {insights.archive} files can likely be archived</li>
                      <li>• {insights.remove} files appear safe to remove</li>
                    </ul>

                    <p>
                      Most files have not been modified in over 180 days: {insights.oldFiles}
                    </p>

                    <p className="text-slate-600">
                      Recommendation: Start by reviewing unknown files, then archive older compressed files.
                    </p>
                  </div>
                </SectionCard>
              )}

              {scanData && (
                <section className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 shadow-sm">
                  <div className="space-y-2 text-sm text-slate-700">
                    <div>
                      <span className="font-semibold">Scan mode:</span> {scanData.mode}
                    </div>
                    <div>
                      <span className="font-semibold">Detailed review items shown:</span>{' '}
                      {scanData.review_files.length} of {scanData.review_total}
                    </div>
                    <div>
                      <span className="font-semibold">Detailed archive items shown:</span>{' '}
                      {scanData.archive_candidates.length} of {scanData.archive_total}
                    </div>
                    <div>
                      <span className="font-semibold">Detailed remove items shown:</span>{' '}
                      {scanData.remove_candidates.length} of {scanData.remove_total}
                    </div>
                    <div>
                      <span className="font-semibold">Excluded directories:</span>{' '}
                      {scanData.excluded_dirs_count}
                    </div>

                    {scanData.scan_warnings?.length > 0 ? (
                      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
                        {scanData.scan_warnings.map((warning, index) => (
                          <div key={index}>⚠️ {warning}</div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </section>
              )}
              
              <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Total files" value={scanData.total_files} tone="neutral" />
                <StatCard
                  label="Needs review"
                  value={scanData.review_total}
                  tone={scanData.review_files.length > 0 ? 'warn' : 'good'}
                />
                <StatCard
                  label="Duplicates"
                  value={scanData.duplicates_total}
                  tone={scanData.duplicates.length > 0 ? 'warn' : 'good'}
                />
                <StatCard
                  label="Errors"
                  value={scanData.errors_total}
                  tone={scanData.errors.length > 0 ? 'danger' : 'good'}
                />
              </section>

              <SectionCard
                title="Recent Actions"
                subtitle="A local record of successful maintenance actions performed by DTM."
              >
                <div className="mb-4 flex flex-wrap gap-3">
                  <button
                    onClick={() => setHistoryFilter('undoable')}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                      historyFilter === 'undoable'
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Undo Available
                  </button>

                  <button
                    onClick={() => setHistoryFilter('all')}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                      historyFilter === 'all'
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    All Actions
                  </button>

                  <button
                    onClick={() => setHistoryFilter('restored')}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                      historyFilter === 'restored'
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Restored
                  </button>
                </div>

                <div className="mb-3 text-xs text-slate-500">
                  Showing {filteredActionHistory.length} item{filteredActionHistory.length === 1 ? '' : 's'}
                  {historyFilter === 'undoable'
                    ? ' with undo available'
                    : historyFilter === 'restored'
                    ? ' that have already been restored'
                    : ' from action history'}
                </div>

                {filteredActionHistory.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    {historyFilter === 'undoable'
                      ? 'No undoable actions are currently available.'
                      : historyFilter === 'restored'
                      ? 'No restored actions have been logged yet.'
                      : 'No actions have been logged yet.'}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {filteredActionHistory.map((entry) => {
                      const filename = entry.source_path.split('/').pop() || entry.source_path;

                      const actionLabel =
                      entry.action === 'move_to_review'
                        ? 'Moved to Review'
                        : entry.action === 'move_to_archive'
                        ? 'Moved to Archive'
                        : entry.action === 'move_to_trash'
                        ? 'Moved to Trash'
                        : entry.action === 'restore_from_review'
                        ? 'Restored from Review'
                        : 'Restored from Archive';

                      return (
                        <div
                          key={entry.id}
                          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm font-semibold text-slate-900">
                              {actionLabel}
                            </div>
                            <div className="text-xs text-slate-500">
                              {new Date(entry.timestamp).toLocaleString()}
                            </div>
                          </div>

                          <div className="mt-2 text-sm text-slate-700">{filename}</div>

                          <div className="mt-2 text-xs text-slate-500 break-all">
                            Source: {entry.source_path}
                          </div>

                          {entry.destination_path ? (
                            <div className="mt-1 text-xs text-slate-500 break-all">
                              Destination: {entry.destination_path}
                            </div>
                          ) : null}

                          <div className="mt-3 flex flex-wrap gap-2">
                            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">
                              {entry.mode}
                            </span>
                            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">
                              {entry.status}
                            </span>
                          </div>

                          {canUndoHistoryEntry(entry) ? (
                            <div className="mt-4">
                              <button
                                onClick={() => handleUndoHistoryEntry(entry)}
                                disabled={busyHistoryId === entry.id || isBulkActing || isScanning}
                                className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                              >
                                {busyHistoryId === entry.id ? 'Restoring…' : 'Undo'}
                              </button>
                            </div>
                          ) : null}

                          {!canUndoHistoryEntry(entry) &&
                          (entry.action === 'move_to_review' || entry.action === 'move_to_archive') ? (
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200">
                              already restored
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </SectionCard>

              <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <SectionCard
                  title="Age Buckets"
                  subtitle="How recently files in the scan target were modified."
                >
                  <KeyValueList
                    entries={ageBucketEntries}
                    emptyMessage="No age information available yet."
                  />
                </SectionCard>

                <SectionCard
                  title="Top File Types"
                  subtitle="Most common extensions found in the current scan."
                >
                  <KeyValueList
                    entries={topExtensions}
                    emptyMessage="No file type data available yet."
                  />
                </SectionCard>

                <SectionCard
                  title="Review Queue"
                  subtitle="Quick summary of what this scan says needs attention."
                >
                  <KeyValueList
                    entries={reviewSummary}
                    emptyMessage="No review data available yet."
                  />
                </SectionCard>
              </section>

              <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <SectionCard
                  title="Needs Review"
                  subtitle="Files that need human judgment before DTM can confidently relocate or remove them."
                >
                  {sortedReviewFiles.length > 0 ? (
                    <div className="mb-3 text-xs text-slate-500">
                      Showing {visibleReviewFiles.length} of {scanData.review_total} review items
                    </div>
                  ) : null}

                  {visibleReviewFiles.length > 0 ? (
                    <div className="mb-4 flex flex-wrap gap-3">
                      <button
                        onClick={handleBulkMoveToReview}
                        disabled={
                          isBulkActing ||
                          isScanning ||
                          visibleReviewFiles.length === 0
                        }
                        className="rounded-full bg-amber-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                      >
                        {isBulkActing && bulkProgress?.action === 'review'
                          ? 'Bulk moving…'
                          : `Move visible ${visibleReviewFiles.length} to Review`}
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

                  {scanData.review_files.length === 0 ? (
                    <div className="rounded-2xl bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                      No suspicious files detected in this scan.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {visibleReviewFiles.map((file) => (
                        <div
                          key={file.path}
                          className="flex items-start gap-4 rounded-3xl border border-amber-200 bg-amber-50 p-4"
                        >
                          <FileBadge filename={file.name} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-semibold text-amber-950">{file.name}</h3>
                              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200">
                                {file.category.replace(/_/g, ' ')}
                              </span>
                            </div>
                        
                            <p className="mt-2 break-all text-xs leading-5 text-amber-900/80">
                              {file.path}
                            </p>
                        
                            <div className="mt-3 rounded-2xl bg-white/60 px-3 py-3 space-y-2">
                              <div className="text-xs text-amber-900/80">
                                <span className="font-semibold">Reason:</span> {file.reason}
                              </div>
                              <div className="text-xs text-amber-900/70">
                                <span className="font-semibold">Confidence:</span> {file.confidence}
                              </div>
                              <div className="text-xs text-amber-900/70">
                                <span className="font-semibold">Recommended action:</span> {file.recommended_action}
                              </div>
                            </div>
                        
                            <div className="mt-4 flex flex-wrap gap-3">
                              <button
                                onClick={() => handleMoveToReview(file.path)}
                                disabled={busyPath === file.path || isBulkActing}
                                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                                  busyPath === file.path
                                    ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                                    : 'bg-slate-900 text-white hover:bg-slate-700'
                                }`}
                              >
                                {busyPath === file.path ? 'Moving…' : 'Move to Review'}
                              </button>
                            </div>
                          </div>
                        </div>
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
                  title="Duplicate Review"
                  subtitle="Potential duplicates found with the current fast heuristic."
                >
                  {visibleDuplicates.length > 0 ? (
                    <div className="mb-3 text-xs text-slate-500">
                      Showing {visibleDuplicates.length} of {scanData.duplicates_total} duplicate pairs
                    </div>
                  ) : null}

                  {scanData.duplicates.length === 0 ? (
                    <div className="rounded-2xl bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                      No duplicate pairs detected in this scan.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {visibleDuplicates.map((pair, index) => (
                        <div
                          key={`${pair[0]}-${pair[1]}-${index}`}
                          className="rounded-3xl border border-slate-200 bg-slate-50 p-4"
                        >
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-semibold text-slate-900">
                              Duplicate Pair {index + 1}
                            </div>
                            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">
                              Compare
                            </span>
                          </div>

                          <div className="mt-4 space-y-3">
                            <div className="rounded-2xl bg-white p-3">
                              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
                                Original
                              </div>
                              <div className="mt-2 break-all text-sm text-slate-700">{pair[0]}</div>
                            </div>

                            <div className="rounded-2xl bg-white p-3">
                              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
                                Duplicate
                              </div>
                              <div className="mt-2 break-all text-sm text-slate-700">{pair[1]}</div>
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-3">
                            <button
                              onClick={() => handleArchiveDuplicate(pair[1])}
                              disabled={busyPath === pair[1] || isBulkActing}
                              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                                busyPath === pair[1]
                                  ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                                  : 'bg-sky-900 text-white hover:bg-sky-700'
                              }`}
                            >
                              {busyPath === pair[1] ? 'Archiving…' : 'Archive Duplicate'}
                            </button>
                          </div>
                        </div>
                      ))}

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

              <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <SectionCard
                  title="Archive Candidates"
                  subtitle="Files that are likely worth keeping, but not keeping in your active workspace."
                >
                  {sortedArchiveCandidates.length > 0 ? ( 
                    <div className="mb-3 text-xs text-slate-500">
                      Showing {visibleArchiveCandidates.length} of {scanData.archive_total} archive candidates
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
                          : `Move visible ${visibleArchiveCandidates.length} to Archive`}
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

                  {scanData.archive_candidates.length === 0 ? (
                    <div className="rounded-2xl bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                      No archive candidates detected in this scan.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {visibleArchiveCandidates.map((file) => (
                        <div
                          key={file.path}
                          className="flex items-start gap-4 rounded-3xl border border-sky-200 bg-sky-50 p-4"
                        >
                          <FileBadge filename={file.name} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-semibold text-sky-950">{file.name}</h3>
                              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-sky-800 ring-1 ring-sky-200">
                                {file.category.replace(/_/g, ' ')}
                              </span>
                            </div>
                        
                            <p className="mt-2 break-all text-xs leading-5 text-sky-900/80">
                              {file.path}
                            </p>
                        
                            <div className="mt-3 rounded-2xl bg-white/60 px-3 py-3 space-y-2">
                              <div className="text-xs text-sky-900/80">
                                <span className="font-semibold">Reason:</span> {file.reason}
                              </div>
                              <div className="text-xs text-sky-900/70">
                                <span className="font-semibold">Confidence:</span> {file.confidence}
                              </div>
                              <div className="text-xs text-sky-900/70">
                                <span className="font-semibold">Recommended action:</span> {file.recommended_action}
                              </div>
                            </div>
                        
                            <div className="mt-4 flex flex-wrap gap-3">
                              <button
                                onClick={() => handleMoveToArchive(file.path)}
                                disabled={busyPath === file.path || isBulkActing}
                                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                                  busyPath === file.path
                                    ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                                    : 'bg-sky-900 text-white hover:bg-sky-700'
                                }`}
                              >
                                {busyPath === file.path ? 'Archiving…' : 'Move to Archive'}
                              </button>
                            </div>
                          </div>
                        </div>
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
                  title="Remove Candidates"
                  subtitle="Files that appear disposable, temporary, or low-value based on current rules."
                >
                  {sortedRemoveCandidates.length > 0 ? (
                    <div className="mb-3 text-xs text-slate-500">
                      Showing {visibleRemoveCandidates.length} of {scanData.remove_total} remove candidates
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

                  {scanData.remove_candidates.length === 0 ? (
                    <div className="rounded-2xl bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                      No remove candidates detected in this scan.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {visibleRemoveCandidates.map((file) => (
                        <div
                          key={file.path}
                          className="flex items-start gap-4 rounded-3xl border border-rose-200 bg-rose-50 p-4"
                        >
                          <FileBadge filename={file.name} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-semibold text-rose-950">{file.name}</h3>
                              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-rose-800 ring-1 ring-rose-200">
                                {file.category.replace(/_/g, ' ')}
                              </span>
                            </div>
                        
                            <p className="mt-2 break-all text-xs leading-5 text-rose-900/80">
                              {file.path}
                            </p>
                        
                            <div className="mt-3 rounded-2xl bg-white/60 px-3 py-3 space-y-2">
                              <div className="text-xs text-rose-900/80">
                                <span className="font-semibold">Reason:</span> {file.reason}
                              </div>
                              <div className="text-xs text-rose-900/70">
                                <span className="font-semibold">Confidence:</span> {file.confidence}
                              </div>
                              <div className="text-xs text-rose-900/70">
                                <span className="font-semibold">Recommended action:</span> {file.recommended_action}
                              </div>
                            </div>
                        
                            <div className="mt-4 flex flex-wrap gap-3">
                              <button
                                onClick={() => handleMoveToTrash(file.path)}
                                disabled={busyPath === file.path || isBulkActing}
                                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                                  busyPath === file.path
                                    ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                                    : 'bg-rose-900 text-white hover:bg-rose-700'
                                }`}
                              >
                                {busyPath === file.path ? 'Removing…' : 'Move to Trash'}
                              </button>
                            </div>
                          </div>
                        </div>
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
              </section>

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
              ) : null}

              <SectionCard
                title="Debug Output"
                subtitle="Raw scan payload retained while the product evolves."
              >
                <div className="max-h-[28rem] overflow-y-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-200">
                  <pre className="whitespace-pre-wrap break-words">{scanOutput}</pre>
                </div>
              </SectionCard>
            </>
          ) : !isScanning ? (
            <section className="rounded-[2rem] border border-slate-200 bg-white p-10 shadow-sm">
              <div className="max-w-2xl">
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-400">
                  Ready
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
                  Run a scan to populate the maintenance dashboard
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-500">
                  Start with your test folder for rapid iteration, then switch to Desktop when
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