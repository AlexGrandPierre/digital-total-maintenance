export type ScanPreset = 'test' | 'desktop' | 'downloads' | 'documents' | 'custom';

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
  };
};