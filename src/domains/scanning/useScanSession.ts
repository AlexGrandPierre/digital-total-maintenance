/**
 * useScanSession.ts
 *
 * State and commands for the frontend scan lifecycle.
 *
 * Responsibilities:
 * - Own scan inputs, active state, progress, and output
 * - Browse for scan targets and issue scan/rescan requests
 * - Subscribe to Electron scan progress and completion events
 * - Interpret completion as filesystem, CSV, or invalid output
 *
 * This module DOES NOT:
 * - Own filesystem or CSV results after completion
 * - Refresh history or initialize downstream review domains
 * - Mutate queues, decisions, or persistence
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  browseForCsv,
  browseForFolder,
  requestScan,
  subscribeToScanFinished,
  subscribeToScanProgress,
} from '../../services/ipc';
import type { ScanPreset } from '../../types/dtm';
import {
  createStartingScanProgress,
  getScanTargetLabel,
  interpretScanCompletion,
  normalizeScanProgress,
} from './selectors';
import type { ScanCompletion, ScanProgress, ScanStatus } from './types';

type UseScanSessionOptions = {
  isBulkActionInProgress: () => boolean;
  onStatusChange: (status: ScanStatus | null) => void;
  onScanStarted: () => void;
  onScanCompleted: (completion: ScanCompletion) => void;
};

export function useScanSession({
  isBulkActionInProgress,
  onStatusChange,
  onScanStarted,
  onScanCompleted,
}: UseScanSessionOptions) {
  const [scanOutput, setScanOutput] = useState('No scan yet.');
  const [isScanning, setIsScanning] = useState(false);
  const [scanPreset, setScanPreset] = useState<ScanPreset>('desktop');
  const [customPath, setCustomPath] = useState('');
  const [csvPath, setCsvPath] = useState('');
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);

  const onScanCompletedRef = useRef(onScanCompleted);
  onScanCompletedRef.current = onScanCompleted;

  const scanTargetLabel = useMemo(
    () => getScanTargetLabel(scanPreset),
    [scanPreset],
  );

  useEffect(() => {
    const unsubscribeFinished = subscribeToScanFinished((data) => {
      const completion = interpretScanCompletion(data.output);

      setScanOutput(completion.output);
      setIsScanning(false);
      setScanProgress(null);
      onScanCompletedRef.current(completion);
    });

    const unsubscribeProgress = subscribeToScanProgress((data) => {
      setScanProgress(normalizeScanProgress(data));
    });

    return () => {
      unsubscribeFinished?.();
      unsubscribeProgress?.();
    };
  }, []);

  const handleBrowseForFolder = useCallback(async () => {
    try {
      const result = await browseForFolder();

      if (result?.success && result.path) {
        setCustomPath(result.path);
        onStatusChange(null);
      }
    } catch (error) {
      onStatusChange({
        tone: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to open folder picker.',
      });
    }
  }, [onStatusChange]);

  const handleBrowseForCsv = useCallback(async () => {
    try {
      const result = await browseForCsv();

      if (result?.success && result.path) {
        setCsvPath(result.path);
        onStatusChange(null);
      }
    } catch (error) {
      onStatusChange({
        tone: 'error',
        message:
          error instanceof Error ? error.message : 'Failed to open CSV picker.',
      });
    }
  }, [onStatusChange]);

  const handleScan = useCallback(() => {
    if (isBulkActionInProgress()) {
      onStatusChange({
        tone: 'error',
        message:
          'Bulk action in progress. Please wait until it finishes before starting a new scan.',
      });
      return;
    }

    setScanProgress(null);

    const normalizedCustomPath = customPath.trim();
    const normalizedCsvPath = csvPath.trim();

    if (scanPreset === 'custom' && !normalizedCustomPath) {
      onStatusChange({
        tone: 'error',
        message: 'Please enter a folder path before scanning a custom location.',
      });
      return;
    }

    if (scanPreset === 'custom' && normalizedCustomPath === '/') {
      onStatusChange({
        tone: 'error',
        message:
          'Scanning the system root is restricted in the current safe mode. Choose a more specific folder.',
      });
      return;
    }

    if (scanPreset === 'csv' && !normalizedCsvPath) {
      onStatusChange({
        tone: 'error',
        message:
          'Please choose or enter a CSV file path before scanning a CSV dataset.',
      });
      return;
    }

    setIsScanning(true);
    onScanStarted();
    onStatusChange(null);
    setScanOutput(`Scanning ${scanTargetLabel}... Please wait.`);
    setScanProgress(createStartingScanProgress(scanPreset, scanTargetLabel));

    requestScan({
      preset: scanPreset,
      customPath: normalizedCustomPath,
      csvPath: normalizedCsvPath,
    });
  }, [
    csvPath,
    customPath,
    isBulkActionInProgress,
    onScanStarted,
    onStatusChange,
    scanPreset,
    scanTargetLabel,
  ]);

  const triggerRescan = useCallback(() => {
    setIsScanning(true);
    setScanProgress(null);
    setScanOutput(`Refreshing ${scanTargetLabel} after changes...`);
    requestScan({
      preset: scanPreset,
      customPath: customPath.trim(),
      csvPath: csvPath.trim(),
    });
  }, [csvPath, customPath, scanPreset, scanTargetLabel]);

  return {
    scanOutput,
    isScanning,
    scanPreset,
    setScanPreset,
    customPath,
    setCustomPath,
    csvPath,
    setCsvPath,
    scanProgress,
    scanTargetLabel,
    handleBrowseForFolder,
    handleBrowseForCsv,
    handleScan,
    triggerRescan,
  };
}
