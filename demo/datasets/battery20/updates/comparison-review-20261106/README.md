# Source-reviewed comparisons — local update, 6 November 2026

This update changes the overview's analysis annotations and presentation. It does not change the 20-paper cohort, extraction outputs, source graph, extraction trace or online demo.

- All 32 profiles receive reviewed material classes and separate preparation/size/thermal/history fields.
- Composition selectors retain assay method, mass denominator and moisture basis; unknowns remain unknown. Chemical Characterisation's dry-weight basis is source-verified.
- Compare & summarize groups by chemistry and target, with side-by-side source-specific entries. It reports observed values/ranges instead of single-value means or averages across different electrode fractions.
- Synthesis requires matching reviewed contexts from at least two publications. The current corpus has no eligible pooled group; tested future eligible inputs receive equal-publication-weight descriptive statistics.
- The GraphDB analysis projection and static transport records are rebuilt; the frozen source graph remains unchanged.

The source classification and measurement-basis data are in `../../overview/review.json`. `before-*` files retain the previous analysis projection. Python/GraphDB/browser parity, identity/qualifier preservation, material-class separation, repeated-observation handling and synthesis eligibility are covered by regression checks.
