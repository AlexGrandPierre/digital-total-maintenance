/// <reference types="vite/client" />

type ScanRequestPayload = {
  preset: 'test' | 'desktop' | 'downloads' | 'documents' | 'custom' | 'csv';
  customPath?: string;
  csvPath?: string;
};

type ActionHistoryEntry = {
  id: string;
  timestamp: string;
  action:
    | 'move_to_review'
    | 'move_to_archive'
    | 'move_to_trash'
    | 'restore_from_review'
    | 'restore_from_archive'
    | 'restore_from_trash';
  source_path: string;
  destination_path?: string | null;
  status: 'success' | 'error';
  mode: 'single' | 'bulk';
  reverts_history_id?: string | null;
};

type ActionResult = {
  success: boolean;
  message: string;
  destination?: string;
  path?: string;
  timestamp?: string;
  history_entry?: ActionHistoryEntry;
};

type BrowseResult = {
  success: boolean;
  path: string;
};

type FileScanProgress = {
  type: 'progress';
  status: 'starting' | 'scanning' | 'finalizing';
  target: string;
  files_scanned: number;
  current_path: string;
  elapsed_seconds: number;
  review_total: number;
  archive_total: number;
  remove_total: number;
  duplicates_total: number;
  excluded_dirs_count?: number;
};

type CsvScanProgress = {
  type: 'csv_progress';
  status: 'scanning';
  target: string;
  rows_scanned: number;
  elapsed_seconds: number;
  rows_per_second?: number;
  duplicate_candidates?: number;
  suspicious_values?: number;
  missing_values?: number;
  total_rows_estimate?: number | null;
  current_stage:
    | 'starting'
    | 'analyzing_rows'
    | 'building_duplicate_groups'
    | 'finalizing_results';
};

type ScanProgress = FileScanProgress | CsvScanProgress;

interface ElectronAPI {
  sendScanRequest?: (payload: ScanRequestPayload) => void;
  onScanFinished?: (callback: (data: { output?: string }) => void) => () => void;
  onScanProgress?: (
    callback: (
      data:
        | {
            type?: 'progress';
            status: 'starting' | 'scanning' | 'finalizing';
            target: string;
            files_scanned: number;
            current_path: string;
            elapsed_seconds: number;
            review_total: number;
            archive_total: number;
            remove_total: number;
            duplicates_total: number;
            excluded_dirs_count?: number;
          }
        | {
            type: 'csv_progress';
            status: 'scanning';
            target: string;
            rows_scanned: number;
            elapsed_seconds: number;
            rows_per_second?: number;
            duplicate_candidates?: number;
            suspicious_values?: number;
            missing_values?: number;
            total_rows_estimate?: number | null;
            current_stage:
              | 'starting'
              | 'analyzing_rows'
              | 'building_duplicate_groups'
              | 'finalizing_results';
          }
    ) => void
  ) => () => void;

  moveToReview?: (filePath: string, mode?: 'single' | 'bulk') => Promise<ActionResult>;
  moveToArchive?: (filePath: string, mode?: 'single' | 'bulk') => Promise<ActionResult>;
  moveToTrash?: (filePath: string, mode?: 'single' | 'bulk') => Promise<ActionResult>;

  browseForFolder?: () => Promise<BrowseResult>;
  browseForCsv?: () => Promise<BrowseResult>;

  getActionHistory?: (limit?: number) => Promise<ActionHistoryEntry[]>;
  restoreFromHistory?: (entry: ActionHistoryEntry) => Promise<ActionResult>;

  clearActionHistory?: () => Promise<{
    success: boolean;
    message: string;
  }>;

