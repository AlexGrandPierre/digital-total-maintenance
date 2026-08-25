# DTM Products & Engineering Invarients

These invariants define the properties that must remain true as Digital Total Maintenance evolves. They describe DTM independently of its current implementation, interface, programming languages, storage technologies, or deployment model.
An implementation may change substantially while remaining DTM. An implementation that violates these principles should be treated as an architectural or product regression, even if it adds capability.


## 1. DTM exists to create trustworthy understanding
DTM helps people understand complex digital environments, make informed decisions about them, and preserve what was learned.
Detection, classification, cleaning, matching, and automation are means toward that objective rather than ends themselves.
Invariant: DTM should optimize for the quality, traceability, and durability of understanding, not simply the volume or speed of automated decisions.

## 2. Evidence precedes conclusions
DTM should distinguish between: observed facts, algorithmic findings, hypotheses, human decisions, validated conclusions.
These states must not silently collapse into one another.
Invariant: Every finding must be traceable to the evidence and process that produced it.

## 3. Explanations belong to decisions
DTM should never produce an important recommendation without preserving why it was produced.
Where deterministic rules produce a classification or recommendation, the explanation should originate from the same decision path rather than being reconstructed afterward.
Invariant: A recommendation without its rationale is incomplete output.

## 4. Human judgment remains authoritative
DTM surfaces evidence, prioritizes work, proposes interpretations, and assists investigation.
It does not obscure consequential decisions behind automation.
The user must retain meaningful control over ambiguous adjudication and consequential/destructive actions.
Invariant: Automation may assist judgment; it must not silently replace it.

## 5. Deterministic behavior must remain reproducible
Given the same: input, configuration, rules, and engine version,
DTM's deterministic components should produce equivalent findings.
When rules or algorithms change, their version must be identifiable so historical results remain interpretable.
Invariant: Deterministic findings must be reproducible and attributable to the logic that generated them.

## 6. Identity must be stable and unambiguous
Datasets, investigations, findings, entities, groups, decisions, and actions require canonical identities.
Identity must not depend on whichever part of the application happened to create the object.
Invariant: The same logical object must resolve consistently within its defined scope, and unrelated objects must not accidentally share identity.

## 7. Provenance must survive the workflow
For important findings and decisions, provenance should eventually include as appropriate:
source, dataset/environment identity, timestamp, detector/rule, detector version, relevant evidence, reviewer or actor, subsequent changes.
Invariant: Important conclusions must remain traceable to their origin after the original session has ended.

## 8. History is additive, not silently rewritten
A hypothesis may be rejected. A decision may be reversed. A root cause may later prove incomplete.
DTM should preserve that evolution rather than replacing yesterday's understanding with today's state as though the earlier state never existed.
Invariant: Material changes to investigation state must preserve meaningful history.

## 9. Uncertainty must remain visible
DTM must not communicate greater certainty than the underlying evidence supports.
Ambiguity, incomplete analysis, conflicting evidence, bounded samples, failed processing, and unresolved findings should remain explicit.
Invariant: Unknown, ambiguous, incomplete, and unprocessed are legitimate states and must not be silently converted into conclusions.

## 10. Bounded analysis must disclose its bounds
DTM may deliberately cap, sample, paginate, approximate, or otherwise bound processing to remain performant.
Hiding those limitations is unacceptable: “No anomalies exist” vs “No anomalies were found among the portion examined”
Invariant: When DTM analyzes less than the complete available information, the output must communicate the relevant limitation.

## 11. Mutation must be deliberate and recoverable where promised
Analysis should not itself mutate source information.
Actions affecting files or data should be explicit, attributable, and independently auditable.
Invariant: Observation and investigation must remain separable from mutation.

## 12. The deterministic core must not depend on AI
LLMs may eventually:summarize findings, explain patterns, propose hypotheses, assist prioritization, interpret unfamiliar structures, draft reports, help investigators navigate accumulated knowledge.
They should not become necessary for DTM to perform its fundamental deterministic functions.
Invariant: Removing the AI integration must leave DTM's core investigation and adjudication capabilities functional.

## 13. AI output must retain its epistemic status
An AI-generated hypothesis is not a finding merely because it sounds convincing.
AI-generated material should remain identifiable as such until independently validated where validation is required.
Invariant: AI assistance must never silently transform generated interpretation into established institutional truth.

## 14. Institutional knowledge is a first-class product output
DTM's work should not terminate at a UI state or temporary review session.
The system should be capable of preserving structured representations of:
finding → evidence → interpretation → decision → validation → root cause → remediation
Invariant: Valuable understanding created through DTM must be capable of surviving beyond the interface and session that created it.

## 15. Institutional knowledge must be portable
Knowledge should ultimately be exportable in structured, documented, machine-readable forms that can be independently consumed by:
humans, audits, databases, migration processes, reporting systems, automation, AI agents, future software not yet designed.
Invariant: DTM-generated institutional knowledge must remain usable without requiring DTM itself to interpret it.

## 16. Exports must preserve meaning, not merely data
An export must retain enough context to correctly interpret what those rows mean.
That could eventually include schema/version information, evidence relationships, confidence/status, provenance, and investigation context.
Invariant: Exporting institutional knowledge must not strip away the semantics required to understand it correctly.

## 17. Privacy and locality are architectural capabilities
Local-first should remain possible even if DTM eventually supports connected or cloud services.
Sensitive information should not require transmission to external infrastructure merely to access the core product.
Invariant: Connectivity may expand DTM's capabilities; it must not become an unnecessary prerequisite for core functionality.

## 18. Scale must not degrade correctness
A 10-million-row dataset may require different implementation techniques from a 10,000-row dataset.
It should not require weaker truthfulness.
Invariant: Performance optimizations may change how DTM reaches a result, but must not silently change what the result claims to represent.

## 19. Architecture must preserve replaceability
DTM > sum of its parts
Implementations of responsibilities within the system should not become the system.
Invariant: Major infrastructure components should be replaceable without destroying the semantic model of DTM's investigations.

## 20. Complexity must be earned
DTM should not acquire enterprise infrastructure merely because enterprise deployment is conceivable.
New abstractions, services, dependencies, distributed systems, permissions, governance features, and infrastructure should address demonstrated requirements.
Invariant: Prefer the simplest architecture that satisfies current requirements while preserving credible paths toward known future requirements.