/**
 * dtm.ts
 *
 * Shared TypeScript contracts for Digital Total Maintenance.
 *
 * Responsibilities:
 * - Define local filesystem scan models
 * - Define CSV analysis and review models
 * - Define shared confidence, priority, and action types
 * - Describe data exchanged between the renderer and Electron/backend layers
 *
 * This module DOES NOT:
 * - Contain application logic
 * - Manage React state
 * - Execute Electron actions
 * - Transform backend responses
 *
 * Used by:
 * React components, hooks, and application state.
 *
 * Outputs:
 * Shared TypeScript types for DTM frontend workflows.
 */

// ============================================================================
// Shared Primitive Types
// ============================================================================

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type DuplicateConfidence = 'high' | 'medium';

export type SeverityLevel = 'high' | 'medium' | 'low';

export type PriorityLabel = 'critical' | 'high' | 'medium' | 'low';

export type ReviewPriority = 'high' | 'medium' | 'low';

export type UserRelevance = 'high' | 'medium' | 'low';

export type RecommendedAction = 'keep' | 'ignore' | 'review' | 'archive' | 'remove';

export type UiVisibility = 'normal' | 'hidden_by_default';


// ============================================================================
// Desktop Scan Configuration
// ============================================================================

export type ScanPreset =
  | 'test'
  | 'desktop'
  | 'downloads'
  | 'documents'
  | 'custom'
  | 'csv';

export type SortKey =
  | 'name'
  | 'age_days'
  | 'size'
  | 'confidence'
  | 'review_priority';

export type SortDirection = 'asc' | 'desc';


// ============================================================================
// Desktop Scan Models
// ============================================================================

export type ScanInsightItem = {
  label: string;
  count: number;
};

export type ClassifiedFile = {
  path: string;
  name: string;
  ext: string;
  size: number;
  age_days: number;
  hash: string | null;
  category: string;
  file_kind: string;
  location_context: string;
  context_type: string;
  user_relevance: UserRelevance;
  system_role: string;
  context_reason: string;
  known_type_explanation: string;
  classification_reason: string;
  action_confidence?: ConfidenceLevel;
  confidence: ConfidenceLevel;
  confidence_reason: string;
  recommended_action: RecommendedAction;
  suggested_action_reason: string;
  reason: string;
  risk_flags: string[];
  ui_visibility: UiVisibility;
  review_priority: ReviewPriority | null;
  review_priority_reason: string | null;
};

export type DuplicateGroupItem = {
  path: string;
  name: string;
  ext: string;
  size: number;
  age_days: number;
  category: string;
  confidence: ConfidenceLevel;
  priority_score?: number;
  priority_label?: PriorityLabel;
  priority_reason?: string;
  recommended_action: RecommendedAction;
  reason: string;
  ui_visibility: UiVisibility;
};

export type DuplicateGroup = {
  group_id: string;
  confidence: DuplicateConfidence;
  reason: string;
  normalized_name: string;
  items: DuplicateGroupItem[];
  items_total?: number;
  hidden_items_count?: number;
};

export type PatternPreview = {
  filter: {
    key: string;
    value: string;
  };
  review: {
    total: number;
    items: ClassifiedFile[];
  };
  archive: {
    total: number;
    items: ClassifiedFile[];
  };
  remove: {
    total: number;
    items: ClassifiedFile[];
  };
};


// ============================================================================
// CSV Analysis Models
// ============================================================================

export type CsvColumnProfile = {
  name: string;
  inferred_type:
    | 'text'
    | 'number'
    | 'date'
    | 'boolean'
    | 'mixed'
    | 'empty';
  non_empty_count: number;
  empty_count: number;
  unique_count: number;
  sample_values: string[];
};

export type CsvSuggestion = {
  id: string;
  label: string;
  severity: SeverityLevel;
  reason: string;
  columns?: string[];
  count?: number;
};

export type CsvDataQualityInsight = {
  id: string;
  category:
    | 'duplicates'
    | 'missing_values'
    | 'empty_structure'
    | 'type_quality'
    | 'suspicious_values';
  severity: SeverityLevel;
  title: string;
  summary: string;
  count: number;
  affected_columns?: string[];
  issue_id?: string;
  recommended_action: string;
};

export type CsvSuspiciousValueExample = {
  row_number: number;
  column: string;
  value: string;
  issues: string[];
  issue_id?: string;
  severity_score?: number;
  severity_label?: PriorityLabel;
  severity_reason?: string;
  row_missing_count?: number;
};

