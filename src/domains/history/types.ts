/**
 * types.ts
 *
 * Frontend contracts for the action-history domain.
 *
 * Responsibilities:
 * - Describe persisted history entries
 * - Define history filters and status messages
 *
 * This module DOES NOT:
 * - Execute history actions
 * - Manage React state
 * - Define Electron transport behavior
 */

export type ActionHistoryEntry = {
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

export type HistoryFilter = 'undoable' | 'all' | 'restored';

export type HistoryStatus = {
  tone: 'success' | 'error';
  message: string;
};
