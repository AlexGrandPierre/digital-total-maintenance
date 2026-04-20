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
  onScanProgress?: (callback: (data: ScanProgress) => void) => () => void;
  moveToReview?: (filePath: string) => Promise<ActionResult>;
  moveToArchive?: (filePath: string) => Promise<ActionResult>;
  moveToTrash?: (filePath: string) => Promise<ActionResult>;
  browseForFolder?: () => Promise<BrowseResult>;
}

interface Window {
  electronAPI?: ElectronAPI;
}