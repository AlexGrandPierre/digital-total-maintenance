/**
 * FileBadge.tsx
 *
 * Compact file-type badge used throughout the local file review interface.
 *
 * Responsibilities:
 * - Derive a display extension from a filename
 * - Render a consistent visual badge
 *
 * This component contains no file logic or actions.
 */

type FileBadgeProps = {
  filename: string;
};

export default function FileBadge({ filename }: FileBadgeProps) {
  const ext = filename.includes('.')
    ? filename.split('.').pop()?.toUpperCase()
    : 'FILE';

  return (
    <div className="inline-flex h-10 min-w-[2.75rem] items-center justify-center rounded-2xl bg-slate-100 px-3 text-xs font-semibold text-slate-600">
      {ext || 'FILE'}
    </div>
  );
}