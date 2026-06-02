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

type ScanProgress = {
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
            current_stage:
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
    duplicate_row_numbers_to_exclude?: number[];
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
}

interface Window {
  electronAPI?: ElectronAPI;
}