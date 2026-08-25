/**
 * SupportDrawer.tsx
 *
 * Contextual support drawer for Digital Total Maintenance.
 *
 * Responsibilities:
 * - Present workspace-level scan insights
 * - Display action-history controls
 * - Summarize local filesystem scan coverage
 * - Explain DTM queue and confidence concepts
 *
 * This component DOES NOT:
 * - Load scan data
 * - Perform filesystem actions
 * - Manage action-history persistence
 * - Execute restore operations
 */

import ActionHistoryPanel, {
  type ActionHistoryEntry,
  type HistoryFilter,
} from './ActionHistoryPanel';
import InfoPanel from './InfoPanel';
import SectionCard from './SectionCard';

import type { ScanResult } from '../types/dtm';

type SupportInsights = {
  summary: string;
  review: number;
  archive: number;
  remove: number;
  oldFiles: number;
};

type SupportDrawerProps = {
  isOpen: boolean;
  onClose: () => void;

  insights: SupportInsights | null;
  scanData: ScanResult | null;

  historyFilter: HistoryFilter;
  filteredActionHistory: ActionHistoryEntry[];
  selectedHistoryIds: Set<string>;
  selectedUndoableCount: number;

  busyHistoryId: string | null;

  isBulkRestoring: boolean;
  isBulkActing: boolean;
  isScanning: boolean;

  canUndoHistoryEntry: (
    entry: ActionHistoryEntry
  ) => boolean;

  onHistoryFilterChange: (
    filter: HistoryFilter
  ) => void;

  onToggleSelectedHistoryId: (
    entryId: string
  ) => void;

  onUndoHistoryEntry: (
    entry: ActionHistoryEntry
  ) => void;

  onBulkRestoreSelected: () => void;
  onClearActionHistory: () => void;
};