  runCsvAction?: (payload: {
    action:
  | 'export_duplicate_groups'
  | 'export_suspicious_rows'
  | 'export_approved_duplicates'
  | 'export_duplicate_needs_review'
  | 'export_corrupted_suspicious_rows'
  | 'export_suspicious_needs_review'
  | 'export_clean_copy';
    csv_path: string;
    duplicate_groups?: unknown[];
    suspicious_examples?: unknown[];
    suspicious_row_numbers?: number[];
    remove_empty_columns?: boolean;
    remove_empty_rows?: boolean;
    trim_whitespace?: boolean;
    exclude_duplicate_rows?: boolean;
    exclude_suspicious_rows?: boolean;
    suspicious_decisions?: Record<string, unknown>;
    duplicate_row_numbers_to_exclude?: number[];
    dataset_decisions?: Record<string, unknown>;
  }) => Promise<{
    success: boolean;
    action?: string;
    message: string;
    export_path?: string;
    row_count?: number;
  }>;

  openCsvExportFolder?: () => Promise<{
    success: boolean;
    message: string;
    path?: string;
  }>;

  getDatasetDecisions?: () => Promise<{
    success: boolean;
    decisions: Record<
      string,
      {
        group_id: string;
        decision:
          | 'approved_duplicate'
          | 'legitimate_records'
          | 'needs_review'
          | 'ignored'
          | 'pending';
        csv_path?: string;
        updated_at: string;
      }
    >;
    message?: string;
  }>;
  
  saveDatasetDecision?: (payload: {
    group_id: string;
    decision:
      | 'approved_duplicate'
      | 'legitimate_records'
      | 'needs_review'
      | 'ignored'
      | 'pending';
    csv_path: string;
  }) => Promise<{
    success: boolean;
    message: string;
    decision?: {
      group_id: string;
      decision:
        | 'approved_duplicate'
        | 'legitimate_records'
        | 'needs_review'
        | 'ignored'
        | 'pending';
      csv_path?: string;
      updated_at: string;
    };
  }>;

  loadCsvReviewSession?: (payload: {
    csv_path: string;
  }) => Promise<{
    success: boolean;
    message?: string;
    session?: {
      csv_path: string;
      session_id: string;
      last_updated: string | null;
      duplicate_decisions: Record<string, unknown>;
      suspicious_decisions: Record<string, unknown>;
    };
  }>;
  
  saveCsvReviewSession?: (payload: {
    csv_path: string;
    duplicate_decisions: Record<string, unknown>;
    suspicious_decisions: Record<string, unknown>;
  }) => Promise<{
    success: boolean;
    message: string;
    path?: string;
    session?: {
      csv_path: string;
      session_id: string;
      last_updated: string | null;
      duplicate_decisions: Record<string, unknown>;
      suspicious_decisions: Record<string, unknown>;
    };
  }>;

  openDtmFolder: () => Promise<{
    success: boolean;
    path?: string;
    message: string;
  }>;

  resetDatasetDecisions: (payload: {
    csv_path: string;
  }) => Promise<{
    success: boolean;
    message: string;
    removed_count?: number;
  }>;

  bulkFileAction?: (payload: {
    action: 'review' | 'archive' | 'remove';
    paths: string[];
    mode: 'single' | 'bulk';
  }) => Promise<{
    success: boolean;
    success_count: number;
    failure_count: number;
    results: Array<{
      success: boolean;
      source_path: string;
      destination_path?: string;
      message?: string;
    }>;
    message?: string;
  }>;

  bulkRestoreFromHistory?: (payload: {
    entries: ActionHistoryEntry[];
    mode: 'bulk';
  }) => Promise<{
    success: boolean;
    partial_success?: boolean;
    message: string;
    action: 'batch_restore';
    mode: 'bulk';
    total: number;
    success_count: number;
    failure_count: number;
    results: Array<{
      success: boolean;
      message: string;
      action: string;
      path?: string;
      source_path?: string;
      destination?: string;
      destination_path?: string;
      restored_from_history_id?: string;
      history_entry?: ActionHistoryEntry;
    }>;
  }>;
}

interface Window {
  electronAPI?: ElectronAPI;
}