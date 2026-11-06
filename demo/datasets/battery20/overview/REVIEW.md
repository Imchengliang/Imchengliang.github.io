# Battery overview source review

Reviewed on 6 November 2026. The local overview uses 20 frozen papers, 32 reviewed sample profiles, 196 elemental mass-composition records from 12 studies, and 386 percentage result records across 38 treatment methods. No extraction API is called.

## Sample classification

`review.json` keeps source-specific sample identities and literal evidence. Its controlled `material_class` distinguishes whole cells, positive/negative electrode materials, cathode/anode active materials, mixed electrode material, battery-core fragments, ferrous fractions and foil-rich fractions. Chemistry, feedstock history, ordered preparation operations, size fractions and reported thermal treatment remain separate fields. Names, manufacturers and collection places are not grouping keys. Mixed or unresolved battery chemistry is not treated as a homogeneous chemistry.

The builder validates classification quotations against the frozen source text and table-selected composition values against the original cell and element axis. Unreported information is retained as unknown. No constituent fraction, whole-cell concentration or missing experimental result is inferred.

## Measurement basis

Each selected composition assay has a controlled assay-method code, mass denominator and moisture basis. XRF and digestion assays remain separate observations. The original value, unit, uncertainty and source record remain available. Supported mass-ratio units are converted to wt% without renormalizing totals.

Chemical Characterisation explicitly states that all data refer to dry weight after drying to constant mass at 105 °C. Its seven fractions retain this evidence. The selected Ni-MH electrode table reports wt.% without a sufficiently resolved denominator for cross-study pooling. Other unresolved moisture bases are not filled from the mere presence of a drying operation. The lactic-acid paper's composition assay does not explicitly establish its thermal stage; that uncertainty remains separate from the calcined leaching feed description.

## Records and Compare & summarize

Records lists the individual selected observations. Compare & summarize organizes side-by-side entries by battery chemistry and target; treatment results also keep separate metrics and method families. Material form is available in More filters. Names remain entry labels, not comparison or pooling keys.

For example, the Ni-MH/Ni comparison shows the positive electrode (88.2%), negative electrode (47.9%), <1 mm fraction (64%) and 1–3 mm fraction (61%) separately, with two publication sources. Their numerical span is descriptive, not a whole-battery composition estimate.

Single observations display their reported value. Multiple observations from a sample/method display an unqualified observed range and the original records/conditions; they do not become independent replicates. Qualified values remain inspectable but are excluded from numerical spans and pooled calculations. Mean, median and SD are not printed for single values or heterogeneous comparison groups.

## Cross-study synthesis

The shared Python code in `battery_statistics.py` checks reviewed chemistry, material class, feedstock history and preparation context. Composition additionally requires a resolved mass denominator, moisture basis and assay method. Treatment results require explicitly reviewed route and condition equivalence; method-family membership or similar condition wording is insufficient.

Only a matching context with at least two publications can produce a descriptive synthesis. The default calculation first averages repeated observations within each paper/sample context, then sample-context means within each publication, and finally gives each publication equal weight. SD describes spread of these publication-level means, not uncertainty in a representative population estimate. Publication counts do not prove experimental independence.

The present dataset has no eligible cross-publication synthesis under these checks. It therefore shows useful sample comparisons and the reasons for keeping measurements separate instead of manufacturing pooled averages. Synthetic regression cases verify that eligible future data produce the expected means, medians and SDs.

## GraphDB and traceability

The local service executes fixed, validated SPARQL queries against `ontoweee-battery20`. The source and analysis named graphs are pinned by `analysis-manifest.json`. Profiles contain queryable material-class fields and their original JSON transport records. The source graph and extraction archives remain unchanged by this review.

The analysis layer retains Observation links where present and original relation IDs/final indices for archive-only records. Source actions continue to open the exact text/table evidence. Static browser records are rebuilt from the same RDF projection, and both execution paths use the same Python comparison/statistics code. The local-only update has not been published online.

## Verification

```sh
ONTOWEEE_GRAPHDB_TEST=1 python3 -m pytest demo/ontoweee/test_build_dataset.py demo/ontoweee/test_battery_overview.py demo/ontoweee/test_battery_analysis.py -q
node --test demo/ontoweee/*.test.cjs
```

The comparison-review archive is `../updates/comparison-review-20261106/`. Its before-files preserve the preceding analysis projection; raw paper and table extraction outputs are not changed.
