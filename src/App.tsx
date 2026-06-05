import { useEffect, useMemo, useReducer, useState } from 'react';
import Header from './components/Header';
import ScanButton from './components/ScanButton';
import InfoPanel from './components/InfoPanel';
import QueueFileCard from './components/QueueFileCard';
import FileBadge from './components/FileBadge';
import type {
  ScanPreset,
  SortKey,
  SortDirection,
  ClassifiedFile,
  DuplicateGroup,
  DuplicateGroupItem,
  ScanResult,
  CsvScanResult,
} from './types/dtm';

type QueueFilter = {
  label: string;
  key: 'context_type' | 'reason' | 'recommended_action' | 'file_kind' | 'user_relevance';
  value: string;
} | null;

type BatchPreview = {
  filter: Exclude<QueueFilter, null>;
  action: 'archive' | 'remove' | 'keep';
  items: ClassifiedFile[];
  total: number;
} | null;

type SourceQueue = 'review' | 'archive' | 'remove' | 'duplicate';

type SessionFileAction = 'keep' | 'archive' | 'remove';

type InsightActionType = 'archive' | 'remove';

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

type ActiveQueueFilter = Exclude<QueueFilter, null>;

type ActionHistoryEntry = {
  id: string;
  timestamp: string;
  action:
    | 'move_to_review'
    | 'move_to_archive'
    | 'move_to_trash'
    | 'restore_from_review'
    | 'restore_from_archive'
    | 'restore_from_trash';
  source_path: string;
  destination_path?: string | null;
  status: 'success' | 'error';
  mode: 'single' | 'bulk';
  reverts_history_id?: string | null;
};

type DatasetDecision =
  | 'approved_duplicate'
  | 'legitimate_records'
  | 'needs_review'
  | 'ignored'
  | 'pending';

type DatasetDecisionRecord = {
  group_id: string;
  decision: DatasetDecision;
  csv_path?: string;
  updated_at: string;
};

type SuspiciousDecision =
  | 'pending'
  | 'valid_data'
  | 'corrupted'
  | 'needs_review'
  | 'ignored';

type SuspiciousDecisionRecord = {
  issue_id: string;
  decision: SuspiciousDecision;
  csv_path?: string;
  row_number: number;
  column: string;
  updated_at: string;
};

type ReviewCapacity = 25 | 50 | 100 | 250 | 'all';

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

function InsightList({
  entries,
  emptyMessage,
  onSelect,
  activeFilter,
  getMatchCount,
  getAction,
  onPreviewRequest,
}: {
  entries: Array<{ label: string; count: number }>;
  emptyMessage: string;
  onSelect?: (entry: { label: string; count: number }) => void;
  activeFilter?: QueueFilter;
  getMatchCount?: (entry: { label: string; count: number }) => number;
  getAction?: (entry: { label: string; count: number }) => InsightActionType | null;
  onPreviewRequest?: (
    entry: { label: string; count: number },
    action: InsightActionType
  ) => void;
}) {
  if (!entries || entries.length === 0) {
    return <p className="text-sm text-slate-500">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => {
        const isActive = Boolean(activeFilter && activeFilter.value === entry.label);
        const matchCount = getMatchCount ? getMatchCount(entry) : entry.count;
        const hasActionableMatches = matchCount > 0;

        return (
          <div
            key={entry.label}
            className={`rounded-2xl border px-4 py-4 transition ${
              isActive
                ? 'border-sky-300 bg-sky-50'
                : 'border-slate-200 bg-slate-50'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`mt-1 h-7 w-7 shrink-0 rounded-lg ${
                  isActive ? 'bg-sky-100 text-sky-800' : 'bg-white text-slate-500'
                } flex items-center justify-center text-xs font-bold ring-1 ring-slate-200`}
              >
                {hasActionableMatches ? '→' : '·'}
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-900">
                  {entry.label.replace(/_/g, ' ')}
                </div>

                <div className="mt-1 text-xs leading-5 text-slate-600">
                {entry.count.toLocaleString()} total pattern match
                {entry.count === 1 ? '' : 'es'}
                {getMatchCount ? (
                  <>
                    {' '}· {matchCount.toLocaleString()} visible through queue focus
                  </>
                ) : null}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {onSelect && hasActionableMatches ? (
                    <button
                      onClick={() => onSelect(entry)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        isActive
                          ? 'bg-sky-900 text-white'
                          : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {isActive ? 'Inspecting' : 'Inspect'}
                    </button>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-400">
                      No queue matches
                    </span>
                  )}

                  {(() => {
                    const action = getAction?.(entry) ?? null;

                    if (!action || !onPreviewRequest || !hasActionableMatches) {
                      return null;
                    }

                    return (
                      <button
                        onClick={() => onPreviewRequest(entry, action)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold text-white transition ${
                          action === 'archive'
                            ? 'bg-sky-900 hover:bg-sky-700'
                            : 'bg-rose-900 hover:bg-rose-700'
                        }`}
                      >
                        {action === 'archive' ? 'Preview Archive' : 'Preview Remove'}
                      </button>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        );
      })}
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

