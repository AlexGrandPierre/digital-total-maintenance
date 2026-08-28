/**
 * types.ts
 *
 * Frontend contracts for the filesystem action session.
 *
 * Responsibilities:
 * - Describe queue actions and their source queues
 * - Describe session progress and bulk-action state
 * - Describe the existing application status callback contract
 *
 * This module DOES NOT:
 * - Execute filesystem mutations
 * - Own scan or history state
 * - Define backend persistence formats
 */

export type FilesystemActionType = 'review' | 'archive' | 'remove';

export type FilesystemActionMode = 'single' | 'bulk';

export type SourceQueue = 'review' | 'archive' | 'remove' | 'duplicate';

export type SessionFileAction = 'keep' | 'archive' | 'remove';

export type ActionStatus = {
  tone: 'success' | 'error';
  message: string;
};

export type BulkProgress = {
  action: FilesystemActionType;
  current: number;
  total: number;
  currentFileName: string;
};

export type FilesystemActionSessionState = {
  resolvedPaths: string[];
  reviewResolved: number;
  archiveResolved: number;
  removeResolved: number;
  duplicateGroupsResolved: number;
  resolvedDuplicateGroupIds: string[];
  filesArchived: number;
  filesRemoved: number;
  filesKept: number;
  needsRescan: boolean;
};

export type FilesystemActionSessionAction =
  | {
      type: 'FILE_ACTION_SUCCEEDED';
      sourceQueue: SourceQueue;
      fileAction: SessionFileAction;
      filePath: string;
    }
  | {
      type: 'DUPLICATE_GROUP_RESOLVED';
      groupId: string;
    }
  | {
      type: 'RESET_AFTER_RESCAN';
    };

export type AdjustedFilesystemTotals = {
  totalFiles: number;
  review: number;
  archive: number;
  remove: number;
  duplicateGroups: number;
  sessionActions: number;
};
