export type ScanPreset = 'test' | 'desktop' | 'downloads' | 'documents' | 'custom';

export type SortKey = 'name' | 'age_days' | 'size' | 'confidence';
export type SortDirection = 'asc' | 'desc';

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
  known_type_explanation: string;
  classification_reason: string;
  confidence: 'high' | 'medium' | 'low';
  confidence_reason: string;
  recommended_action: 'keep' | 'ignore' | 'review' | 'archive' | 'remove';
  suggested_action_reason: string;
  reason: string;
  risk_flags: string[];
  ui_visibility: 'normal' | 'hidden_by_default';
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

  errors: Array<{ path: string; error: string }>;
  errors_total: number;

  excluded_dirs_count: number;

  detail_caps: {
    review_files: number;
    system_files: number;
    archive_candidates: number;
    remove_candidates: number;
    duplicates: number;
    errors: number;
  };
};