import { useState } from 'react';
import FileBadge from './FileBadge';
import type { ClassifiedFile } from '../types/dtm';

type QueueTone = 'review' | 'archive' | 'remove';

const toneClasses = {
  review: {
    card: 'border-amber-200 bg-amber-50',
    title: 'text-amber-950',
    path: 'text-amber-900/75',
    reasonBox: 'bg-white/70',
    reason: 'text-amber-900/85',
    metaPill: 'bg-white text-amber-800 ring-1 ring-amber-200',
    button: 'bg-slate-900 text-white hover:bg-slate-700',
    subcard: 'border-amber-200/60 bg-white/60',
    label: 'text-amber-800/80',
    body: 'text-amber-950/90',
    toggle: 'bg-white text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100/60',
  },
  archive: {
    card: 'border-sky-200 bg-sky-50',
    title: 'text-sky-950',
    path: 'text-sky-900/75',
    reasonBox: 'bg-white/70',
    reason: 'text-sky-900/85',
    metaPill: 'bg-white text-sky-800 ring-1 ring-sky-200',
    button: 'bg-sky-900 text-white hover:bg-sky-700',
    subcard: 'border-sky-200/60 bg-white/60',
    label: 'text-sky-800/80',
    body: 'text-sky-950/90',
    toggle: 'bg-white text-sky-900 ring-1 ring-sky-200 hover:bg-sky-100/60',
  },
  remove: {
    card: 'border-rose-200 bg-rose-50',
    title: 'text-rose-950',
    path: 'text-rose-900/75',
    reasonBox: 'bg-white/70',
    reason: 'text-rose-900/85',
    metaPill: 'bg-white text-rose-800 ring-1 ring-rose-200',
    button: 'bg-rose-900 text-white hover:bg-rose-700',
    subcard: 'border-rose-200/60 bg-white/60',
    label: 'text-rose-800/80',
    body: 'text-rose-950/90',
    toggle: 'bg-white text-rose-900 ring-1 ring-rose-200 hover:bg-rose-100/60',
  },
};

function humanizeToken(value: string) {
  return value.replace(/_/g, ' ');
}

export default function QueueFileCard({
  file,
  tone,
  actionLabel,
  busyLabel,
  onAction,
  isBusy,
}: {
  file: ClassifiedFile;
  tone: QueueTone;
  actionLabel: string;
  busyLabel: string;
  onAction: (path: string) => void;
  isBusy: boolean;
}) {
  const styles = toneClasses[tone];
  const [showReasoning, setShowReasoning] = useState(false);

  return (
    <div className={`flex items-start gap-4 rounded-3xl border p-4 ${styles.card}`}>
      <FileBadge filename={file.name} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={`text-sm font-semibold ${styles.title}`}>{file.name}</h3>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${styles.metaPill}`}>
            {humanizeToken(file.category)}
          </span>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${styles.metaPill}`}>
            {humanizeToken(file.file_kind)}
          </span>
        </div>

        <p className={`mt-2 break-all text-xs leading-5 ${styles.path}`}>
          {file.path}
        </p>

        <div className={`mt-3 rounded-2xl px-3 py-3 ${styles.reasonBox}`}>
          <div className={`text-xs ${styles.reason}`}>
            <span className="font-semibold">Primary reason:</span> {file.reason}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${styles.metaPill}`}>
            Confidence: {file.confidence}
          </span>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${styles.metaPill}`}>
            Recommendation: {file.recommended_action}
          </span>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${styles.metaPill}`}>
            Context: {humanizeToken(file.location_context)}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowReasoning((prev) => !prev)}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition ${styles.toggle}`}
          >
            {showReasoning ? 'Hide reasoning' : 'Show reasoning'}
          </button>

          <button
            onClick={() => onAction(file.path)}
            disabled={isBusy}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
              isBusy
                ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                : styles.button
            }`}
          >
            {isBusy ? busyLabel : actionLabel}
          </button>
        </div>

        {showReasoning ? (
          <div className={`mt-4 rounded-2xl border px-3 py-3 ${styles.subcard}`}>
            <div className="space-y-3">
              <div>
                <div className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${styles.label}`}>
                  Known type
                </div>
                <div className={`mt-1 text-xs leading-5 ${styles.body}`}>
                  {file.known_type_explanation}
                </div>
              </div>

              <div>
                <div className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${styles.label}`}>
                  Why DTM classified it this way
                </div>
                <div className={`mt-1 text-xs leading-5 ${styles.body}`}>
                  {file.classification_reason}
                </div>
              </div>

              <div>
                <div className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${styles.label}`}>
                  Why this confidence
                </div>
                <div className={`mt-1 text-xs leading-5 ${styles.body}`}>
                  {file.confidence_reason}
                </div>
              </div>

              <div>
                <div className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${styles.label}`}>
                  Why this recommendation
                </div>
                <div className={`mt-1 text-xs leading-5 ${styles.body}`}>
                  {file.suggested_action_reason}
                </div>
              </div>

              {file.risk_flags.length > 0 ? (
                <div>
                  <div className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${styles.label}`}>
                    Flags
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {file.risk_flags.map((flag) => (
                      <span
                        key={flag}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${styles.metaPill}`}
                      >
                        {humanizeToken(flag)}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}