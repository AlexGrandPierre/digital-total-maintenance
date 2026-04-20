/// <reference types="vite/client" />

type ScanPreset = 'test' | 'desktop' | 'downloads' | 'documents' | 'custom';

type ScanRequestPayload = {
  preset: ScanPreset;
  customPath?: string;
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

type ActionHistoryEntry = {
  id: string;
  timestamp: string;
  action: 'move_to_review' | 'move_to_archive' | 'move_to_trash';
  source_path: string;
  destination_path: string | null;
  status: 'success';
  mode: 'single' | 'bulk';
};

interface ElectronAPI {
  sendScanRequest?: (payload: ScanRequestPayload) => void;
  onScanFinished?: (callback: (data: { output?: string }) => void) => () => void;
  onScanProgress?: (callback: (data: ScanProgress) => void) => () => void;
  moveToReview?: (filePath: string, mode?: 'single' | 'bulk') => Promise<ActionResult>;
  moveToArchive?: (filePath: string, mode?: 'single' | 'bulk') => Promise<ActionResult>;
  moveToTrash?: (filePath: string, mode?: 'single' | 'bulk') => Promise<ActionResult>;
  browseForFolder?: () => Promise<BrowseResult>;
  getActionHistory?: (limit?: number) => Promise<ActionHistoryEntry[]>;
}

interface Window {
  electronAPI?: ElectronAPI;
}