function ReviewCapacityControl({
  label,
  value,
  total,
  visible,
  onChange,
}: {
  label: string;
  value: ReviewCapacity;
  total: number;
  visible: number;
  onChange: (value: ReviewCapacity) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="text-xs text-slate-500">
        Showing <span className="font-semibold text-slate-800">{visible}</span> of{' '}
        <span className="font-semibold text-slate-800">{total}</span>
      </div>

      <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </label>

      <select
        value={String(value)}
        onChange={(event) => {
          const next = event.target.value;
          onChange(next === 'all' ? 'all' : (Number(next) as ReviewCapacity));
        }}
        className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm outline-none transition hover:bg-slate-50"
      >
        <option value="25">25</option>
        <option value="50">50</option>
        <option value="100">100</option>
        <option value="250">250</option>
        <option value="all">All</option>
      </select>
    </div>
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
          <option value="review_priority">Review priority</option>
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

function applyReviewCapacity<T>(
  items: T[],
  capacity: ReviewCapacity
) {
  if (capacity === 'all') return items;
  return items.slice(0, capacity);
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes}m ${remainingSeconds}s`;
}

function App() {
  const [scanOutput, setScanOutput] = useState<string>('No scan yet.');
  const [scanData, setScanData] = useState<ScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanPreset, setScanPreset] = useState<ScanPreset>('test');
  const [customPath, setCustomPath] = useState('');
  const [showSystemFiles, setShowSystemFiles] = useState(false);
  const [csvPath, setCsvPath] = useState('');
  const [actionStatus, setActionStatus] = useState<{
    tone: 'success' | 'error';
    message: string;
  } | null>(null);

  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);

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

  const [actionHistory, setActionHistory] = useState<ActionHistoryEntry[]>([]);

  const [datasetDecisions, setDatasetDecisions] = useState<
    Record<string, DatasetDecisionRecord>
  >({});

  const [busyDatasetDecisionId, setBusyDatasetDecisionId] = useState<string | null>(null);

  const [suspiciousDecisions, setSuspiciousDecisions] = useState<
    Record<string, SuspiciousDecisionRecord>
  >({});

  const [busySuspiciousDecisionId, setBusySuspiciousDecisionId] = useState<string | null>(null);

  const [busyHistoryId, setBusyHistoryId] = useState<string | null>(null);

  const [historyFilter, setHistoryFilter] = useState<'undoable' | 'all' | 'restored'>('undoable');

  const [duplicatePrimarySelections, setDuplicatePrimarySelections] = useState<Record<string, string>>({});
  const [busyDuplicateGroupId, setBusyDuplicateGroupId] = useState<string | null>(null);

  const [isSupportOpen, setIsSupportOpen] = useState(false);

  const [activeQueueFilter, setActiveQueueFilter] = useState<QueueFilter>(null);

  const [csvData, setCsvData] = useState<CsvScanResult | null>(null);

  const [lastCsvExportPath, setLastCsvExportPath] = useState<string | null>(null);

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

  const [csvReviewSession, setCsvReviewSession] = useState<{
    csv_path: string;
    session_id: string;
    last_updated: string | null;
  } | null>(null);

  const [duplicateReviewCapacity, setDuplicateReviewCapacity] =
  useState<ReviewCapacity>(25);

  const [suspiciousReviewCapacity, setSuspiciousReviewCapacity] =
    useState<ReviewCapacity>(25);

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
      loadDatasetDecisions();

      dispatchSession({ type: 'RESET_AFTER_RESCAN' });

      try {
        const parsed = JSON.parse(output);
      
        if (parsed.type === 'csv_scan') {
          setCsvData(parsed);
          setScanData(null);
          loadDatasetDecisions();
          loadCsvReviewSession(parsed.path);
          return;
        }
      
        setScanData(parsed);
        setCsvData(null);
      } catch {
        setScanData(null);
        setCsvData(null);
      }
    });

    const unsubscribeProgress = window.electronAPI?.onScanProgress?.((data) => {
      if ('rows_scanned' in data) {
        setScanProgress({
          type: 'csv_progress',
          status: data.status,
          target: data.target,
          rows_scanned: data.rows_scanned,
          rows_per_second: data.rows_per_second,
          elapsed_seconds: data.elapsed_seconds,
          current_stage: data.current_stage,
          duplicate_candidates: data.duplicate_candidates,
          suspicious_values: data.suspicious_values,
          missing_values: data.missing_values,
          total_rows_estimate: data.total_rows_estimate,
        });
      
        return;
      }
      
      setScanProgress({
        type: 'progress',
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
      case 'csv':
        return 'CSV Dataset';
      case 'test':
      default:
        return 'Test Folder';
    }
  }, [scanPreset]);

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

  const reviewPrioritySummary = useMemo(() => {
    if (!scanData) return [];

    const counts = {
      high: 0,
      medium: 0,
      low: 0,
    };

    for (const file of scanData.review_files) {
      if (file.review_priority === 'high') counts.high += 1;
      else if (file.review_priority === 'medium') counts.medium += 1;
      else if (file.review_priority === 'low') counts.low += 1;
    }

    return [
      ['High priority', counts.high],
      ['Medium priority', counts.medium],
      ['Low priority', counts.low],
    ] as Array<[string, number]>;
  }, [scanData]);

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

  const handleBrowseForCsv = async () => {
    try {
      const result = await window.electronAPI?.browseForCsv?.();
  
      if (result?.success && result.path) {
        setCsvPath(result.path);
        setActionStatus(null);
      }
    } catch (error) {
      setActionStatus({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Failed to open CSV picker.',
      });
    }
  };

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

  const loadActionHistory = async () => {
    try {
      const history = await window.electronAPI?.getActionHistory?.(100);

      setActionHistory(
        Array.isArray(history) ? (history as ActionHistoryEntry[]) : []
      );
    } catch {
      setActionHistory([]);
    }
  };

  const loadDatasetDecisions = async () => {
    try {
      const result = await window.electronAPI?.getDatasetDecisions?.();
  
      if (result?.success && result.decisions) {
        setDatasetDecisions(result.decisions);
      }
    } catch {
      setDatasetDecisions({});
    }
  };

  const handleClearActionHistory = async () => {
    try {
      const result = await window.electronAPI?.clearActionHistory?.();
  
      if (result?.success) {
        setActionHistory([]);
        setActionStatus({
          tone: 'success',
          message: result.message,
        });
      } else {
        setActionStatus({
          tone: 'error',
          message: result?.message || 'Failed to clear action history.',
        });
      }
    } catch (error) {
      setActionStatus({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unexpected clear history failure.',
      });
    }
  };

  const canUndoHistoryEntry = (entry: ActionHistoryEntry) => {
    if (
      entry.status !== 'success' ||
      (
        entry.action !== 'move_to_review' &&
        entry.action !== 'move_to_archive' &&
        entry.action !== 'move_to_trash'
      ) ||
      !entry.source_path ||
      !entry.destination_path
    ) {
      return false;
    }

    const alreadyRestored = actionHistory.some((historyEntry) => {
      return (
        (
          historyEntry.action === 'restore_from_review' ||
          historyEntry.action === 'restore_from_archive' ||
          historyEntry.action === 'restore_from_trash'
        ) &&
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
          entry.action === 'restore_from_archive' ||
          entry.action === 'restore_from_trash'
      );
    }

    return actionHistory;
  }, [actionHistory, historyFilter]);


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

  const handleScan = () => {
    if (isBulkActing) {
      setActionStatus({
        tone: 'error',
        message: 'Bulk action in progress. Please wait until it finishes before starting a new scan.',
      });
      return;
    }
  
    setScanProgress(null);
  
    const normalizedCustomPath = customPath.trim();
    const normalizedCsvPath = csvPath.trim();
  
    if (scanPreset === 'custom' && !normalizedCustomPath) {
      setActionStatus({
        tone: 'error',
        message: 'Please enter a folder path before scanning a custom location.',
      });
      return;
    }
  
    if (scanPreset === 'custom' && normalizedCustomPath === '/') {
      setActionStatus({
        tone: 'error',
        message:
          'Scanning the system root is restricted in the current safe mode. Choose a more specific folder.',
      });
      return;
    }
  
    if (scanPreset === 'csv' && !normalizedCsvPath) {
      setActionStatus({
        tone: 'error',
        message: 'Please choose or enter a CSV file path before scanning a CSV dataset.',
      });
      return;
    }
  
    setIsScanning(true);
    setScanData(null);
    setCsvData(null);
    setActionStatus(null);
    setScanOutput(`Scanning ${scanTargetLabel}... Please wait.`);
  
    window.electronAPI?.sendScanRequest?.({
      preset: scanPreset,
      customPath: normalizedCustomPath,
      csvPath: normalizedCsvPath,
    });
  };

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
  
  const reconcilePatternAfterBatchAction = (
    preview: Exclude<BatchPreview, null>,
    actedItems: ClassifiedFile[]
  ) => {
    if (actedItems.length === 0) return;
  
    const actedPathSet = new Set(actedItems.map((item) => item.path));
    const patternKey = `${preview.filter.key}:${preview.filter.value}`;
    const decrement = actedItems.length;
  
    setScanData((prev) => {
      if (!prev?.scan_insights) return prev;
  
      const existingPreview = prev.scan_insights.pattern_previews?.[patternKey];
  
      const updatedPatternPreview = existingPreview
        ? {
            ...existingPreview,
            review: {
              ...existingPreview.review,
              items: existingPreview.review.items.filter((item) => !actedPathSet.has(item.path)),
            },
            archive: {
              ...existingPreview.archive,
              total:
                preview.action === 'archive'
                  ? Math.max(0, existingPreview.archive.total - decrement)
                  : existingPreview.archive.total,
              items: existingPreview.archive.items.filter((item) => !actedPathSet.has(item.path)),
            },
            remove: {
              ...existingPreview.remove,
              total:
                preview.action === 'remove'
                  ? Math.max(0, existingPreview.remove.total - decrement)
                  : existingPreview.remove.total,
              items: existingPreview.remove.items.filter((item) => !actedPathSet.has(item.path)),
            },
          }
        : null;
  
      return {
        ...prev,
        scan_insights: {
          ...prev.scan_insights,
          review_context_summary:
            preview.filter.key === 'context_type'
              ? decrementInsightEntries(
                  prev.scan_insights.review_context_summary,
                  preview.filter.value,
                  decrement
                )
              : prev.scan_insights.review_context_summary,
  
          top_review_reasons:
            preview.filter.key === 'reason'
              ? decrementInsightEntries(
                  prev.scan_insights.top_review_reasons,
                  preview.filter.value,
                  decrement
                )
              : prev.scan_insights.top_review_reasons,
  
          pattern_previews: updatedPatternPreview
            ? {
                ...prev.scan_insights.pattern_previews,
                [patternKey]: updatedPatternPreview,
              }
            : prev.scan_insights.pattern_previews,
        },
      };
    });
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
    if (busyDuplicateGroupId || isBulkActing || isScanning) return;

    setBusyPath(duplicatePath);
    setActionStatus(null);

    try {
      const result = await performQueueAction('archive', duplicatePath, {
        rescanAfterSuccess: false,
        mode: 'single',
      });

      if (result.success) {
        removeDuplicateFromQueue(duplicatePath);
        await loadActionHistory();

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
          rescanAfterSuccess: false,
          mode: 'bulk',
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
    
      await loadActionHistory();
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
            ? `Restored file: ${result.destination}. Refresh scan when you want to reconcile results.`
            : `${result.message} Refresh scan when you want to reconcile results.`,
        });

        await loadActionHistory();
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

  const reviewSummary = useMemo(() => {
    if (!scanData) return [];
    return [
      ['Needs review', scanData.review_total],
      ['Archive candidates', scanData.archive_total],
      ['Remove candidates', scanData.remove_total],
      ['Duplicate groups', scanData.duplicates_total],
      ['Excluded directories', scanData.excluded_dirs_count],
      ['Folder scanned', scanData.folder],
      ['Mode', scanData.mode],
    ] as Array<[string, number | string]>;
  }, [scanData]);

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
  }, [sortedRemoveCandidates, activeQueueFilter]);

  const handleInsightAction = async (
    sectionKind: InsightSectionKind,
    entry: { label: string; count: number },
    action: InsightActionType
  ) => {
    const filter: Exclude<QueueFilter, null> = {
      label: entry.label,
      key: sectionKind,
      value: entry.label,
    };
  
    const matchingReviewFiles = applyQueueFilter(sortedReviewFiles, filter);
    const matchingArchiveFiles = applyQueueFilter(sortedArchiveCandidates, filter);
    const matchingRemoveFiles = applyQueueFilter(sortedRemoveCandidates, filter);
  
    if (action === 'archive') {
      if (matchingReviewFiles.length === 0 && matchingArchiveFiles.length === 0) {
        setActionStatus({
          tone: 'error',
          message: `No archiveable files found for "${entry.label}".`,
        });
        return;
      }
  
      if (matchingReviewFiles.length > 0) {
        await handleBulkQueueAction('review', 'archive', matchingReviewFiles);
      }
  
      if (matchingArchiveFiles.length > 0) {
        await handleBulkQueueAction('archive', 'archive', matchingArchiveFiles);
      }
  
      return;
    }
  
    if (action === 'remove') {
      if (matchingReviewFiles.length === 0 && matchingRemoveFiles.length === 0) {
        setActionStatus({
          tone: 'error',
          message: `No removable files found for "${entry.label}".`,
        });
        return;
      }
  
      if (matchingReviewFiles.length > 0) {
        await handleBulkQueueAction('review', 'remove', matchingReviewFiles);
      }
  
      if (matchingRemoveFiles.length > 0) {
        await handleBulkQueueAction('remove', 'remove', matchingRemoveFiles);
      }
    }
  };

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

  const getCurrentScanPayload = () => ({
    preset: scanPreset,
    customPath: customPath.trim(),
    csvPath: csvPath.trim(),
  });

  const getFilterMatchCount = (filter: Exclude<QueueFilter, null>) => {
    return (
      applyQueueFilter(sortedReviewFiles, filter).length +
      applyQueueFilter(sortedArchiveCandidates, filter).length +
      applyQueueFilter(sortedRemoveCandidates, filter).length
    );
  };

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
      removePathFromQueues(filePath);
    
      await loadActionHistory();
    
      if (rescanAfterSuccess) {
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
  
          dispatchSession({
            type: 'FILE_ACTION_SUCCEEDED',
            sourceQueue,
            fileAction:
              actionType === 'archive'
                ? 'archive'
                : actionType === 'remove'
                ? 'remove'
                : 'keep',
            filePath: file.path,
          });
        } else {
          failureCount += 1;
        }
      } catch {
        failureCount += 1;
      }
    }
  
    setBulkProgress(null);
    setIsBulkActing(false);
  
    const actionLabel =
      actionType === 'review'
        ? 'sent to review'
        : actionType === 'archive'
        ? 'archived'
        : 'moved to Trash';
  
    if (failureCount === 0) {
      setActionStatus({
        tone: 'success',
        message: `Action complete: ${successCount} visible file${successCount === 1 ? '' : 's'} ${actionLabel}. Refresh when ready to reconcile.`,
      });
    } else {
      setActionStatus({
        tone: 'error',
        message: `Bulk action finished with partial success: ${successCount} succeeded, ${failureCount} failed.`,
      });
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

  const buildBatchPreview = (
    items: ClassifiedFile[],
    filter: ActiveQueueFilter,
    action: 'archive' | 'remove' | 'keep'
  ) => {
    const filtered = applyQueueFilter(items, filter);

    return {
      filter,
      action,
      items: filtered.slice(0, 20),
      total: filtered.length,
    };
  };

  const getPatternPreview = (
    filter: Exclude<QueueFilter, null>,
    action: 'archive' | 'remove' | 'keep'
  ) => {
    const key = `${filter.key}:${filter.value}`;
    const preview = scanData?.scan_insights?.pattern_previews?.[key];
  
    if (!preview) return null;
  
    if (action === 'archive') {
      return {
        filter,
        action,
        items: preview.archive.items,
        total: preview.archive.total,
      };
    }
  
    if (action === 'remove') {
      return {
        filter,
        action,
        items: preview.remove.items,
        total: preview.remove.total,
      };
    }
  
    return {
      filter,
      action,
      items: preview.review.items,
      total: preview.review.total,
    };
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
    setLastCsvExportPath(null);
  
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
  
      if (result?.success) {
        setLastCsvExportPath(result.export_path || null);
      }
  
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

  const handleSaveDatasetDecision = async (
    groupId: string,
    decision: DatasetDecision
  ) => {
    if (!csvData?.success) return;
  
    setBusyDatasetDecisionId(groupId);
    setActionStatus(null);
  
    try {
      const result = await window.electronAPI?.saveDatasetDecision?.({
        group_id: groupId,
        decision,
        csv_path: csvData.path,
      });
  
      if (result?.success && result.decision) {
        setDatasetDecisions((prev) => ({
          ...prev,
          [groupId]: result.decision as DatasetDecisionRecord,
        }));
  
        setActionStatus({
          tone: 'success',
          message: result.message,
        });
      } else {
        setActionStatus({
          tone: 'error',
          message: result?.message || 'Failed to save dataset decision.',
        });
      }
    } catch (error) {
      setActionStatus({
        tone: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Unexpected dataset decision failure.',
      });
    } finally {
      setBusyDatasetDecisionId(null);
    }
  };

  const getSuspiciousIssueId = (example: {
    row_number: number;
    column: string;
  }) => {
    return `suspicious-${example.row_number}-${example.column}`;
  };

  useEffect(() => {
    if (!csvData?.success || !csvData.path) return;
  
    const timeoutId = window.setTimeout(() => {
      window.electronAPI?.saveCsvReviewSession?.({
        csv_path: csvData.path,
        duplicate_decisions: datasetDecisions,
        suspicious_decisions: suspiciousDecisions,
      });
    }, 500);
  
    return () => window.clearTimeout(timeoutId);
  }, [csvData?.path, csvData?.success, datasetDecisions, suspiciousDecisions]);

  const loadCsvReviewSession = async (csvPath: string) => {
    try {
      const result = await window.electronAPI?.loadCsvReviewSession?.({
        csv_path: csvPath,
      });
  
      if (result?.success && result.session) {
        setCsvReviewSession({
          csv_path: result.session.csv_path,
          session_id: result.session.session_id,
          last_updated: result.session.last_updated,
        });
  
        if (result.session.duplicate_decisions) {
          setDatasetDecisions(
            result.session.duplicate_decisions as Record<string, DatasetDecisionRecord>
          );
        }

        if (result.session.suspicious_decisions) {
          setSuspiciousDecisions(
            result.session.suspicious_decisions as Record<string, SuspiciousDecisionRecord>
          );
        }
      }
    } catch {
      setCsvReviewSession(null);
    }
  };

  const handleSaveSuspiciousDecision = async (
    example: {
      row_number: number;
      column: string;
    },
    decision: SuspiciousDecision
  ) => {
    if (!csvData?.success) return;
  
    const issueId = getSuspiciousIssueId(example);
  
    setBusySuspiciousDecisionId(issueId);
    setActionStatus(null);
  
    const record: SuspiciousDecisionRecord = {
      issue_id: issueId,
      decision,
      csv_path: csvData.path,
      row_number: example.row_number,
      column: example.column,
      updated_at: new Date().toISOString(),
    };
  
    try {
      setSuspiciousDecisions((prev) => ({
        ...prev,
        [issueId]: record,
      }));
  
      setActionStatus({
        tone: 'success',
        message: `Saved suspicious value decision: ${decision.replace(/_/g, ' ')}`,
      });
    } catch (error) {
      setActionStatus({
        tone: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Unexpected suspicious value decision failure.',
      });
    } finally {
      setBusySuspiciousDecisionId(null);
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

  const handleBulkDatasetDecision = async (decision: DatasetDecision) => {
    if (!csvData?.success || filteredDuplicateGroups.length === 0) return;
  
    setActionStatus(null);
  
    let successCount = 0;
    let failureCount = 0;
  
    for (const group of filteredDuplicateGroups) {
      try {
        const result = await window.electronAPI?.saveDatasetDecision?.({
          group_id: group.group_id,
          decision,
          csv_path: csvData.path,
        });
  
        if (result?.success && result.decision) {
          successCount += 1;
  
          setDatasetDecisions((prev) => ({
            ...prev,
            [group.group_id]: result.decision as DatasetDecisionRecord,
          }));
        } else {
          failureCount += 1;
        }
      } catch {
        failureCount += 1;
      }
    }
  
    setActionStatus({
      tone: failureCount === 0 ? 'success' : 'error',
      message:
        failureCount === 0
          ? `Applied "${decision.replace(/_/g, ' ')}" to ${successCount} visible group${successCount === 1 ? '' : 's'}.`
          : `Bulk decision finished with partial success: ${successCount} saved, ${failureCount} failed.`,
    });
  };

  const filteredDuplicateGroups = useMemo(() => {
    let groups =
      reviewQueueFilter === 'high'
        ? csvData?.duplicate_group_samples?.high_priority ?? []
        : reviewQueueFilter === 'medium'
        ? csvData?.duplicate_group_samples?.medium_priority ?? []
        : reviewQueueFilter === 'low'
        ? csvData?.duplicate_group_samples?.low_priority ?? []
        : csvData?.duplicate_groups ?? [];
  
    if (decisionFilter !== 'all') {
      groups = groups.filter((group) => {
        const decision = datasetDecisions[group.group_id]?.decision || 'pending';
        return decision === decisionFilter;
      });
    }
  
    return groups;
  }, [csvData, reviewQueueFilter, decisionFilter, datasetDecisions]);

  const filteredSuspiciousExamples = useMemo(() => {
    const examples = csvData?.suspicious_value_summary?.examples ?? [];
  
    if (suspiciousDecisionFilter === 'all') {
      return examples;
    }
  
    return examples.filter((example) => {
      const issueId = getSuspiciousIssueId(example);
      const decision = suspiciousDecisions[issueId]?.decision || 'pending';
  
      return decision === suspiciousDecisionFilter;
    });
  }, [csvData, suspiciousDecisionFilter, suspiciousDecisions]);

  const visibleDuplicateGroupsForReview = useMemo(() => {
    return applyReviewCapacity(filteredDuplicateGroups, duplicateReviewCapacity);
  }, [filteredDuplicateGroups, duplicateReviewCapacity]);
  
  const visibleSuspiciousExamplesForReview = useMemo(() => {
    return applyReviewCapacity(filteredSuspiciousExamples, suspiciousReviewCapacity);
  }, [filteredSuspiciousExamples, suspiciousReviewCapacity]);

  const datasetDecisionSummary = useMemo(() => {
    const groups = csvData?.duplicate_groups ?? [];
  
    const counts = {
      totalVisible: groups.length,
      approved_duplicate: 0,
      legitimate_records: 0,
      needs_review: 0,
      ignored: 0,
      pending: 0,
      reviewed: 0,
    };
  
    for (const group of groups) {
      const decision = datasetDecisions[group.group_id]?.decision || 'pending';
  
      if (decision === 'approved_duplicate') counts.approved_duplicate += 1;
      else if (decision === 'legitimate_records') counts.legitimate_records += 1;
      else if (decision === 'needs_review') counts.needs_review += 1;
      else if (decision === 'ignored') counts.ignored += 1;
      else counts.pending += 1;
    }
  
    counts.reviewed =
      counts.approved_duplicate +
      counts.legitimate_records +
      counts.needs_review +
      counts.ignored;
  
    return counts;
  }, [csvData, datasetDecisions]);

  const suspiciousExamples =
    csvData?.suspicious_value_summary?.examples ?? [];

  const suspiciousReviewedCount =
    Object.keys(suspiciousDecisions).length;

  const suspiciousPendingCount =
    suspiciousExamples.length - suspiciousReviewedCount;

  const suspiciousCompletionPercentage =
    suspiciousExamples.length === 0
      ? 0
      : Math.round(
          (suspiciousReviewedCount /
            suspiciousExamples.length) *
            100
        );
  
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
        {isSupportOpen && (
          <>
            {/* BACKDROP */}
            <div
              className="fixed inset-0 z-40 bg-black/30"
              onClick={() => setIsSupportOpen(false)}
            />

            {/* DRAWER */}
            <div className="fixed left-0 top-0 z-50 h-full w-[340px] overflow-y-auto border-r border-slate-200 bg-white shadow-2xl">
              <div className="p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-900">
                    Workspace Support
                  </div>
                </div>
                  {/* LEFT SUPPORT RAIL */}
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
                      <div className="max-h-[26rem] overflow-y-auto space-y-3 pr-1">
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
                            : entry.action === 'restore_from_archive'
                            ? 'Restored from Archive'
                            : 'Restored from Trash';

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
                              (
                                entry.action === 'move_to_review' ||
                                entry.action === 'move_to_archive' ||
                                entry.action === 'move_to_trash'
                              ) ? (
                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200">
                                  already restored
                                </span>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
                        Dev Utility
                      </div>

                      <p className="mt-1 text-xs leading-5 text-amber-800">
                        Clears local action history only. This does not restore, move, delete, or modify any files.
                      </p>

                      <button
                        onClick={handleClearActionHistory}
                        disabled={isBulkActing || isScanning}
                        className="mt-3 rounded-full bg-amber-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                      >
                        Clear Local History
                      </button>
                    </div>
                  </SectionCard>

                  {scanData && (
                    <SectionCard
                      title="Scan Summary"
                      subtitle="current Scan scope and bounded result coverage"
                    >
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
                    </SectionCard>
                  )}

                  {scanData && scanData.errors_total > 0 ? (
                    <SectionCard
                      title="Scan Access Notes"
                      subtitle="Files DTM could not inspect during this scan."
                    >
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                        <p>
                          DTM skipped or could not inspect {scanData.errors_total} file
                          {scanData.errors_total === 1 ? '' : 's'} during this scan.
                        </p>

                        <p className="mt-2 text-xs leading-5 text-slate-500">
                          This is common on active systems. Some files may be temporary,
                          protected by the operating system, or created and removed while
                          scanning.
                        </p>
                      </div>
                    </SectionCard>
                  ) : null}

                  <SectionCard
                    title="Action Insights"
                    subtitle="What each queue means and how DTM thinks about file decisions."
                  >
                    <div className="space-y-3">
                      <InfoPanel title="How does DTM work?">
                        <p>
                          DTM scans your files and turns them into decision queues instead of showing everything at once.
                        </p>
                        <p>
                          It is designed to be bounded, explainable, and reversible. DTM suggests actions, but you stay in control.
                        </p>
                      </InfoPanel>

                      <InfoPanel title="What does 'Needs Decision' mean?">
                        <p>
                          These files require a user decision before DTM should archive, remove, or keep them in place.
                        </p>
                        <p>
                          This queue protects user control by keeping uncertain choices explicit.
                        </p>
                      </InfoPanel>

                      <InfoPanel title="What are 'Archive Candidates'?">
                        <p>
                          These files are likely worth keeping, but not keeping in your active workspace.
                        </p>
                        <p>
                          Archiving reduces clutter without destroying information.
                        </p>
                      </InfoPanel>

                      <InfoPanel title="What is the 'Remove Queue'?">
                        <p>
                          These files appear temporary, disposable, or low-value based on DTM’s current scan logic.
                        </p>
                        <p>
                          DTM moves them to Trash rather than permanently deleting them.
                        </p>
                      </InfoPanel>

                      <InfoPanel title="How do duplicate groups work?">
                        <p>
                          DTM groups files that appear to be copies of the same item family based on name patterns, size, and structure.
                        </p>
                        <p>
                          You can select one copy to keep active and archive the others.
                        </p>
                      </InfoPanel>

                      <InfoPanel title="What does confidence mean?">
                        <p>
                          Confidence reflects how strongly DTM believes a file belongs in a category.
                        </p>
                        <p>
                          High confidence means a stronger heuristic match. Lower confidence means more ambiguity.
                        </p>
                      </InfoPanel>
                    </div>
                  </SectionCard>
              </div>
            </div>
          </>
        )}

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

                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-sky-800 ring-1 ring-sky-200">
                          {csvReviewSession?.last_updated ? 'Session restored' : 'New session'}
                        </span>
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
                            {Object.keys(datasetDecisions).length}
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

                    <div className="mb-4 flex items-start justify-between gap-4">
                      <button
                          onClick={() => handleCsvAction('export_clean_copy')}
                          className="rounded-full bg-emerald-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800"
                        >
                          Export clean copy
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

                        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
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

                          <ReviewCapacityControl
                            label="Review Capacity"
                            value={duplicateReviewCapacity}
                            total={filteredDuplicateGroups.length}
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

                        {(csvData.duplicate_groups ?? []).length === 0 ? (
                          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                            No duplicate-like record groups detected.
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
                                    <div className="text-sm font-semibold text-slate-900">
                                      Duplicate Group {index + 1}
                                    </div>

                                    <div className="mt-1 text-xs text-slate-500">
                                      {group.rows_total} rows · confidence: {group.confidence}
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

                        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                          <div className="relative">
                            <button
                              onClick={() => {
                                setShowSuspiciousExportMenu((value) => !value);
                                setShowDuplicateExportMenu(false);
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

                          <ReviewCapacityControl
                            label="Review Capacity"
                            value={suspiciousReviewCapacity}
                            total={filteredSuspiciousExamples.length}
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
                                  )
                                  setSuspiciousReviewCapacity(25);
                                }
                              }
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
                            style={{
                              width: `${suspiciousCompletionPercentage}%`,
                            }}
                          />
                        </div>

                        <p className="mt-2 text-xs text-slate-500">
                          {suspiciousReviewedCount} of {suspiciousExamples.length} suspicious values reviewed.
                        </p>

                        {filteredSuspiciousExamples.length === 0 ? (
                          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                            No suspicious value examples detected.
                          </div>
                        ) : (
                          <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">
                            {visibleSuspiciousExamplesForReview.map((example, index) => (
                              <div
                                key={`${example.row_number}-${example.column}-${index}`}
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

                                  <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-medium text-rose-800 ring-1 ring-rose-200">
                                    review
                                  </span>
                                </div>

                                {(() => {
                                  const issueId = getSuspiciousIssueId(example);
                                  const savedDecision = suspiciousDecisions[issueId]?.decision || 'pending';

                                  return (
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
                                  );
                                })()}

                                <div className="mt-4 flex flex-wrap gap-2">
                                  <button
                                    onClick={() => handleSaveSuspiciousDecision(example, 'valid_data')}
                                    disabled={busySuspiciousDecisionId === getSuspiciousIssueId(example)}
                                    className="rounded-full bg-emerald-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                                  >
                                    Valid data
                                  </button>

                                  <button
                                    onClick={() => handleSaveSuspiciousDecision(example, 'corrupted')}
                                    disabled={busySuspiciousDecisionId === getSuspiciousIssueId(example)}
                                    className="rounded-full bg-rose-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                                  >
                                    Corrupted
                                  </button>

                                  <button
                                    onClick={() => handleSaveSuspiciousDecision(example, 'needs_review')}
                                    disabled={busySuspiciousDecisionId === getSuspiciousIssueId(example)}
                                    className="rounded-full bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                                  >
                                    Needs review
                                  </button>

                                  <button
                                    onClick={() => handleSaveSuspiciousDecision(example, 'ignored')}
                                    disabled={busySuspiciousDecisionId === getSuspiciousIssueId(example)}
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
                                      key={`${example.row_number}-${example.column}-${issue}`}
                                      className="rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-800 ring-1 ring-rose-200"
                                    >
                                      {issue.replace(/_/g, ' ')}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mb-4 flex items-start justify-between gap-4">
                      {lastCsvExportPath ? (
                        <button
                          onClick={handleOpenCsvExportFolder}
                          className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-700"
                        >
                          Open Export Folder
                        </button>
                      ) : null}
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