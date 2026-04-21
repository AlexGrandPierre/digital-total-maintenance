import { useState } from 'react';

export default function InfoPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="w-full px-4 py-3 text-left text-sm font-medium text-slate-700 flex items-center justify-between"
      >
        <span>{title}</span>
        <span className="text-xs text-slate-400">
          {open ? 'Hide' : 'Learn more'}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 text-sm text-slate-600 leading-6 space-y-2">
          {children}
        </div>
      )}
    </div>
  );
}