export type CsvSuspiciousValueSummary = {
  total: number;
  by_column: Record<string, number>;
  by_issue: Record<string, number>;
  examples: CsvSuspiciousValueExample[];
  row_numbers: number[];
};


// ============================================================================
// CSV Duplicate Models
// ============================================================================

export type CsvDuplicateGroupRow = {
  row_number: number;
  values: Record<string, string>;
};

export type CsvDuplicateGroup = {
  group_id: string;
  confidence: DuplicateConfidence;
  priority_score?: number;
  priority_label?: PriorityLabel;
  priority_reason?: string;
  reason: string;
  matching_columns: string[];
  varying_id_columns: string[];
  rows: CsvDuplicateGroupRow[];
  row_numbers: number[];
  rows_total: number;
  hidden_rows_count: number;
};


// ============================================================================
// CSV Scan Result
// ============================================================================

export type CsvScanResult = {
  type: 'csv_scan';
  success: boolean;
  scanned_at?: string;
  path: string;
  filename: string;
  row_count: number;
  column_count: number;
  columns: string[];
  missing_by_column: Record<string, number>;
  preview_rows: Record<string, string | number | null>[];
  column_profiles: Record<string, CsvColumnProfile>;
  duplicate_row_count: number;
  duplicate_groups: CsvDuplicateGroup[];
  empty_columns: string[];
  near_empty_columns: string[];
  suggestions: CsvSuggestion[];
  data_quality_insights: CsvDataQualityInsight[];
  suspicious_value_summary: CsvSuspiciousValueSummary;
  error?: string;
  duplicate_row_numbers_to_exclude?: number[];
  duplicate_groups_total: number;

  review_index?: {
    dataset_id: string;
    csv_path: string;
    duplicate_groups_total: number;
    suspicious_values_total: number;
    duplicate_index_path?: string;
    suspicious_index_path?: string;
  };

  review_queue?: {
    high_priority: {
      group_id: string;
      confidence: number;
      rows_total: number;
      reason: string;
    }[];

    medium_priority: {
      group_id: string;
      confidence: number;
      rows_total: number;
      reason: string;
    }[];

    low_priority: {
      group_id: string;
      confidence: number;
      rows_total: number;
      reason: string;
    }[];
  };

  duplicate_group_samples?: {
    high_priority: CsvDuplicateGroup[];
    medium_priority: CsvDuplicateGroup[];
    low_priority: CsvDuplicateGroup[];
  };
};


// ============================================================================
// Local Filesystem Scan Result
// ============================================================================

export type ScanResult = {
  scanned_at: string;
  folder: string;
  mode: string;
  scan_warnings: string[];
  total_files: number;

  review_files: ClassifiedFile[];
  review_total: number;

  system_files: ClassifiedFile[];
  system_total: number;

  archive_candidates: ClassifiedFile[];
  archive_total: number;

  remove_candidates: ClassifiedFile[];
  remove_total: number;

  duplicates: DuplicateGroup[];
  duplicates_total: number;

  age_buckets: Record<string, number>;
  by_ext: Record<string, number>;

  hidden_duplicate_groups_count: number;
  duplicate_row_numbers_to_exclude: number[];

  errors: Array<{
    name?: string;
    path: string;
    error_type:
      | 'permission_denied'
      | 'missing_during_scan'
      | 'metadata_read_failed'
      | 'invalid_path_or_name'
      | 'symlink_or_reference_issue'
      | 'invalid_filesystem_entry'
      | 'io_failure'
      | 'unknown_scan_error';
    error: string;
    raw_error?: string;
  }>;

  errors_total: number;

  error_summary: {
    permission_denied: number;
    missing_during_scan: number;
    metadata_read_failed: number;
    invalid_path_or_name: number;
    symlink_or_reference_issue: number;
    invalid_filesystem_entry: number;
    io_failure: number;
    unknown_scan_error: number;
  };

  excluded_dirs_count: number;

  detail_caps: {
    review_files: number;
    system_files: number;
    archive_candidates: number;
    remove_candidates: number;
    duplicates: number;
    errors: number;
  };

  scan_insights?: {
    queue_summary: ScanInsightItem[];
    review_context_summary: ScanInsightItem[];
    archive_context_summary: ScanInsightItem[];
    remove_context_summary: ScanInsightItem[];
    top_review_reasons: ScanInsightItem[];
    pattern_previews?: Record<string, PatternPreview>;
  };
};