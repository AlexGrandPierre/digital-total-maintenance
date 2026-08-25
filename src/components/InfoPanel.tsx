/**
 * InfoPanel.tsx
 *
 * Collapsible information panel used throughout the DTM interface.
 *
 * Responsibilities:
 * - Display contextual help and guidance
 * - Allow users to expand or collapse supporting information
 *
 * This component contains no application or business logic.
 */

import { useState } from 'react';

type InfoPanelProps = {
  title: string;
  children: React.ReactNode;
};

export default function InfoPanel({
  title,
  children,
}: InfoPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50">
      <button
        onClick={() => setOpen((previous) => !previous)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-slate-700"
      >
        <span>{title}</span>

        <span className="text-xs text-slate-400">
          {open ? 'Hide' : 'Learn more'}
        </span>
      </button>

      {open && (
        <div className="space-y-2 px-4 pb-4 text-sm leading-6 text-slate-600">
          {children}
        </div>
      )}
    </div>
  );
}