/**
 * QueueFileCard.tsx
 *
 * Review card for files surfaced by the local filesystem engine.
 *
 * Responsibilities:
 * - Present file classification and recommendation metadata
 * - Expose queue-specific file actions
 * - Display expandable DTM reasoning
 * - Apply visual styling based on review, archive, or remove context
 *
 * This component DOES NOT:
 * - Classify files
 * - Execute filesystem operations directly
 * - Decide which queue a file belongs to
 */

import { useState } from 'react';

import FileBadge from './FileBadge';

import type {
  ClassifiedFile,
  RecommendedAction,
} from '../types/dtm';


// ============================================================================
// Component Types
// ============================================================================

type QueueTone = 'review' | 'archive' | 'remove';

type QueueFileCardProps = {
  file: ClassifiedFile;
  tone: QueueTone;
  actionLabel: string;
  busyLabel: string;
  onAction: (path: string) => void;
  isBusy: boolean;
  onKeep?: (path: string) => void;
  onArchive?: (path: string) => void;
  onRemove?: (path: string) => void;
  recommendedAction?: RecommendedAction;
};

type InfoRowProps = {
  label: string;
  value: string;
  labelClass: string;
  valueClass: string;
};


// ============================================================================
// Visual Configuration
// ============================================================================

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
    toggle:
      'bg-white text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100/60',
    infoLabel: 'text-amber-800/75',
    infoValue: 'text-amber-950/90',
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
    toggle:
      'bg-white text-sky-900 ring-1 ring-sky-200 hover:bg-sky-100/60',
    infoLabel: 'text-sky-800/75',
    infoValue: 'text-sky-950/90',
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
    toggle:
      'bg-white text-rose-900 ring-1 ring-rose-200 hover:bg-rose-100/60',
    infoLabel: 'text-rose-800/75',
    infoValue: 'text-rose-950/90',
  },
} satisfies Record<QueueTone, Record<string, string>>;

const confidenceColor = {
  high: 'text-emerald-700',
  medium: 'text-amber-700',
  low: 'text-rose-700',
};


// ============================================================================
// Display Helpers
// ============================================================================

function humanizeToken(value: string) {
  return value.replace(/_/g, ' ');
}

function InfoRow({
  label,
  value,
  labelClass,
  valueClass,
}: InfoRowProps) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2">
      <span
        className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${labelClass}`}
      >
        {label}
      </span>

      <span className={`text-xs leading-5 ${valueClass}`}>
        {value}
      </span>
    </div>
  );
}


// ============================================================================
// Queue File Card
// ============================================================================

export default function QueueFileCard({
  file,
  tone,
  actionLabel,
  busyLabel,
  onAction,
  isBusy,
  onKeep,
  onArchive,
  onRemove,
  recommendedAction,
}: QueueFileCardProps) {
  const styles = toneClasses[tone];
  const [showReasoning, setShowReasoning] = useState(false);

  return (
    <div
      className={`flex items-start gap-4 rounded-3xl border p-4 ${styles.card}`}
    >
      <FileBadge filename={file.name} />

      <div className="min-w-0 flex-1">
        {/* File summary */}
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={`text-sm font-semibold ${styles.title}`}>
            {file.name}
          </h3>

          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${styles.metaPill}`}
          >
            {humanizeToken(file.category)}
          </span>

          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${styles.metaPill}`}
          >
            {humanizeToken(file.file_kind)}
          </span>
        </div>

        <p className={`mt-2 break-all text-xs leading-5 ${styles.path}`}>
          {file.path}
        </p>

        {/* Classification summary */}
        <div className={`mt-3 rounded-2xl px-3 py-3 ${styles.reasonBox}`}>
          <div className={`text-xs ${styles.reason}`}>
            <span className="font-semibold">Primary reason:</span>{' '}
            {file.reason}
          </div>

          <div className="mt-3 space-y-2 border-t border-black/5 pt-3">
            <InfoRow
              label="Confidence"
              value={file.confidence}
              labelClass={styles.infoLabel}
              valueClass={styles.infoValue}
            />

            <InfoRow
              label="Recommendation"
              value={humanizeToken(file.recommended_action)}
              labelClass={styles.infoLabel}
              valueClass={styles.infoValue}
            />

            <InfoRow
              label="Context"
              value={humanizeToken(file.location_context)}
              labelClass={styles.infoLabel}
              valueClass={styles.infoValue}
            />

            <InfoRow
              label="Review priority"
              value={file.review_priority ?? 'not applicable'}
              labelClass={styles.infoLabel}
              valueClass={styles.infoValue}
            />

            {file.action_confidence && (
              <InfoRow
                label="Action confidence"
                value={file.action_confidence}
                labelClass={styles.infoLabel}
                valueClass={`${styles.infoValue} ${
                  confidenceColor[file.action_confidence]
                }`}
              />
            )}
          </div>
        </div>

        {/* File actions */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowReasoning((previous) => !previous)}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition ${styles.toggle}`}
          >
            {showReasoning ? 'Hide reasoning' : 'Show reasoning'}
          </button>

          <button
            type="button"
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

          {onKeep && (
            <button
              type="button"
              onClick={() => onKeep(file.path)}
              disabled={isBusy}
              className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            >
              Keep
            </button>
          )}

          {onArchive && recommendedAction !== 'archive' && (
            <button
              type="button"
              onClick={() => onArchive(file.path)}
              disabled={isBusy}
              className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-sky-800 ring-1 ring-sky-200 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            >
              Archive
            </button>
          )}

          {onRemove && recommendedAction !== 'remove' && (
            <button
              type="button"
              onClick={() => onRemove(file.path)}
              disabled={isBusy}
              className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-rose-800 ring-1 ring-rose-200 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            >
              Remove
            </button>
          )}
        </div>

        {/* Expanded reasoning */}
        {showReasoning && (
          <div
            className={`mt-4 rounded-2xl border px-3 py-3 ${styles.subcard}`}
          >
            <div className="space-y-4">
              <div>
                <div
                  className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${styles.label}`}
                >
                  What DTM thinks this is
                </div>

                <div className={`mt-1 text-xs leading-5 ${styles.body}`}>
                  {file.known_type_explanation}
                </div>
              </div>

              <div>
                <div
                  className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${styles.label}`}
                >
                  Why this file matters here
                </div>

                <div className={`mt-1 text-xs leading-5 ${styles.body}`}>
                  {file.context_reason}
                </div>
              </div>

              <div>
                <div
                  className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${styles.label}`}
                >
                  Why DTM recommends this
                </div>

                <div className={`mt-1 text-xs leading-5 ${styles.body}`}>
                  {file.suggested_action_reason}
                </div>
              </div>

              {file.review_priority_reason && (
                <div>
                  <div
                    className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${styles.label}`}
                  >
                    Why this priority
                  </div>

                  <div className={`mt-1 text-xs leading-5 ${styles.body}`}>
                    {file.review_priority_reason}
                  </div>
                </div>
              )}

              {file.risk_flags.length > 0 && (
                <div>
                  <div
                    className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${styles.label}`}
                  >
                    Caution flags
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    {file.risk_flags.slice(0, 4).map((flag) => (
                      <span
                        key={flag}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${styles.metaPill}`}
                      >
                        {humanizeToken(flag)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}