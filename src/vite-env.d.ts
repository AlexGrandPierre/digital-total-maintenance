/// <reference types="vite/client" />

type ScanMode = 'test' | 'desktop';

interface ElectronAPI {
  sendScanRequest?: (mode?: ScanMode) => void;
  onScanFinished?: (callback: (data: { output?: string }) => void) => void;
}

interface Window {
  electronAPI?: ElectronAPI;
}