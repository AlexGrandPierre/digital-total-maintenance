# Foundation and Refactor Notes

**Status:** Working document for Foundation Sprint 1. This file records current behavioral contracts, known gaps, and a provisional semantic hypothesis. It is not a second product specification; `README.md` and `INVARIANTS.md` remain authoritative for product direction and principles.

## Current behavioral contract

The characterization suite in `tests/` establishes the following behavior of the current implementation. These are observations to protect or deliberately revise, not claims that every behavior is desirable.

### Local file review

- Classification is deterministic from filename, normalized path, age, extension, and hard-coded rules. The result includes a file kind, context, confidence, explanation, risk flags, and recommended queue action.
- Old log-like files in Downloads are high-confidence removal candidates; loose PDFs on Desktop are kept as user content; credential-like files on Desktop receive high-priority review.
- Duplicate groups use normalized filename patterns, extension, and byte size. They do not use content hashes. Group IDs are ordinal within a result (`dup_1`, `dup_2`, ...), and each displayed group is capped at seven items while reporting hidden-item counts.
- Archive actions move files into a DTM-managed directory, avoid overwriting name collisions, and append local JSON history.
- Restore uses the recorded source and destination paths, avoids overwriting a file now occupying the original path, and links the restore history entry to the reverted action.
- Batch archive can partially succeed and reports per-item outcomes.

### CSV review

- A scan reads the source without modifying it, profiles columns and missing values, detects duplicate-like groups and suspicious cells, and writes complete JSONL review indexes alongside a summary.
- Duplicate matching selects identity-like columns heuristically. Findings retain source row numbers; ID-like fields that differ are surfaced as evidence.
- Review-index pagination filters decided finding IDs before applying offset and limit, while retaining both original and remaining totals.
- CSV review sessions persist current decision maps as JSON. Session and dataset index identity are hashes of the resolved CSV path, not the file contents or a source revision.
- Replacing a file at the same path therefore retains the same session identity. Existing findings and decisions are not automatically checked against a new file revision.
- Clean-copy export writes a new CSV rather than mutating the source. It may trim whitespace, remove empty rows or columns, and omit duplicate or suspicious rows by their source row numbers.
- CSV exports currently target `~/Desktop/Digital Total Maintenance/Exports`; the `app_data_path` parameter does not control that location.

Run the current contract suite with `npm test`.

## Known gaps and risks

- **Revision ambiguity:** path identity cannot distinguish two revisions at one path or recognize the same source moved elsewhere. Stale indexes or decisions can therefore be applied to changed data.
- **Finding continuity:** filesystem duplicate IDs are scan-order ordinals; CSV finding IDs are deterministic from selected values but have no declared scope or detector version. Continuity across runs and rule changes is undefined.
- **Provenance:** results generally lack rule-set, engine, schema, configuration, and actor identifiers needed to reproduce or interpret historical conclusions.
- **Decision history:** CSV sessions store current maps rather than an additive decision-event history. The older `dataset_decision.py` persistence path overlaps conceptually with the current session mechanism.
- **Validation:** accepted, ignored, legitimate, and duplicate decisions exist, but the system does not consistently distinguish a human decision from subsequent validation of that decision.
- **Index freshness:** clean-copy exports act on stored row numbers. There is no demonstrated revision check before applying them to the current file.
- **Bounds:** UI result collections are capped and disclose hidden counts in several places, but scans may still retain complete candidate structures in memory. Presentation bounds are not necessarily processing bounds.
- **Durability and concurrency:** JSON history and session writes are non-atomic and unlocked. Action history is capped, so it is useful operational history rather than a permanent audit log.
- **Path authority:** mutation and restore operations trust paths supplied through the application workflow. Their security boundary and validation expectations need explicit treatment before broader deployment.
- **Tooling baseline:** `npm run lint` is currently non-functional because ESLint 9 is installed without an `eslint.config.*` file. Establishing a lint policy is separate from recording current runtime behavior.

## Semantic model 0.1 — hypothesis under test

One possible shared vocabulary is:

`Investigation -> Source -> Revision -> Analysis Run -> Finding -> Evidence -> Decision Event -> Action Event -> Validation`

Supporting references may include an actor, detector/rule and version, engine version, configuration, timestamps, and explicit uncertainty.

This model is a lens for testing whether local-file and CSV workflows can share durable meaning. It is not an approved architecture, storage schema, class hierarchy, or requirement that every workflow instantiate every concept. The next vertical slices should try to disprove or simplify it before any broad migration.

## Product questions requiring explicit decisions

1. **Investigation boundary:** Is an investigation one source, one user objective, one review session, or a container spanning sources and repeated analysis runs?
2. **Identity across revisions:** What makes a source the same source after it moves, changes, is re-exported, or is replaced at the same path? Which changes create a new revision versus a new source?
3. **Finding continuity:** When should a finding remain the same finding after evidence, detector logic, grouping, or source revision changes?
4. **Provenance:** Which actor identities and processing details are required locally now, and which can remain optional until collaboration exists?
5. **Decision and validation semantics:** Is a reviewer decision authoritative by itself, or can it remain unvalidated? Who or what can validate, reverse, or supersede it?

These questions should be answered through concrete workflows, beginning with CSV duplicate review, rather than by designing an abstract platform in isolation.

## Refactor guardrail

Before replacing a boundary, preserve or deliberately change its characterized behavior. A proposed change should identify the contract affected, the product meaning being clarified, migration implications for local state, and the test that demonstrates the intended result. Foundation work should remain small enough to review against a working application.
