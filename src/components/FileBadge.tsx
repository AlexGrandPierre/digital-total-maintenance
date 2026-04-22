export default function FileBadge({ filename }: { filename: string }) {
  const ext = filename.includes('.') ? filename.split('.').pop()?.toUpperCase() : 'FILE';

  return (
    <div className="inline-flex h-10 min-w-[2.75rem] items-center justify-center rounded-2xl bg-slate-100 px-3 text-xs font-semibold text-slate-600">
      {ext || 'FILE'}
    </div>
  );
}