export default function SupportDrawer({
  isOpen,
  onClose,
  insights,
  scanData,
  historyFilter,
  filteredActionHistory,
  selectedHistoryIds,
  selectedUndoableCount,
  busyHistoryId,
  isBulkRestoring,
  isBulkActing,
  isScanning,
  canUndoHistoryEntry,
  onHistoryFilterChange,
  onToggleSelectedHistoryId,
  onUndoHistoryEntry,
  onBulkRestoreSelected,
  onClearActionHistory,
}: SupportDrawerProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
      />

      <div className="fixed left-0 top-0 z-50 h-full w-[340px] overflow-y-auto border-r border-slate-200 bg-white shadow-2xl">
        <div className="space-y-6 p-6">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">
              Workspace Support
            </div>
          </div>

          {insights && (
            <SectionCard
              title="DTM Insights"
              subtitle="High-level interpretation of your current digital environment."
            >
              <div className="space-y-3 text-sm text-slate-700">
                <p className="font-medium text-slate-900">
                  {insights.summary}
                </p>

                <ul className="space-y-1">
                  <li>
                    • {insights.review} files need review
                  </li>
                  <li>
                    • {insights.archive} files can likely be archived
                  </li>
                  <li>
                    • {insights.remove} files appear safe to remove
                  </li>
                </ul>

                <p>
                  Most files have not been modified in over 180 days:{' '}
                  {insights.oldFiles}
                </p>

                <p className="text-slate-600">
                  Recommendation: Start by reviewing unknown files, then
                  archive older compressed files.
                </p>
              </div>
            </SectionCard>
          )}

          <ActionHistoryPanel
            historyFilter={historyFilter}
            filteredActionHistory={filteredActionHistory}
            selectedHistoryIds={selectedHistoryIds}
            selectedUndoableCount={selectedUndoableCount}
            busyHistoryId={busyHistoryId}
            isBulkRestoring={isBulkRestoring}
            isBulkActing={isBulkActing}
            isScanning={isScanning}
            canUndoHistoryEntry={canUndoHistoryEntry}
            onHistoryFilterChange={onHistoryFilterChange}
            onToggleSelectedHistoryId={onToggleSelectedHistoryId}
            onUndoHistoryEntry={onUndoHistoryEntry}
            onBulkRestoreSelected={onBulkRestoreSelected}
            onClearActionHistory={onClearActionHistory}
          />

          {scanData && (
            <SectionCard
              title="Scan Summary"
              subtitle="Current scan scope and bounded result coverage."
            >
              <section className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 shadow-sm">
                <div className="space-y-2 text-sm text-slate-700">
                  <div>
                    <span className="font-semibold">
                      Scan mode:
                    </span>{' '}
                    {scanData.mode}
                  </div>

                  <div>
                    <span className="font-semibold">
                      Detailed review items shown:
                    </span>{' '}
                    {scanData.review_files.length} of{' '}
                    {scanData.review_total}
                  </div>

                  <div>
                    <span className="font-semibold">
                      Detailed archive items shown:
                    </span>{' '}
                    {scanData.archive_candidates.length} of{' '}
                    {scanData.archive_total}
                  </div>

                  <div>
                    <span className="font-semibold">
                      Detailed remove items shown:
                    </span>{' '}
                    {scanData.remove_candidates.length} of{' '}
                    {scanData.remove_total}
                  </div>

                  <div>
                    <span className="font-semibold">
                      Excluded directories:
                    </span>{' '}
                    {scanData.excluded_dirs_count}
                  </div>

                  {scanData.scan_warnings?.length > 0 && (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
                      {scanData.scan_warnings.map(
                        (warning, index) => (
                          <div key={index}>
                            ⚠️ {warning}
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              </section>
            </SectionCard>
          )}

          {scanData && scanData.errors_total > 0 && (
            <SectionCard
              title="Scan Access Notes"
              subtitle="Files DTM could not inspect during this scan."
            >
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <p>
                  DTM skipped or could not inspect{' '}
                  {scanData.errors_total} file
                  {scanData.errors_total === 1 ? '' : 's'} during this
                  scan.
                </p>

                <p className="mt-2 text-xs leading-5 text-slate-500">
                  This is common on active systems. Some files may be
                  temporary, protected by the operating system, or
                  created and removed while scanning.
                </p>
              </div>
            </SectionCard>
          )}

          <SectionCard
            title="Action Insights"
            subtitle="What each queue means and how DTM thinks about file decisions."
          >
            <div className="space-y-3">
              <InfoPanel title="How does DTM work?">
                <p>
                  DTM scans your files and turns them into decision
                  queues instead of showing everything at once.
                </p>

                <p>
                  It is designed to be bounded, explainable, and
                  reversible. DTM suggests actions, but you stay in
                  control.
                </p>
              </InfoPanel>

              <InfoPanel title="What does 'Needs Decision' mean?">
                <p>
                  These files require a user decision before DTM should
                  archive, remove, or keep them in place.
                </p>

                <p>
                  This queue protects user control by keeping uncertain
                  choices explicit.
                </p>
              </InfoPanel>

              <InfoPanel title="What are 'Archive Candidates'?">
                <p>
                  These files are likely worth keeping, but not keeping
                  in your active workspace.
                </p>

                <p>
                  Archiving reduces clutter without destroying
                  information.
                </p>
              </InfoPanel>

              <InfoPanel title="What is the 'Remove Queue'?">
                <p>
                  These files appear temporary, disposable, or
                  low-value based on DTM’s current scan logic.
                </p>

                <p>
                  DTM moves them to Trash rather than permanently
                  deleting them.
                </p>
              </InfoPanel>

              <InfoPanel title="How do duplicate groups work?">
                <p>
                  DTM groups files that appear to be copies of the same
                  item family based on name patterns, size, and
                  structure.
                </p>

                <p>
                  You can select one copy to keep active and archive
                  the others.
                </p>
              </InfoPanel>

              <InfoPanel title="What does confidence mean?">
                <p>
                  Confidence reflects how strongly DTM believes a file
                  belongs in a category.
                </p>

                <p>
                  High confidence means a stronger heuristic match.
                  Lower confidence means more ambiguity.
                </p>
              </InfoPanel>
            </div>
          </SectionCard>
        </div>
      </div>
    </>
  );
}