/**
 * ReviewCapacityControl.tsx
 *
 * Controls the number of CSV review findings loaded into the workspace.
 */

export type ReviewCapacity = 25 | 50 | 100 | 250;

type ReviewCapacityControlProps = {
  label: string;
  value: ReviewCapacity;
  total: number;
  visible: number;
  onChange: (value: ReviewCapacity) => void;
};

export default function ReviewCapacityControl({
  label,
  value,
  total,
  visible,
  onChange,
}: ReviewCapacityControlProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="text-xs text-slate-500">
        Showing{' '}
        <span className="font-semibold text-slate-800">
          {visible}
        </span>{' '}
        of{' '}
        <span className="font-semibold text-slate-800">
          {total}
        </span>
      </div>

      <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </label>

      <select
        value={String(value)}
        onChange={(event) =>
          onChange(Number(event.target.value) as ReviewCapacity)
        }
        className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm outline-none transition hover:bg-slate-50"
      >
        <option value="25">25</option>
        <option value="50">50</option>
        <option value="100">100</option>
        <option value="250">250</option>
      </select>
    </div>
  );
}