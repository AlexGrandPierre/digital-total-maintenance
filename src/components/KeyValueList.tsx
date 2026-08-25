/**
 * KeyValueList.tsx
 *
 * Compact display for label/value summary data.
 */

type KeyValueListProps = {
  entries: Array<[string, number | string]>;
  emptyMessage: string;
};

export default function KeyValueList({
  entries,
  emptyMessage,
}: KeyValueListProps) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map(([label, value]) => (
        <div
          key={label}
          className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"
        >
          <span className="text-sm font-medium text-slate-700">
            {label}
          </span>

          <span className="text-sm font-semibold text-slate-900">
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}