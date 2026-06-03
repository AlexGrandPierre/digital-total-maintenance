export type ScanPreset =
  | 'test'
  | 'desktop'
  | 'downloads'
  | 'documents'
  | 'custom'
  | 'csv';

export type SortKey = 'name' | 'age_days' | 'size' | 'confidence' | 'review_priority';
export type SortDirection = 'asc' | 'desc';

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
  user_relevance: 'high' | 'medium' | 'low';
  system_role: string;
  context_reason: string;
  known_type_explanation: string;
  classification_reason: string;
  action_confidence?: 'high' | 'medium' | 'low';
  confidence: 'high' | 'medium' | 'low';
  confidence_reason: string;
  recommended_action: 'keep' | 'ignore' | 'review' | 'archive' | 'remove';
  suggested_action_reason: string;
  reason: string;
  risk_flags: string[];
  ui_visibility: 'normal' | 'hidden_by_default';
  review_priority: 'high' | 'medium' | 'low' | null;
  review_priority_reason: string | null;
};

export type DuplicateGroupItem = {
  path: string;
  name: string;
  ext: string;
  size: number;
  age_days: number;
  category: string;
  confidence: 'high' | 'medium' | 'low';
  recommended_action: 'keep' | 'ignore' | 'review' | 'archive' | 'remove';
  reason: string;
  ui_visibility: 'normal' | 'hidden_by_default';
};

export type DuplicateGroup = {
  group_id: string;
  confidence: 'high' | 'medium';
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

export type CsvColumnProfile = {
  name: string;
  inferred_type: 'text' | 'number' | 'date' | 'boolean' | 'mixed' | 'empty';
  non_empty_count: number;
  empty_count: number;
  unique_count: number;
  sample_values: string[];
};

export type CsvSuggestion = {
  id: string;
  label: string;
  severity: 'low' | 'medium' | 'high';
  reason: string;
  columns?: string[];
  count?: number;
};

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

export type CsvDataQualityInsight = {
  id: string;
  category:
    | 'duplicates'
    | 'missing_values'
    | 'empty_structure'
    | 'type_quality'
    | 'suspicious_values';
  severity: 'low' | 'medium' | 'high';
  title: string;
  summary: string;
  count: number;
  affected_columns?: string[];
  recommended_action: string;
};

export type CsvSuspiciousValueExample = {
  row_number: number;
  column: string;
  value: string;
  issues: string[];
};

export type CsvSuspiciousValueSummary = {
  total: number;
  by_column: Record<string, number>;
  by_issue: Record<string, number>;
  examples: CsvSuspiciousValueExample[];
  row_numbers: number[];
};

export type CsvDuplicateGroupRow = {
  row_number: number;
  values: Record<string, string>;
};

export type CsvDuplicateGroup = {
  group_id: string;
  confidence: 'high' | 'medium';
  reason: string;
  matching_columns: string[];
  varying_id_columns: string[];
  rows: CsvDuplicateGroupRow[];
  row_numbers: number[];
  rows_total: number;
  hidden_rows_count: number;
};

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