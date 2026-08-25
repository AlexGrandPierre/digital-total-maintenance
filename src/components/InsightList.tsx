/**
 * InsightList.tsx
 *
 * Interactive list of scan patterns detected by DTM.
 *
 * Responsibilities:
 * - Display insight counts
 * - Highlight the active queue focus
 * - Request queue inspection or bounded action previews
 */

export type QueueFilter = {
  label: string;
  key:
    | 'context_type'
    | 'reason'
    | 'recommended_action'
    | 'file_kind'
    | 'user_relevance';
  value: string;
} | null;

export type InsightActionType =
  | 'archive'
  | 'remove';

type InsightEntry = {
  label: string;
  count: number;
};

type InsightListProps = {
  entries: InsightEntry[];
  emptyMessage: string;
  onSelect?: (entry: InsightEntry) => void;
  activeFilter?: QueueFilter;
  getMatchCount?: (entry: InsightEntry) => number;
  getAction?: (
    entry: InsightEntry
  ) => InsightActionType | null;
  onPreviewRequest?: (
    entry: InsightEntry,
    action: InsightActionType
  ) => void;
};

export default function InsightList({
  entries,
  emptyMessage,
  onSelect,
  activeFilter,
  getMatchCount,
  getAction,
  onPreviewRequest,
}: InsightListProps) {
  if (!entries || entries.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => {
        const isActive = Boolean(
          activeFilter &&
            activeFilter.value === entry.label
        );

        const matchCount = getMatchCount
          ? getMatchCount(entry)
          : entry.count;

        const hasActionableMatches = matchCount > 0;

        const action =
          getAction?.(entry) ?? null;

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
                className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ring-1 ring-slate-200 ${
                  isActive
                    ? 'bg-sky-100 text-sky-800'
                    : 'bg-white text-slate-500'
                }`}
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

                  {getMatchCount && (
                    <>
                      {' '}· {matchCount.toLocaleString()} visible through queue focus
                    </>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {onSelect && hasActionableMatches ? (
                    <button
                      type="button"
                      onClick={() => onSelect(entry)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        isActive
                          ? 'bg-sky-900 text-white'
                          : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {isActive
                        ? 'Inspecting'
                        : 'Inspect'}
                    </button>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-400">
                      No queue matches
                    </span>
                  )}

                  {action &&
                    onPreviewRequest &&
                    hasActionableMatches && (
                      <button
                        type="button"
                        onClick={() =>
                          onPreviewRequest(entry, action)
                        }
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold text-white transition ${
                          action === 'archive'
                            ? 'bg-sky-900 hover:bg-sky-700'
                            : 'bg-rose-900 hover:bg-rose-700'
                        }`}
                      >
                        {action === 'archive'
                          ? 'Preview Archive'
                          : 'Preview Remove'}
                      </button>
                    )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}