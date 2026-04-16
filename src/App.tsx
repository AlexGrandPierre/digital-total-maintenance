import { useEffect, useMemo, useState } from 'react';
import Header from './components/Header';
import ScanButton from './components/ScanButton';

type ScanPreset = 'test' | 'desktop' | 'downloads' | 'documents' | 'custom';

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

type ScanResult = {
  scanned_at: string;
  folder: string;
  mode: string;
  total_files: number;
  review_files: ClassifiedFile[];
  system_files: ClassifiedFile[];
  archive_candidates: ClassifiedFile[];
  remove_candidates: ClassifiedFile[];
  duplicates: string[][];
  age_buckets: Record<string, number>;
  by_ext: Record<string, number>;
  errors: Array<{ path: string; error: string }>;
};

function StatCard({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'warn' | 'good' | 'danger';
}) {
  const toneClasses = {
    neutral: 'bg-white border-slate-200 text-slate-900',
    warn: 'bg-amber-50 border-amber-200 text-amber-900',
    good: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    danger: 'bg-rose-50 border-rose-200 text-rose-900',
  };

  return (
    <div className={`rounded-3xl border p-5 shadow-sm transition hover:shadow-md ${toneClasses[tone]}`}>
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-3 text-4xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function KeyValueList({
  entries,
  emptyMessage,
}: {
  entries: Array<[string, number | string]>;
  emptyMessage: string;
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-slate-500">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-3">
      {entries.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
          <span className="text-sm font-medium text-slate-700">{label}</span>
          <span className="text-sm font-semibold text-slate-900">{value}</span>
        </div>
      ))}
    </div>
  );
}

function ModePill({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
        active
          ? 'bg-slate-900 text-white shadow-sm'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {label}
    </button>
  );
}

function FileBadge({ filename }: { filename: string }) {
  const ext = filename.includes('.') ? filename.split('.').pop()?.toUpperCase() : 'FILE';

  return (
    <div className="inline-flex h-10 min-w-[2.75rem] items-center justify-center rounded-2xl bg-slate-100 px-3 text-xs font-semibold text-slate-600">
      {ext || 'FILE'}
    </div>
  );
}

