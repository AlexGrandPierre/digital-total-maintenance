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

interface ElectronAPI {
  sendScanRequest?: (payload: ScanRequestPayload) => void;
  onScanFinished?: (callback: (data: { output?: string }) => void) => void;
  moveToReview?: (filePath: string) => Promise<ActionResult>;
  moveToArchive?: (filePath: string) => Promise<ActionResult>;
  moveToTrash?: (filePath: string) => Promise<ActionResult>;
}

interface Window {
  electronAPI?: ElectronAPI;
}