import FileBadge from './FileBadge';

type ClassifiedFile = {
  path: string;
  name: string;
  ext: string;
  size: number;
  age_days: number;
  hash: string | null;
  category: string;
  confidence: 'high' | 'medium' | 'low';
  recommended_action: 'keep' | 'ignore' | 'review' | 'archive' | 'remove';
  reason: string;
  ui_visibility: 'normal' | 'hidden_by_default';
};

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
  },
  archive: {
    card: 'border-sky-200 bg-sky-50',
    title: 'text-sky-950',
    path: 'text-sky-900/75',
    reasonBox: 'bg-white/70',
    reason: 'text-sky-900/85',
    metaPill: 'bg-white text-sky-800 ring-1 ring-sky-200',
    button: 'bg-sky-900 text-white hover:bg-sky-700',
  },
  remove: {
    card: 'border-rose-200 bg-rose-50',
    title: 'text-rose-950',
    path: 'text-rose-900/75',
    reasonBox: 'bg-white/70',
    reason: 'text-rose-900/85',
    metaPill: 'bg-white text-rose-800 ring-1 ring-rose-200',
    button: 'bg-rose-900 text-white hover:bg-rose-700',
  },
};

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

  return (
    <div className={`flex items-start gap-4 rounded-3xl border p-4 ${styles.card}`}>
      <FileBadge filename={file.name} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={`text-sm font-semibold ${styles.title}`}>{file.name}</h3>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${styles.metaPill}`}>
            {file.category.replace(/_/g, ' ')}
          </span>
        </div>

        <p className={`mt-2 break-all text-xs leading-5 ${styles.path}`}>
          {file.path}
        </p>

        <div className={`mt-3 rounded-2xl px-3 py-3 ${styles.reasonBox}`}>
          <div className={`text-xs ${styles.reason}`}>
            <span className="font-semibold">Reason:</span> {file.reason}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${styles.metaPill}`}>
            Confidence: {file.confidence}
          </span>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${styles.metaPill}`}>
            Action: {file.recommended_action}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
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
      </div>
    </div>
  );
}