/// <reference types="vite/client" />

type ScanMode = 'test' | 'desktop';

type ActionResult = {
  success: boolean;
  message: string;
  destination?: string;
  path?: string;
  timestamp?: string;
};

interface ElectronAPI {
  sendScanRequest?: (mode?: ScanMode) => void;
  onScanFinished?: (callback: (data: { output?: string }) => void) => void;
  moveToReview?: (filePath: string) => Promise<ActionResult>;
  moveToArchive?: (filePath: string) => Promise<ActionResult>;
  moveToTrash?: (filePath: string) => Promise<ActionResult>;
}

interface Window {
  electronAPI?: ElectronAPI;
}