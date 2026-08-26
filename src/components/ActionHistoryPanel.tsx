/**
 * ActionHistoryPanel.tsx
 *
 * Action-history and restore interface for Digital Total Maintenance.
 *
 * Responsibilities:
 * - Display recent filesystem actions
 * - Filter action history by restore state
 * - Select undoable actions
 * - Trigger individual and bulk restore requests
 * - Expose the local-history reset control
 *
 * This component DOES NOT:
 * - Perform filesystem restores
 * - Load or persist action history
 * - Decide restore behavior
 */

import SectionCard from './SectionCard';
import type {
  ActionHistoryEntry,
  HistoryFilter,
} from '../domains/history/types';

export type { ActionHistoryEntry, HistoryFilter } from '../domains/history/types';

type ActionHistoryPanelProps = {
  historyFilter: HistoryFilter;
  filteredActionHistory: ActionHistoryEntry[];
  selectedHistoryIds: Set<string>;
  selectedUndoableCount: number;

  busyHistoryId: string | null;

  isBulkRestoring: boolean;
  isBulkActing: boolean;
  isScanning: boolean;

  canUndoHistoryEntry: (
    entry: ActionHistoryEntry
  ) => boolean;

  onHistoryFilterChange: (
    filter: HistoryFilter
  ) => void;

  onToggleSelectedHistoryId: (
    entryId: string
  ) => void;

  onUndoHistoryEntry: (
    entry: ActionHistoryEntry
  ) => void;

  onBulkRestoreSelected: () => void;
  onClearActionHistory: () => void;
};

function getActionLabel(
  action: ActionHistoryEntry['action']
) {
  switch (action) {
    case 'move_to_review':
      return 'Moved to Review';

    case 'move_to_archive':
      return 'Moved to Archive';

    case 'move_to_trash':
      return 'Moved to Trash';

    case 'restore_from_review':
      return 'Restored from Review';

    case 'restore_from_archive':
      return 'Restored from Archive';

    case 'restore_from_trash':
      return 'Restored from Trash';
  }
}

export default function ActionHistoryPanel({
  historyFilter,
  filteredActionHistory,
  selectedHistoryIds,
  selectedUndoableCount,
  busyHistoryId,
  isBulkRestoring,
  isBulkActing,
  isScanning,
  canUndoHistoryEntry,
  onHistoryFilterChange,
  onToggleSelectedHistoryId,
  onUndoHistoryEntry,
  onBulkRestoreSelected,
  onClearActionHistory,
}: ActionHistoryPanelProps) {
  const actionsDisabled =
    isBulkRestoring ||
    isBulkActing ||
    isScanning;

  return (
    <SectionCard
      title="Recent Actions"
      subtitle="A local record of successful maintenance actions performed by DTM."
    >
      <div className="mb-4 flex flex-wrap gap-3">
        {(
          [
            ['undoable', 'Undo Available'],
            ['all', 'All Actions'],
            ['restored', 'Restored'],
          ] as const
        ).map(([filter, label]) => (
          <button
            key={filter}
            type="button"
            onClick={() =>
              onHistoryFilterChange(filter)
            }
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              historyFilter === filter
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {historyFilter === 'undoable' &&
        filteredActionHistory.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-sm text-slate-700">
              Selected{' '}
              <span className="font-semibold">
                {selectedUndoableCount}
              </span>{' '}
              undoable action
              {selectedUndoableCount === 1
                ? ''
                : 's'}
            </div>

            <button
              type="button"
              onClick={onBulkRestoreSelected}
              disabled={
                selectedUndoableCount === 0 ||
                actionsDisabled
              }
              className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              {isBulkRestoring
                ? 'Restoring…'
                : `Undo Selected (${selectedUndoableCount})`}
            </button>
          </div>
        )}

      <div className="mb-3 text-xs text-slate-500">
        Showing {filteredActionHistory.length}{' '}
        item
        {filteredActionHistory.length === 1
          ? ''
          : 's'}

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
        <div className="max-h-[26rem] space-y-3 overflow-y-auto pr-1">
          {filteredActionHistory.map(
            (entry) => {
              const filename =
                entry.source_path
                  .split('/')
                  .pop() ||
                entry.source_path;

              const actionLabel =
                getActionLabel(entry.action);

              const canUndo =
                canUndoHistoryEntry(entry);

              return (
                <div
                  key={entry.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                >
                  {canUndo && (
                    <label className="mb-3 flex items-center gap-2 text-xs font-medium text-slate-600">
                      <input
                        type="checkbox"
                        checked={selectedHistoryIds.has(
                          entry.id
                        )}
                        onChange={() =>
                          onToggleSelectedHistoryId(
                            entry.id
                          )
                        }
                        disabled={
                          actionsDisabled
                        }
                      />

                      Select for undo
                    </label>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-900">
                      {actionLabel}
                    </div>

                    <div className="text-xs text-slate-500">
                      {new Date(
                        entry.timestamp
                      ).toLocaleString()}
                    </div>
                  </div>

                  <div className="mt-2 text-sm text-slate-700">
                    {filename}
                  </div>

                  <div className="mt-2 break-all text-xs text-slate-500">
                    Source: {entry.source_path}
                  </div>

                  {entry.destination_path && (
                    <div className="mt-1 break-all text-xs text-slate-500">
                      Destination:{' '}
                      {entry.destination_path}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">
                      {entry.mode}
                    </span>

                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">
                      {entry.status}
                    </span>
                  </div>

                  {canUndo && (
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() =>
                          onUndoHistoryEntry(
                            entry
                          )
                        }
                        disabled={
                          busyHistoryId ===
                            entry.id ||
                          isBulkActing ||
                          isScanning
                        }
                        className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                      >
                        {busyHistoryId ===
                        entry.id
                          ? 'Restoring…'
                          : 'Undo'}
                      </button>
                    </div>
                  )}

                  {!canUndo &&
                    (
                      entry.action ===
                        'move_to_review' ||
                      entry.action ===
                        'move_to_archive' ||
                      entry.action ===
                        'move_to_trash'
                    ) && (
                      <span className="mt-3 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200">
                        already restored
                      </span>
                    )}
                </div>
              );
            }
          )}
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
          Dev Utility
        </div>

        <p className="mt-1 text-xs leading-5 text-amber-800">
          Clears local action history only.
          This does not restore, move,
          delete, or modify any files.
        </p>

        <button
          type="button"
          onClick={onClearActionHistory}
          disabled={
            isBulkActing || isScanning
          }
          className="mt-3 rounded-full bg-amber-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
        >
          Clear Local History
        </button>
      </div>
    </SectionCard>
  );
}