function App() {
  const [scanOutput, setScanOutput] = useState<string>('No scan yet.');
  const [scanData, setScanData] = useState<ScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanPreset, setScanPreset] = useState<ScanPreset>('test');
  const [customPath, setCustomPath] = useState('');
  const [showSystemFiles, setShowSystemFiles] = useState(false);
  const [actionStatus, setActionStatus] = useState<{
    tone: 'success' | 'error';
    message: string;
  } | null>(null);
  const [busyPath, setBusyPath] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI?.onScanFinished?.((data: { output?: string }) => {
      const output = data.output || 'Scan completed with no output.';
      setScanOutput(output);
      setIsScanning(false);

      try {
        const parsed = JSON.parse(output);
        setScanData(parsed);
      } catch {
        setScanData(null);
      }
    });
  }, []);

  const scanTargetLabel = useMemo(() => {
    switch (scanPreset) {
      case 'desktop':
        return 'Desktop';
      case 'downloads':
        return 'Downloads';
      case 'documents':
        return 'Documents';
      case 'custom':
        return 'Custom Folder';
      case 'test':
      default:
        return 'Test Folder';
    }
  }, [scanPreset]);

  const handleScan = () => {
    if (scanPreset === 'custom' && !customPath.trim()) {
      setActionStatus({
        tone: 'error',
        message: 'Please enter a folder path before scanning a custom location.',
      });
      return;
    }

    setIsScanning(true);
    setScanData(null);
    setActionStatus(null);
    setScanOutput(`Scanning ${scanTargetLabel}... Please wait.`);

    window.electronAPI?.sendScanRequest?.({
      preset: scanPreset,
      customPath: customPath.trim(),
    });
  };

  const handleMoveToReview = async (filePath: string) => {
    setBusyPath(filePath);
    setActionStatus(null);

    try {
      const result = await window.electronAPI?.moveToReview?.(filePath);

      if (result?.success) {
        setActionStatus({
          tone: 'success',
          message: result.destination
            ? `Moved to DTM Review: ${result.destination}`
            : result.message,
        });

        // Refresh current scan after action
        window.electronAPI?.sendScanRequest?.({
          preset: scanPreset,
          customPath: customPath.trim(),
        });
      } else {
        setActionStatus({
          tone: 'error',
          message: result?.message || 'Failed to move file to DTM Review.',
        });
      }
    } catch (error) {
      setActionStatus({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unexpected action failure.',
      });
    } finally {
      setBusyPath(null);
    }
  };

  const handleMoveToArchive = async (filePath: string) => {
    setBusyPath(filePath);
    setActionStatus(null);

    try {
      const result = await window.electronAPI?.moveToArchive?.(filePath);

      if (result?.success) {
        setActionStatus({
          tone: 'success',
          message: result.destination
            ? `Moved to DTM Archive: ${result.destination}`
            : result.message,
        });
        window.electronAPI?.sendScanRequest?.({
          preset: scanPreset,
          customPath: customPath.trim(),
        });
      } else {
        setActionStatus({
          tone: 'error',
          message: result?.message || 'Failed to move file to DTM Archive.',
        });
      }
    } catch (error) {
      setActionStatus({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unexpected archive action failure.',
      });
    } finally {
      setBusyPath(null);
    }
  };

  const handleMoveToTrash = async (filePath: string) => {
    setBusyPath(filePath);
    setActionStatus(null);

    try {
      const result = await window.electronAPI?.moveToTrash?.(filePath);

      if (result?.success) {
        setActionStatus({
          tone: 'success',
          message: result.destination
            ? `Moved to Trash: ${result.destination}`
            : result.message,
        });
        window.electronAPI?.sendScanRequest?.({
          preset: scanPreset,
          customPath: customPath.trim(),
        });
      } else {
        setActionStatus({
          tone: 'error',
          message: result?.message || 'Failed to move file to Trash.',
        });
      }
    } catch (error) {
      setActionStatus({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unexpected remove action failure.',
      });
    } finally {
      setBusyPath(null);
    }
  };

  const insights = useMemo(() => {
    if (!scanData) return null;
  
    const review = scanData.review_files.length;
    const archive = scanData.archive_candidates.length;
    const remove = scanData.remove_candidates.length;
    const oldFiles = scanData.age_buckets['>180d'] || 0;
  
    let summary = '';
  
    if (review > 10000) {
      summary = 'Your workspace is heavily cluttered.';
    } else if (review > 1000) {
      summary = 'Your workspace is moderately cluttered.';
    } else {
      summary = 'Your workspace is relatively clean.';
    }
  
    return {
      summary,
      review,
      archive,
      remove,
      oldFiles,
    };
  }, [scanData]);

  const topExtensions = useMemo(() => {
    if (!scanData) return [];
    return Object.entries(scanData.by_ext).slice(0, 5);
  }, [scanData]);

  const ageBucketEntries = useMemo(() => {
    if (!scanData) return [];
    return Object.entries(scanData.age_buckets);
  }, [scanData]);

  const reviewSummary = useMemo(() => {
    if (!scanData) return [];
    return [
      ['Needs review', scanData.review_files.length],
      ['Archive candidates', scanData.archive_candidates.length],
      ['Remove candidates', scanData.remove_candidates.length],
      ['Duplicate pairs', scanData.duplicates.length],
      ['Folder scanned', scanData.folder],
      ['Mode', scanData.mode],
    ] as Array<[string, number | string]>;
  }, [scanData]);

  return (
    <div className="min-h-screen bg-[#f7f7f2] text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 md:px-8 lg:px-10">
        <Header isScanning={isScanning} />

        <main className="mt-8 space-y-8">
          <div className="flex flex-col gap-5 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-400">
                  Scan Scope
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                  Choose a target and explore your file landscape
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                  Start with a familiar high-impact location, or enter a custom folder path to inspect
                  a different part of your computer.
                </p>
              </div>

              <div className="flex shrink-0 items-center">
                <ScanButton
                  onClick={handleScan}
                  isScanning={isScanning}
                  label={`Scan ${scanTargetLabel}`}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <ModePill
                active={scanPreset === 'test'}
                label="Test Folder"
                onClick={() => setScanPreset('test')}
              />
              <ModePill
                active={scanPreset === 'desktop'}
                label="Desktop"
                onClick={() => setScanPreset('desktop')}
              />
              <ModePill
                active={scanPreset === 'downloads'}
                label="Downloads"
                onClick={() => setScanPreset('downloads')}
              />
              <ModePill
                active={scanPreset === 'documents'}
                label="Documents"
                onClick={() => setScanPreset('documents')}
              />
              <ModePill
                active={scanPreset === 'custom'}
                label="Custom"
                onClick={() => setScanPreset('custom')}
              />
            </div>

            {scanPreset === 'custom' ? (
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="custom-path"
                  className="text-sm font-medium text-slate-700"
                >
                  Custom folder path
                </label>
                <input
                  id="custom-path"
                  type="text"
                  value={customPath}
                  onChange={(e) => setCustomPath(e.target.value)}
                  placeholder="/Users/yourname/Documents/example-folder"
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
                />
                <p className="text-xs text-slate-500">
                  Enter an absolute folder path on this computer.
                </p>
              </div>
            ) : null}

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowSystemFiles((prev) => !prev)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  showSystemFiles
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {showSystemFiles ? 'Hide System Files' : 'Show System Files'}
              </button>

              <span className="text-sm text-slate-500">
                {scanData ? `${scanData.system_files.length} system files available` : 'System files hidden by default'}
              </span>
            </div>
          </div>

          {actionStatus ? (
            <section
              className={`rounded-2xl border px-5 py-4 shadow-sm ${
                actionStatus.tone === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-rose-200 bg-rose-50 text-rose-900'
              }`}
            >
              <p className="text-sm font-medium">{actionStatus.message}</p>
            </section>
          ) : null}

          {isScanning ? (
            <section className="rounded-[2rem] border border-sky-200 bg-sky-50 p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="mt-1 h-3 w-3 rounded-full bg-sky-500" />
                <div>
                  <h3 className="text-lg font-semibold text-sky-900">Scanning in progress</h3>
                  <p className="mt-1 text-sm leading-6 text-sky-800">
                    {scanPreset === 'desktop'
                      ? 'Running a broader Desktop scan. This may take longer depending on file volume.'
                      : scanPreset === 'downloads'
                      ? 'Scanning Downloads for clutter, archives, and disposable files.'
                      : scanPreset === 'documents'
                      ? 'Scanning Documents for files that may need review, archive, or cleanup.'
                      : scanPreset === 'custom'
                      ? `Scanning custom folder: ${customPath || 'No path provided'}`
                      : 'Running a fast development scan on your test folder.'}
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          {scanData ? (
            <>
              {insights && (
                <SectionCard
                  title="DTM Insights"
                  subtitle="High-level interpretation of your current digital environment."
                >
                  <div className="space-y-3 text-sm text-slate-700">
                    <p className="font-medium text-slate-900">{insights.summary}</p>

                    <ul className="space-y-1">
                      <li>• {insights.review} files need review</li>
                      <li>• {insights.archive} files can likely be archived</li>
                      <li>• {insights.remove} files appear safe to remove</li>
                    </ul>

                    <p>
                      Most files have not been modified in over 180 days: {insights.oldFiles}
                    </p>

                    <p className="text-slate-600">
                      Recommendation: Start by reviewing unknown files, then archive older compressed files.
                    </p>
                  </div>
                </SectionCard>
              )}
              
              <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Total files" value={scanData.total_files} tone="neutral" />
                <StatCard
                  label="Needs review"
                  value={scanData.review_files.length}
                  tone={scanData.review_files.length > 0 ? 'warn' : 'good'}
                />
                <StatCard
                  label="Duplicates"
                  value={scanData.duplicates.length}
                  tone={scanData.duplicates.length > 0 ? 'warn' : 'good'}
                />
                <StatCard
                  label="Errors"
                  value={scanData.errors.length}
                  tone={scanData.errors.length > 0 ? 'danger' : 'good'}
                />
              </section>

              <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <SectionCard
                  title="Age Buckets"
                  subtitle="How recently files in the scan target were modified."
                >
                  <KeyValueList
                    entries={ageBucketEntries}
                    emptyMessage="No age information available yet."
                  />
                </SectionCard>

                <SectionCard
                  title="Top File Types"
                  subtitle="Most common extensions found in the current scan."
                >
                  <KeyValueList
                    entries={topExtensions}
                    emptyMessage="No file type data available yet."
                  />
                </SectionCard>

                <SectionCard
                  title="Review Queue"
                  subtitle="Quick summary of what this scan says needs attention."
                >
                  <KeyValueList
                    entries={reviewSummary}
                    emptyMessage="No review data available yet."
                  />
                </SectionCard>
              </section>

              <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <SectionCard
                  title="Needs Review"
                  subtitle="Files that need human judgment before DTM can confidently relocate or remove them."
                >
                  {scanData.review_files.length === 0 ? (
                    <div className="rounded-2xl bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                      No suspicious files detected in this scan.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {scanData.review_files.slice(0, 10).map((file) => (
                        <div
                          key={file.path}
                          className="flex items-start gap-4 rounded-3xl border border-amber-200 bg-amber-50 p-4"
                        >
                          <FileBadge filename={file.name} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-semibold text-amber-950">{file.name}</h3>
                              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200">
                                {file.category.replace(/_/g, ' ')}
                              </span>
                            </div>
                        
                            <p className="mt-2 break-all text-xs leading-5 text-amber-900/80">
                              {file.path}
                            </p>
                        
                            <div className="mt-3 rounded-2xl bg-white/60 px-3 py-3 space-y-2">
                              <div className="text-xs text-amber-900/80">
                                <span className="font-semibold">Reason:</span> {file.reason}
                              </div>
                              <div className="text-xs text-amber-900/70">
                                <span className="font-semibold">Confidence:</span> {file.confidence}
                              </div>
                              <div className="text-xs text-amber-900/70">
                                <span className="font-semibold">Recommended action:</span> {file.recommended_action}
                              </div>
                            </div>
                        
                            <div className="mt-4 flex flex-wrap gap-3">
                              <button
                                onClick={() => handleMoveToReview(file.path)}
                                disabled={busyPath === file.path}
                                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                                  busyPath === file.path
                                    ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                                    : 'bg-slate-900 text-white hover:bg-slate-700'
                                }`}
                              >
                                {busyPath === file.path ? 'Moving…' : 'Move to Review'}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>

                <SectionCard
                  title="Duplicate Review"
                  subtitle="Potential duplicates found with the current fast heuristic."
                >
                  {scanData.duplicates.length === 0 ? (
                    <div className="rounded-2xl bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                      No duplicate pairs detected in this scan.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {scanData.duplicates.slice(0, 8).map((pair, index) => (
                        <div
                          key={`${pair[0]}-${pair[1]}-${index}`}
                          className="rounded-3xl border border-slate-200 bg-slate-50 p-4"
                        >
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-semibold text-slate-900">
                              Duplicate Pair {index + 1}
                            </div>
                            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">
                              Compare
                            </span>
                          </div>

                          <div className="mt-4 space-y-3">
                            <div className="rounded-2xl bg-white p-3">
                              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
                                Original
                              </div>
                              <div className="mt-2 break-all text-sm text-slate-700">{pair[0]}</div>
                            </div>

                            <div className="rounded-2xl bg-white p-3">
                              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
                                Possible Duplicate
                              </div>
                              <div className="mt-2 break-all text-sm text-slate-700">{pair[1]}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>
              </section>

              <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <SectionCard
                  title="Archive Candidates"
                  subtitle="Files that are likely worth keeping, but not keeping in your active workspace."
                >
                  {scanData.archive_candidates.length === 0 ? (
                    <div className="rounded-2xl bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                      No archive candidates detected in this scan.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {scanData.archive_candidates.slice(0, 10).map((file) => (
                        <div
                          key={file.path}
                          className="flex items-start gap-4 rounded-3xl border border-sky-200 bg-sky-50 p-4"
                        >
                          <FileBadge filename={file.name} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-semibold text-sky-950">{file.name}</h3>
                              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-sky-800 ring-1 ring-sky-200">
                                {file.category.replace(/_/g, ' ')}
                              </span>
                            </div>
                        
                            <p className="mt-2 break-all text-xs leading-5 text-sky-900/80">
                              {file.path}
                            </p>
                        
                            <div className="mt-3 rounded-2xl bg-white/60 px-3 py-3 space-y-2">
                              <div className="text-xs text-sky-900/80">
                                <span className="font-semibold">Reason:</span> {file.reason}
                              </div>
                              <div className="text-xs text-sky-900/70">
                                <span className="font-semibold">Confidence:</span> {file.confidence}
                              </div>
                              <div className="text-xs text-sky-900/70">
                                <span className="font-semibold">Recommended action:</span> {file.recommended_action}
                              </div>
                            </div>
                        
                            <div className="mt-4 flex flex-wrap gap-3">
                              <button
                                onClick={() => handleMoveToArchive(file.path)}
                                disabled={busyPath === file.path}
                                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                                  busyPath === file.path
                                    ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                                    : 'bg-sky-900 text-white hover:bg-sky-700'
                                }`}
                              >
                                {busyPath === file.path ? 'Archiving…' : 'Move to Archive'}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>

                <SectionCard
                  title="Remove Candidates"
                  subtitle="Files that appear disposable, temporary, or low-value based on current rules."
                >
                  {scanData.remove_candidates.length === 0 ? (
                    <div className="rounded-2xl bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                      No remove candidates detected in this scan.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {scanData.remove_candidates.slice(0, 10).map((file) => (
                        <div
                          key={file.path}
                          className="flex items-start gap-4 rounded-3xl border border-rose-200 bg-rose-50 p-4"
                        >
                          <FileBadge filename={file.name} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-semibold text-rose-950">{file.name}</h3>
                              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-rose-800 ring-1 ring-rose-200">
                                {file.category.replace(/_/g, ' ')}
                              </span>
                            </div>
                        
                            <p className="mt-2 break-all text-xs leading-5 text-rose-900/80">
                              {file.path}
                            </p>
                        
                            <div className="mt-3 rounded-2xl bg-white/60 px-3 py-3 space-y-2">
                              <div className="text-xs text-rose-900/80">
                                <span className="font-semibold">Reason:</span> {file.reason}
                              </div>
                              <div className="text-xs text-rose-900/70">
                                <span className="font-semibold">Confidence:</span> {file.confidence}
                              </div>
                              <div className="text-xs text-rose-900/70">
                                <span className="font-semibold">Recommended action:</span> {file.recommended_action}
                              </div>
                            </div>
                        
                            <div className="mt-4 flex flex-wrap gap-3">
                              <button
                                onClick={() => handleMoveToTrash(file.path)}
                                disabled={busyPath === file.path}
                                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                                  busyPath === file.path
                                    ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                                    : 'bg-rose-900 text-white hover:bg-rose-700'
                                }`}
                              >
                                {busyPath === file.path ? 'Removing…' : 'Move to Trash'}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>
              </section>

              {showSystemFiles ? (
                <SectionCard
                  title="System Files"
                  subtitle="Files generated by the operating system or tooling, usually safe to ignore."
                >
                  {scanData.system_files.length === 0 ? (
                    <p className="text-sm text-slate-500">No system files detected in this scan.</p>
                  ) : (
                    <div className="space-y-3">
                      {scanData.system_files.slice(0, 10).map((file) => (
                        <div
                          key={file.path}
                          className="flex items-start gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-4"
                        >
                          <FileBadge filename={file.name} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-semibold text-slate-900">{file.name}</h3>
                              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200">
                                {file.category.replace(/_/g, ' ')}
                              </span>
                            </div>
                            <p className="mt-2 break-all text-xs leading-5 text-slate-700">{file.path}</p>

                            <div className="mt-3 text-xs text-slate-600">
                              <span className="font-semibold">Reason:</span> {file.reason}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>
              ) : null}

              <SectionCard
                title="Debug Output"
                subtitle="Raw scan payload retained while the product evolves."
              >
                <div className="max-h-[28rem] overflow-y-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-200">
                  <pre className="whitespace-pre-wrap break-words">{scanOutput}</pre>
                </div>
              </SectionCard>
            </>
          ) : !isScanning ? (
            <section className="rounded-[2rem] border border-slate-200 bg-white p-10 shadow-sm">
              <div className="max-w-2xl">
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-400">
                  Ready
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
                  Run a scan to populate the maintenance dashboard
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-500">
                  Start with your test folder for rapid iteration, then switch to Desktop when
                  you want broader validation. The dashboard will keep evolving around these
                  structured result states.
                </p>
              </div>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}

export default App;