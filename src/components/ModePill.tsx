/**
 * ModePill.tsx
 *
 * Selectable pill control used for scan modes and workspace options.
 */

type ModePillProps = {
  active: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

export default function ModePill({
  active,
  label,
  onClick,
  disabled = false,
}: ModePillProps) {
  return (
    <button
      type="button"
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