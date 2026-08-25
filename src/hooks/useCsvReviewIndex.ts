/**
 * useCsvReviewIndex.ts
 *
 * Pagination and loading state for the CSV Review workspace.
 *
 * Responsibilities:
 * - Initialize review state from scan results
 * - Track duplicate and suspicious-value review pages
 * - Request additional review-index batches through Electron
 * - Track pagination totals and loading state
 * - Reset loaded review pages without clearing persisted decisions
 *
 * This module DOES NOT:
 * - Persist review decisions
 * - Scan CSV datasets
 * - Export CSV files
 * - Render review UI
 *
 * Used by:
 * CSV review workspace components and application state.
 */

import { useState } from 'react';

import type {
  CsvDuplicateGroup,
  CsvScanResult,
  CsvSuspiciousValueExample,
} from '../types/dtm';


// ============================================================================
// Review Pagination Configuration
// ============================================================================

type ReviewCapacity = 25 | 50 | 100 | 250;

const INITIAL_REVIEW_BATCH_SIZE = 25;


// ============================================================================
// CSV Review Index Hook
// ============================================================================

export function useCsvReviewIndex() {
  const [loadedDuplicateGroups, setLoadedDuplicateGroups] =
    useState<CsvDuplicateGroup[]>([]);

  const [loadedSuspiciousExamples, setLoadedSuspiciousExamples] =
    useState<CsvSuspiciousValueExample[]>([]);

  const [duplicateIndexOffset, setDuplicateIndexOffset] = useState(0);
  const [suspiciousIndexOffset, setSuspiciousIndexOffset] = useState(0);

  const [duplicateIndexTotal, setDuplicateIndexTotal] = useState(0);
  const [suspiciousIndexTotal, setSuspiciousIndexTotal] = useState(0);

  const [duplicateHasMore, setDuplicateHasMore] = useState(false);
  const [suspiciousHasMore, setSuspiciousHasMore] = useState(false);

  const [isLoadingDuplicatePage, setIsLoadingDuplicatePage] = useState(false);
  const [isLoadingSuspiciousPage, setIsLoadingSuspiciousPage] = useState(false);


  // ==========================================================================
  // Initialization
  // ==========================================================================

  const initializeFromScan = (scan: CsvScanResult) => {
    const duplicateGroups = (scan.duplicate_groups ?? []).slice(
      0,
      INITIAL_REVIEW_BATCH_SIZE
    );

    const suspiciousExamples = (
      scan.suspicious_value_summary?.examples ?? []
    ).slice(0, INITIAL_REVIEW_BATCH_SIZE);

    const duplicateTotal = Math.max(
      scan.review_index?.duplicate_groups_total ?? 0,
      scan.duplicate_groups_total ?? 0,
      duplicateGroups.length
    );

    const suspiciousTotal = Math.max(
      scan.review_index?.suspicious_values_total ?? 0,
      scan.suspicious_value_summary?.total ?? 0,
      suspiciousExamples.length
    );

    setLoadedDuplicateGroups(duplicateGroups);
    setLoadedSuspiciousExamples(suspiciousExamples);

    setDuplicateIndexOffset(duplicateGroups.length);
    setSuspiciousIndexOffset(suspiciousExamples.length);

    setDuplicateIndexTotal(duplicateTotal);
    setSuspiciousIndexTotal(suspiciousTotal);

    setDuplicateHasMore(duplicateGroups.length < duplicateTotal);

    setSuspiciousHasMore(
      suspiciousExamples.length < suspiciousTotal ||
        suspiciousExamples.length < 1000
    );
  };


  // ==========================================================================
  // Duplicate Review Paging
  // ==========================================================================

  const loadNextDuplicateBatch = async (
    csvPath: string,
    batchSize: ReviewCapacity,
    excludeIds: string[] = []
  ) => {
    if (isLoadingDuplicatePage || !duplicateHasMore) {
      return {
        added: 0,
        loadedTotal: loadedDuplicateGroups.length,
      };
    }

    setIsLoadingDuplicatePage(true);

    try {
      const response = await window.electronAPI?.loadMoreDuplicateGroups?.({
        csv_path: csvPath,
        offset:
          excludeIds.length > 0
            ? loadedDuplicateGroups.filter(
                (group) => !excludeIds.includes(group.group_id)
              ).length
            : duplicateIndexOffset,
        limit: batchSize,
        exclude_ids: excludeIds,
      });

      if (!response?.success || !Array.isArray(response.items)) {
        return {
          added: 0,
          loadedTotal: loadedDuplicateGroups.length,
        };
      }

      const nextItems = response.items as CsvDuplicateGroup[];

      const nextLoadedTotal =
        loadedDuplicateGroups.length + nextItems.length;

      setLoadedDuplicateGroups((existing) => [
        ...existing,
        ...nextItems,
      ]);

      setDuplicateIndexOffset(response.next_offset);
      setDuplicateIndexTotal(response.total);

      setDuplicateHasMore(
        response.has_more ||
          response.next_offset < response.total
      );

      return {
        added: nextItems.length,
        loadedTotal: nextLoadedTotal,
      };
    } finally {
      setIsLoadingDuplicatePage(false);
    }
  };


  // ==========================================================================
  // Suspicious Value Paging
  // ==========================================================================

  const loadNextSuspiciousBatch = async (
    csvPath: string,
    batchSize: ReviewCapacity,
    excludeIds: string[] = []
  ) => {
    if (isLoadingSuspiciousPage || !suspiciousHasMore) {
      return;
    }

    setIsLoadingSuspiciousPage(true);

    try {
      const response = await window.electronAPI?.loadMoreSuspiciousValues?.({
        csv_path: csvPath,
        offset:
          excludeIds.length > 0
            ? loadedSuspiciousExamples.filter((example) => {
                const issueId = example.issue_id ?? '';
                return !excludeIds.includes(issueId);
              }).length
            : suspiciousIndexOffset,
        limit: batchSize,
        exclude_ids: excludeIds,
      });

      if (!response?.success || !Array.isArray(response.items)) {
        return;
      }

      const nextItems =
        response.items as CsvSuspiciousValueExample[];

      setLoadedSuspiciousExamples((existing) => [
        ...existing,
        ...nextItems,
      ]);

      setSuspiciousIndexOffset(response.next_offset);
      setSuspiciousIndexTotal(response.total);

      setSuspiciousHasMore(
        response.has_more ||
          response.next_offset < response.total
      );
    } finally {
      setIsLoadingSuspiciousPage(false);
    }
  };


  // ==========================================================================
  // Review Index Reset
  // ==========================================================================

  const resetDuplicateReviewIndex = () => {
    setLoadedDuplicateGroups([]);
    setDuplicateIndexOffset(0);
    setDuplicateHasMore(duplicateIndexTotal > 0);
  };

  const resetSuspiciousReviewIndex = () => {
    setLoadedSuspiciousExamples([]);
    setSuspiciousIndexOffset(0);
    setSuspiciousHasMore(suspiciousIndexTotal > 0);
  };


  // ==========================================================================
  // Public Hook API
  // ==========================================================================

  return {
    loadedDuplicateGroups,
    loadedSuspiciousExamples,

    duplicateIndexTotal,
    suspiciousIndexTotal,

    duplicateHasMore,
    suspiciousHasMore,

    isLoadingDuplicatePage,
    isLoadingSuspiciousPage,

    initializeFromScan,
    loadNextDuplicateBatch,
    loadNextSuspiciousBatch,
    resetDuplicateReviewIndex,
    resetSuspiciousReviewIndex,
  };
}