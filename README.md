# Digital Total Maintenance (DTM)

> Clean Machines. Clear Minds.  
> A local-first investigation and decision engine for digital environments.

**Status:** Active Development (Beta)  
**Platform:** macOS (Apple Silicon)  
**Architecture:** Electron • React • TypeScript • Python  
**License:** All Rights Reserved (currently under active development)

Digital Total Maintenance helps people understand, investigate, and maintain complex digital environments without surrendering judgment to automation.

DTM surfaces evidence, explains recommendations, preserves human decisions, and turns maintenance work into durable knowledge about the systems being reviewed.

The current beta applies this approach to local file management and structured dataset review.

<img width="1276" height="499" alt="DTM workspace overview" src="https://github.com/user-attachments/assets/ddcaaa06-a619-4f84-aff6-130076a53ee5" />


## What is DTM?

Digital environments gradually become difficult to understand and maintain.

Files accumulate.

Downloads become overwhelming.

Duplicate records appear.

Datasets become increasingly difficult to review.

Important decisions and discoveries disappear after the work is complete.

Traditional cleanup software focuses on removing clutter.

DTM focuses on helping people understand what exists, identify what requires attention, make informed decisions, and preserve what was learned.

Every recommendation is designed to be:

- Explainable
- Traceable
- Local
- Human-approved
- Reversible where applicable


## Design Principles

DTM is built around six principles.

### Local First

Core functionality operates locally. Sensitive information does not need to leave the user's computer for DTM to provide value.

### Explainable

Recommendations include the reasoning that produced them.

### Traceable

Findings and decisions remain connected to the evidence and process that produced them.

### Human in the Loop

DTM supports human judgment rather than silently replacing it.

### Reversible

Actions are designed to preserve user control and remain recoverable where reversibility is promised.

### Bounded

Large environments can be processed in safe, reviewable portions, with relevant limitations made visible.


## Workspace Overview | Local File Review

The Local File Review workspace helps users understand and maintain cluttered file environments while retaining control over every action.

Current capabilities include:

- Desktop scan
- Downloads scan
- Documents scan
- Custom folders
- Safe archive
- Safe review
- Undo history
- Duplicate detection
- Context inference

<img width="1048" height="642" alt="DTM local file review workspace" src="https://github.com/user-attachments/assets/33341126-7ef9-4180-903e-14885088d8ca" />

<img width="1065" height="1167" alt="DTM file recommendations and review workflow" src="https://github.com/user-attachments/assets/b341e64f-d6fc-4655-8ed9-e431f2d73385" />

<img width="1206" height="1346" alt="DTM local file review details" src="https://github.com/user-attachments/assets/08576560-6c6f-404e-a6d5-13a02ac6fb7c" />


## Workspace Overview | CSV File Review

The CSV Review workspace extends the same philosophy to structured data: surface anomalies, organize evidence, and allow the user to investigate and adjudicate findings.

Current capabilities include:

- Duplicate groups
- Suspicious values
- Review queue
- Progress tracking
- Session persistence
- Review filters
- Batch review
- Priority ranking

<img width="1262" height="867" alt="DTM CSV review workspace" src="https://github.com/user-attachments/assets/3d1083e1-bfc9-40d4-80fb-4b977cd98776" />

<img width="1109" height="1283" alt="DTM CSV findings and review workflow" src="https://github.com/user-attachments/assets/8a36d6d2-36da-4c1b-a1ed-7d6d345abd6e" />


## Current Limitations

DTM remains an active beta and is not yet a mature production platform.

Current limitations include:

- macOS only
- Unsigned application
- Review workflows and filters continue to evolve
- CSV review persistence is stored locally as JSON
- Dataset actions remain review-first with no destructive edits
- Architecture requires further refactoring for long-term scalability and maintainability


## Roadmap

DTM's development is progressing from a functional prototype toward a reliable investigation and knowledge platform.

### Foundation

- Deterministic test coverage
- Stable identity and persistence
- Modular engine architecture
- Scalable dataset processing
- Cross-platform foundations

### Investigation

- Persistent investigation sessions
- Evidence and provenance tracking
- Decision history
- Improved entity resolution
- Root-cause and remediation workflows

### Knowledge

- Structured investigation records
- Portable, machine-readable exports
- Institutional knowledge preservation
- Interoperability with downstream systems and AI workflows

### Platform

- Windows
- Linux
- Application signing and notarization
- Production packaging and deployment

### Intelligence

- AI-assisted interpretation
- Hypothesis generation
- Finding summarization
- Investigation assistance
- Human-validated recommendations

AI is intended to extend DTM's investigative capabilities, not replace its deterministic core or human authority.


## A Note

Digital Total Maintenance began as an exploration of a simple question:

> How can software help people care for their digital environments without taking control?

What began with local file maintenance has developed into a broader problem:

> How can software help people investigate complex digital systems, preserve the reasoning behind their decisions, and turn that work into knowledge that remains useful afterward?

DTM is being developed around that progression:

**Maintenance → Understanding → Durable Knowledge**

The long-term goal is not simply to identify problems or automate cleanup. It is to create trustworthy, portable understanding that people, organizations, software systems, and AI-assisted workflows can build upon.

DTM is currently in active development, and real-world testing remains an important part of improving the product.

Feedback on usability, decision quality, performance, investigation workflows, and system design is especially valuable as the project continues to evolve.
