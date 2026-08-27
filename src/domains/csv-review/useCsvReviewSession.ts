/**
 * useCsvReviewSession.ts
 *
 * State and commands for CSV review sessions and adjudication.
 *
 * Responsibilities:
 * - Own duplicate and suspicious-value decision state
 * - Load, auto-save, and reset the current CSV review session
 * - Coordinate single and bulk decision commands
 * - Expose decision summaries for the active dataset
 * - Preserve the legacy dataset-decision loading path
 *
 * This module DOES NOT:
 * - Scan, filter, paginate, or export CSV data
 * - Define dataset or source identity semantics
 * - Own review-index state
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  loadCsvReviewSession as requestCsvReviewSession,
  readLegacyDatasetDecisions,
  saveCsvReviewSession,
} from '../../services/ipc';
import type {
  CsvDuplicateGroup,
  CsvSuspiciousValueExample,
} from '../../types/dtm';
import {
  createBulkDatasetDecisionRecords,
  createDatasetDecisionRecord,
  createSuspiciousDecisionRecord,
  getSuspiciousIssueId as selectSuspiciousIssueId,
  summarizeDatasetDecisions,
  summarizeSuspiciousDecisions,
} from './selectors';
import type { SuspiciousIssueInput } from './selectors';
import type {
  CsvReviewSessionMetadata,
  CsvReviewStatus,
  DatasetDecision,
  DatasetDecisionRecord,
  SuspiciousDecision,
  SuspiciousDecisionRecord,
} from './types';

type UseCsvReviewSessionOptions = {
  csvPath?: string;
  csvReady: boolean;
  duplicateIndexTotal: number;
  suspiciousIndexTotal: number;
  onStatusChange: (status: CsvReviewStatus | null) => void;
};

export function useCsvReviewSession({
  csvPath,
  csvReady,
  duplicateIndexTotal,
  suspiciousIndexTotal,
  onStatusChange,
}: UseCsvReviewSessionOptions) {
  const [datasetDecisions, setDatasetDecisions] = useState<
    Record<string, DatasetDecisionRecord>
  >({});
  const [suspiciousDecisions, setSuspiciousDecisions] = useState<
    Record<string, SuspiciousDecisionRecord>
  >({});
  const [csvReviewSession, setCsvReviewSession] =
    useState<CsvReviewSessionMetadata | null>(null);
  const [isCsvReviewSessionReady, setIsCsvReviewSessionReady] = useState(false);
  const [busyDatasetDecisionId, setBusyDatasetDecisionId] = useState<
    string | null
  >(null);
  const [busySuspiciousDecisionId, setBusySuspiciousDecisionId] = useState<
    string | null
  >(null);

  const loadLegacyDatasetDecisions = useCallback(async () => {
    try {
      const result = await readLegacyDatasetDecisions();

      if (result?.success && result.decisions) {
        setDatasetDecisions(
          result.decisions as Record<string, DatasetDecisionRecord>,
        );
      }
    } catch {
      setDatasetDecisions({});
    }
  }, []);

  const loadCsvReviewSession = useCallback(async (path: string) => {
    setIsCsvReviewSessionReady(false);

    try {
      const result = await requestCsvReviewSession(path);

      if (result?.success && result.session) {
        setCsvReviewSession({
          csv_path: result.session.csv_path,
          session_id: result.session.session_id,
          last_updated: result.session.last_updated,
        });
        setDatasetDecisions(
          (result.session.duplicate_decisions ?? {}) as Record<
            string,
            DatasetDecisionRecord
          >,
        );
        setSuspiciousDecisions(
          (result.session.suspicious_decisions ?? {}) as Record<
            string,
            SuspiciousDecisionRecord
          >,
        );
      }
    } catch {
      setCsvReviewSession(null);
    } finally {
      setIsCsvReviewSessionReady(true);
    }
  }, []);

  useEffect(() => {
    if (!csvReady || !csvPath || !isCsvReviewSessionReady) return;

    const timeoutId = window.setTimeout(() => {
      saveCsvReviewSession(
        csvPath,
        datasetDecisions,
        suspiciousDecisions,
      );
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [
    csvPath,
    csvReady,
    datasetDecisions,
    suspiciousDecisions,
    isCsvReviewSessionReady,
  ]);

  const handleSaveDatasetDecision = useCallback(
    async (groupId: string, decision: DatasetDecision) => {
      if (!csvReady || !csvPath) return;

      setBusyDatasetDecisionId(groupId);
      onStatusChange(null);

      const record = createDatasetDecisionRecord(
        groupId,
        decision,
        csvPath,
        new Date().toISOString(),
      );

      try {
        setDatasetDecisions((previous) => ({
          ...previous,
          [groupId]: record,
        }));
        onStatusChange({
          tone: 'success',
          message: `Saved duplicate decision: ${decision.replace(/_/g, ' ')}`,
        });
      } catch (error) {
        onStatusChange({
          tone: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Unexpected dataset decision failure.',
        });
      } finally {
        setBusyDatasetDecisionId(null);
      }
    },
    [csvPath, csvReady, onStatusChange],
  );

  const handleBulkDatasetDecision = useCallback(
    async (decision: DatasetDecision, groups: CsvDuplicateGroup[]) => {
      if (!csvReady || !csvPath) return;

      onStatusChange(null);
      const records = createBulkDatasetDecisionRecords(
        groups,
        decision,
        csvPath,
        new Date().toISOString(),
      );

      setDatasetDecisions((previous) => ({
        ...previous,
        ...records,
      }));
      onStatusChange({
        tone: 'success',
        message: `Marked ${groups.length} visible duplicate group(s) as ${decision.replace(/_/g, ' ')}.`,
      });
    },
    [csvPath, csvReady, onStatusChange],
  );

  const getSuspiciousIssueId = useCallback(
    (example: SuspiciousIssueInput) =>
      selectSuspiciousIssueId(example, csvPath),
    [csvPath],
  );

  const handleSaveSuspiciousDecision = useCallback(
    async (
      example: Pick<CsvSuspiciousValueExample, 'row_number' | 'column'>,
      decision: SuspiciousDecision,
    ) => {
      if (!csvReady || !csvPath) return;

      const issueId = getSuspiciousIssueId(example);
      setBusySuspiciousDecisionId(issueId);
      onStatusChange(null);

      const record = createSuspiciousDecisionRecord(
        example,
        decision,
        csvPath,
        new Date().toISOString(),
      );

      try {
        setSuspiciousDecisions((previous) => ({
          ...previous,
          [issueId]: record,
        }));
        onStatusChange({
          tone: 'success',
          message: `Saved suspicious value decision: ${decision.replace(/_/g, ' ')}`,
        });
      } catch (error) {
        onStatusChange({
          tone: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Unexpected suspicious value decision failure.',
        });
      } finally {
        setBusySuspiciousDecisionId(null);
      }
    },
    [csvPath, csvReady, getSuspiciousIssueId, onStatusChange],
  );

  const handleBulkSuspiciousDecision = useCallback(
    async (
      decision: SuspiciousDecision,
      examples: CsvSuspiciousValueExample[],
    ) => {
      if (!csvReady || !csvPath) return;

      onStatusChange(null);
      let successCount = 0;
      let failureCount = 0;

      for (const example of examples) {
        try {
          const record = createSuspiciousDecisionRecord(
            example,
            decision,
            csvPath,
            new Date().toISOString(),
          );
          setSuspiciousDecisions((previous) => ({
            ...previous,
            [record.issue_id]: record,
          }));
          successCount += 1;
        } catch {
          failureCount += 1;
        }
      }

      onStatusChange({
        tone: failureCount === 0 ? 'success' : 'error',
        message:
          failureCount === 0
            ? `Marked ${successCount} visible suspicious value(s) as ${decision.replace(/_/g, ' ')}.`
            : `Bulk suspicious decision finished with partial success: ${successCount} succeeded, ${failureCount} failed.`,
      });
    },
    [csvPath, csvReady, onStatusChange],
  );

  const handleResetDatasetDecisions = useCallback(
    async (resetReviewIndex: () => void) => {
      if (!csvPath) return;

      const confirmed = window.confirm(
        'Reset all duplicate and suspicious decisions for this dataset?',
      );
      if (!confirmed) return;

      try {
        const emptyDuplicateDecisions: Record<
          string,
          DatasetDecisionRecord
        > = {};
        const emptySuspiciousDecisions: Record<
          string,
          SuspiciousDecisionRecord
        > = {};

        setDatasetDecisions(emptyDuplicateDecisions);
        setSuspiciousDecisions(emptySuspiciousDecisions);
        resetReviewIndex();

        const result = await saveCsvReviewSession(
          csvPath,
          emptyDuplicateDecisions,
          emptySuspiciousDecisions,
        );

        if (result?.success && result.session) {
          setCsvReviewSession({
            csv_path: result.session.csv_path,
            session_id: result.session.session_id,
            last_updated: result.session.last_updated,
          });
          onStatusChange({
            tone: 'success',
            message:
              'Reset duplicate and suspicious decisions for this dataset.',
          });
        } else {
          onStatusChange({
            tone: 'error',
            message:
              result?.message || 'Failed to reset dataset decisions.',
          });
        }
      } catch (error) {
        onStatusChange({
          tone: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Unexpected dataset reset failure.',
        });
      }
    },
    [csvPath, onStatusChange],
  );

  const datasetDecisionSummary = useMemo(
    () =>
      summarizeDatasetDecisions(
        datasetDecisions,
        csvPath,
        duplicateIndexTotal,
      ),
    [csvPath, datasetDecisions, duplicateIndexTotal],
  );
  const suspiciousDecisionSummary = useMemo(
    () =>
      summarizeSuspiciousDecisions(
        suspiciousDecisions,
        csvPath,
        suspiciousIndexTotal,
      ),
    [csvPath, suspiciousDecisions, suspiciousIndexTotal],
  );

  return {
    datasetDecisions,
    suspiciousDecisions,
    csvReviewSession,
    busyDatasetDecisionId,
    busySuspiciousDecisionId,
    datasetDecisionSummary,
    suspiciousReviewedCount: suspiciousDecisionSummary.reviewed,
    suspiciousPendingCount: suspiciousDecisionSummary.pending,
    suspiciousCompletionPercentage:
      suspiciousDecisionSummary.completionPercentage,
    getSuspiciousIssueId,
    loadLegacyDatasetDecisions,
    loadCsvReviewSession,
    handleSaveDatasetDecision,
    handleBulkDatasetDecision,
    handleSaveSuspiciousDecision,
    handleBulkSuspiciousDecision,
    handleResetDatasetDecisions,
  };
}
