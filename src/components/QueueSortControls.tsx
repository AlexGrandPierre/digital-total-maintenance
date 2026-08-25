/**
 * QueueSortControls.tsx
 *
 * Sorting controls shared by local file decision queues.
 */

import type {
  SortDirection,
  SortKey,
} from '../types/dtm';

type QueueSortControlsProps = {
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSortKeyChange: (value: SortKey) => void;
  onSortDirectionChange: (value: SortDirection) => void;
  disabled?: boolean;
};

export default function QueueSortControls({
  sortKey,
  sortDirection,
  onSortKeyChange,
  onSortDirectionChange,
  disabled = false,
}: QueueSortControlsProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
          Sort by
        </label>

        <select
          value={sortKey}
          disabled={disabled}
          onChange={(event) =>
            onSortKeyChange(event.target.value as SortKey)
          }
          className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        >
          <option value="confidence">Confidence</option>
          <option value="age_days">Age</option>
          <option value="size">Size</option>
          <option value="name">Name</option>
          <option value="review_priority">
            Review priority
          </option>
        </select>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
          Direction
        </label>

        <select
          value={sortDirection}
          disabled={disabled}
          onChange={(event) =>
            onSortDirectionChange(
              event.target.value as SortDirection
            )
          }
          className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        >
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </select>
      </div>
    </div>
  );
}