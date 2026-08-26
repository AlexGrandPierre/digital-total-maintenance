/**
 * history-selectors.test.mjs
 *
 * Focused regression tests for consequential frontend history behavior moved
 * out of App.tsx during the history-domain extraction.
 *
 * Covers:
 * - Undo eligibility and restored-action invalidation
 * - History filtering
 * - Immutable selection and bulk-selection semantics
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canUndoHistoryEntry,
  filterActionHistory,
  getSelectedUndoableEntries,
  toggleHistorySelection,
} from '../../src/domains/history/selectors.ts';

function historyEntry(overrides = {}) {
  return {
    id: 'move-1',
    timestamp: '2026-08-26T12:00:00.000Z',
    action: 'move_to_archive',
    source_path: '/source/report.csv',
    destination_path: '/archive/report.csv',
    status: 'success',
    mode: 'single',
    reverts_history_id: null,
    ...overrides,
  };
}

test('a successful move with source and destination is undoable', () => {
  const move = historyEntry();

  assert.equal(canUndoHistoryEntry(move, [move]), true);
});

test('a successful restore makes its original move no longer undoable', () => {
  const move = historyEntry();
  const restore = historyEntry({
    id: 'restore-1',
    action: 'restore_from_archive',
    source_path: move.destination_path,
    destination_path: move.source_path,
    reverts_history_id: move.id,
  });

  assert.equal(canUndoHistoryEntry(move, [restore, move]), false);
  assert.equal(
    canUndoHistoryEntry(move, [{ ...restore, status: 'error' }, move]),
    true,
  );
});

test('failed, unsupported, or incomplete entries are not undoable', () => {
  assert.equal(
    canUndoHistoryEntry(historyEntry({ status: 'error' }), []),
    false,
  );
  assert.equal(
    canUndoHistoryEntry(historyEntry({ action: 'restore_from_archive' }), []),
    false,
  );
  assert.equal(
    canUndoHistoryEntry(historyEntry({ destination_path: null }), []),
    false,
  );
});

test('history filters preserve current undoable, restored, and all semantics', () => {
  const restoredMove = historyEntry({ id: 'move-restored' });
  const restore = historyEntry({
    id: 'restore-1',
    action: 'restore_from_archive',
    reverts_history_id: restoredMove.id,
  });
  const undoableMove = historyEntry({ id: 'move-undoable' });
  const failedMove = historyEntry({ id: 'move-failed', status: 'error' });
  const history = [restore, undoableMove, failedMove, restoredMove];

  assert.deepEqual(filterActionHistory(history, 'undoable'), [undoableMove]);
  assert.deepEqual(filterActionHistory(history, 'restored'), [restore]);
  assert.equal(filterActionHistory(history, 'all'), history);
});

test('selection toggling is immutable and reversible', () => {
  const original = new Set(['move-1']);
  const added = toggleHistorySelection(original, 'move-2');
  const removed = toggleHistorySelection(added, 'move-1');

  assert.deepEqual([...original], ['move-1']);
  assert.deepEqual([...added], ['move-1', 'move-2']);
  assert.deepEqual([...removed], ['move-2']);
});

test('bulk selection includes only visible entries that remain undoable', () => {
  const restoredMove = historyEntry({ id: 'move-restored' });
  const restore = historyEntry({
    id: 'restore-1',
    action: 'restore_from_archive',
    reverts_history_id: restoredMove.id,
  });
  const undoableMove = historyEntry({ id: 'move-undoable' });
  const history = [restore, undoableMove, restoredMove];
  const selectedIds = new Set([restoredMove.id, undoableMove.id]);

  assert.deepEqual(
    getSelectedUndoableEntries(history, selectedIds, history),
    [undoableMove],
  );
  assert.deepEqual(
    getSelectedUndoableEntries([restoredMove], selectedIds, history),
    [],
  );
});
