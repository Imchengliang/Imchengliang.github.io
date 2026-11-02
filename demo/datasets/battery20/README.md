# Battery-focused demo dataset: battery20

## Current published selection — 2 November 2026

The active local and online demo contains **20 papers and 12 catalog records**, retaining only catalogs with existing direct paper-entity connections: nine model alignments and three weaker variant links. The other five catalogs and their 28 exclusive nodes / 23 internal edges are absent from this published selection. No paper data, Scope record, observation or extraction archive was changed; no extraction or alignment API was called.

Active selection and catalog receipts are in `updates/connected-catalogs-20261102/`; the original 20+17 selection and earlier fusion files remain historical archives. The current projection has **469 nodes, 442 core entities, 1,564 displayed relations and 1,073 quantitative observations**. All six guides / 51 stops and paper evidence anchors remain applicable. Sections describing earlier builds below retain their historical counts.

Status of the original build: **built and validated as of 30 October 2026**. The original selection receipt remains unchanged; see `build_report.json` for completion and integrity checks.

This selection contains 20 papers (11 retained from the current 40-paper demo and 9 battery-focused additions) and the existing 17 GSMArena catalog records. It does not modify the current 40-paper snapshot, extraction outputs, gold annotations or pipeline prompts.

## What is fixed

`manifest.json` records exact input paths, file sizes and SHA-256 fingerprints for final extraction outputs, source text/tables, available extraction stage files and the catalog. All paths are relative to the repository root; stage filenames resolve beside their paper's final input file.

The selection manifest itself is reference-based. The completed build now contains byte-for-byte copies in `inputs/<paper>/` and `catalog.json`, verified against all 241 selected file fingerprints. The retained 11 papers use the exact final-output versions already recorded by the old demo, rather than silently substituting their all_batches counterparts. Source version uncertainty from historical extraction remains; copying a source does not retrospectively prove it was the exact historical input.

## Selection basis

The all_batches extraction root contained 800 paper directories, with 797 parseable final outputs. The other three were not eligible. Final payloads were screened for connected process/output paths, endpoint validity, self-relations, noisy Process types and numerical outputs. Battery candidates were then inspected against source abstracts/methods, source numerical claims, final facts and available table evidence.

These are qualitative presentation choices, **not the top nine by measured precision/F1**. New papers have not received a new gold evaluation or exhaustive triple-by-triple validation. Uncertainty and known errors are retained in the manifest; no facts were edited to make a case look better.

## Retained papers (11)

1. A Combined Recovery Process of Metals in Spent Lithium-Ion Batteries
2. A Comprehensive Characterization of End-of-Life Mobile Phones for Secondary Material Resources Identification
3. A Copper-Catalyzed Bioleaching Process for Enhancement of Cobalt Dissolution from Spent Lithium-Ion Batteries
4. A Promising Physical Method for Recovery of Licoo 2 and Graphite from Spent Lithium-Ion Batteries Grinding Flotation
5. Assessment of Smartphones’ Components and Materials for a Recycling Perspective- Tendencies of Composition and Target Elements
6. Bioleaching of Valuable Metals from Spent Lithium-Ion Mobile Phone Batteries Using Aspergillus Niger
7. Chemical Characterisation of Spent Rechargeable Batteries
8. Comprehensive Evaluation on Effective Leaching of Critical Metals from Spent Lithium-Ion Batteries
9. Heat Treatment of Licoo2 Recovered from Cathode Scraps with Solvent Method
10. Pyrolysis-Ultrasonic-Assisted Flotation Technology for Recovering Graphite and Licoosub2sub from Spent Lithium-Ion Batteries
11. Synthesis and Performance of Li[(ni13co13mn13)1−mg ]o2 Prepared from Spent Lithium Ion Batteries

The two phone-characterization papers provide the product-to-battery bridge. Comprehensive phones measures battery mass only; Smartphone Assessment also provides battery composition. Cathode scraps and regenerated materials are not automatically equivalent to whole post-consumer batteries.

## Added papers (9)

| Paper | Final triples | Process entities | HAS_OUTPUT | Demonstration role |
| --- | ---: | ---: | ---: | --- |
| Process Controls for Improving Bioleaching Performance of Both Li and Co from Spent Lithium Ion Batteries at High Pulp Density and its Thermodynamics and Kineti | 27 | 1 | 14 | Higher-pulp-density bacterial bioleaching; Li 89% and Co 72%. |
| Ultrasound-Assisted Leaching of Cobalt and Lithium from Spent Lithium-Ion Batteries | 50 | 2 | 37 | Ultrasound vs conventional leaching; Co 94.63%, Li 98.62%, with explicit operating conditions. |
| Recovery of Lithium, Nickel, Cobalt, and Manganese from Spent Lithium-Ion Batteries Using Scplscp-Tartaric Acid as a Leachant | 36 | 1 | 20 | L-tartaric-acid leaching; multi-metal response to H2O2 and temperature. |
| Selective Leaching of Valuable Metal from Spent Lithium-Ion Batteries in the Alkaline Glycinate System | 43 | 1 | 17 | Alkaline glycine selectivity; Li 96.31%, Co 83.18%, Ni 91.56%, Mn 31.16%; feed composition table available. |
| Leaching Lithium from the Anode Electrode Materials of Spent Lithium-Ion Batteries by Hydrochloric Acid (Hcl) | 27 | 1 | 8 | Anode-specific lithium recovery; 99.4 wt% in the source and a five-element composition table. |
| Green and Facile Method for the Recovery of Spent Lithium Nickel Manganese Cobalt Oxide (NMC) Based Lithium Ion Batteries | 20 | 1 | 6 | Citrus-juice treatment of NMC battery electrodes; Li 100%, Mn 99%, Ni 98%, Co 94%. |
| Reductive Leaching of Cathodic Active Materials from Lithium Ion Battery Wastes | 45 | 1 | 16 | Nitric-acid/H2O2 leaching of waste cathode material; Co/Li outputs track temperature and reducing-agent conditions. |
| Recovery of Cobalt as Cobalt Oxalate from Spent Lithium Ion Batteries by Using Glycine as Leaching Agent | 27 | 1 | 8 | Glycine/ascorbic-acid leaching; Co increases from 70% to 95% as glycine increases from 0.1 to 0.5 M. |
| Pneumatic Separation and Recycling of Anode and Cathode Materials from Spent Lithium Iron Phosphate Batteries | 31 | 1 | 2 | LFP battery Cu/Al separation; product mass fractions Cu 97%, Al 96% at 1.6–1.9 m/s. |

The additions contain **306 final triples**. This is a raw count, not the count of unique facts after cross-source fusion.

### Limitations to retain

- **Process Controls for Improving Bioleaching Performance of Both Li and Co from Spent Lithium Ion Batteries at High Pulp Density and its Thermodynamics and Kineti:** Several summary results repeat at different condition detail levels; range-endpoint observations are incomplete.
- **Ultrasound-Assisted Leaching of Cobalt and Lithium from Spent Lithium-Ion Batteries:** HAS_OUTPUT also stores activation energies. They must not be described as recovery rates; repeated summary observations remain.
- **Recovery of Lithium, Nickel, Cobalt, and Manganese from Spent Lithium-Ion Batteries Using Scplscp-Tartaric Acid as a Leachant:** The directory title contains a markup artifact (Scplscp); retain source title for display. Parameter ranges in general Settings are not exact observation conditions.
- **Selective Leaching of Valuable Metal from Spent Lithium-Ion Batteries in the Alkaline Glycinate System:** Battery powder is represented at battery granularity. Activation energies and solution concentrations coexist with recoveries; some low-detail CONTAINS facts are redundant.
- **Leaching Lithium from the Anode Electrode Materials of Spent Lithium-Ion Batteries by Hydrochloric Acid (Hcl):** Anode powder and battery are different input granularities. The archive contains both % and wt% summary versions; do not pool them or merge subjects.
- **Green and Facile Method for the Recovery of Spent Lithium Nickel Manganese Cobalt Oxide (NMC) Based Lithium Ion Batteries:** PVDF removal observations share the composite-process subject. Binder removal must not be presented as metal recovery; source preparation context is needed.
- **Reductive Leaching of Cathodic Active Materials from Lithium Ion Battery Wastes:** Some qualifiers (more than/about) are flattened, and similar Li values are inferred from the source phrase similar to Co. Those are weaker observations than explicit paired values.
- **Recovery of Cobalt as Cobalt Oxalate from Spent Lithium Ion Batteries by Using Glycine as Leaching Agent:** The cobalt-oxalate precipitation stage is not independently represented; the generic process also carries a recovery=100 observation. Composition aliases and repeated summaries remain.
- **Pneumatic Separation and Recycling of Anode and Cathode Materials from Spent Lithium Iron Phosphate Batteries:** Only two numerical outputs are present. These are product mass fractions, not recovery percentages. Several background composition facts and OCR material names are noisy.

The pneumatic-separation paper reports Cu/Al **product mass fractions**, not recovery yields. Ultrasound/glycinate papers contain activation-energy measurements, which must not be pooled with recovery percentages. Keep electrode/powder/whole-battery input differences and observation-specific conditions visible.

## Examples not selected

- **Ascorbic-Acid-Assisted Recovery of Cobalt and Lithium from Spent Li-Ion Batteries:** Conflicting Co/Li numerical assignments (94.8/98.5) coexist in final output.
- **Study on the Reduction Roasting of Spent Linixcoymnzo2 Lithium-Ion Battery Cathode Materials:** Fusion/alloying temperatures are bound as outputs of downstream leaching processes.
- **A Closed-Loop Process for Recycling Lini13co13mn13o2 from the Cathode Scraps of Lithium-Ion Batteries Process Optimization and Kinetics Analysis:** A self-CONTAINS relation and broad process/result grouping make the frozen graph unsuitable as a cleaner demonstration.
- **Recovery of Valuable Materials from Spent Lithium Ion Batteries Using Electrostatic Separation:** Decimal-comma values such as 97,25 appear as 9725 in final output.
- **Use of Adapted Metal Tolerant Aspergillus Niger to Enhance Bioleaching Efficiency of Valuable Metals from Spent Lithium-Ion Mobile Phone Batteries:** Core treatment results are useful, but final Process entities include water and battery powder; not selected as one of the cleaner additions.
- **Dissolution of Cathode Active Material of Spent Li-Ion Batteries Using Tartaric Acid and Ascorbic Acid Mixture to Recover Co:** Relative increases of 5% and 15% are stored as absolute leaching values.

## Active files and data loading

1. The local server serves `demo/ontoweee/`.
2. `index.html` selects `datasets/battery20/full-traces/data/graph.json` via its `data-graph` attribute. `app.js` fetches that snapshot; it does not scan all_batches or query an API/database.
3. That JSON contains graph nodes, edges, observations, sources and replay URLs.
4. Replay URLs point into `datasets/battery20/full-traces/data/cases/`. All 20 papers have the eight archived stages: Table Gate, IR / Execution, Process, Entity, Relation, Revision / Postprocessing, Scope and Final relations, together with source text and tables. Empty stages remain empty; missing decisions are not reconstructed.
5. Downloads point into the same snapshot's `raw/`. Six authored guide JSON files are stored beside this README.
6. The active snapshot manifest is `full-traces/data/manifest.json`; the independent entry is `full-traces/index.html`. The preceding battery snapshot in `snapshot/` is preserved. The old root `data/manifest.json` still describes the preserved 40-paper snapshot, accessible through `index-40.html`.

The current fusion output is **`updates/connected-catalogs-20261102/fusion/fused_graph.ttl`**, retaining all preceding scientific corrections and orphan cleanup, and publishing registered battery names and Component types consistently. `fusion-published/` preserves the preceding brand-gated result. The first diagnostic build in `fusion/` and `data/` used the legacy filtered-triple preference and is **not active**. The page still reads `full-traces/data/graph.json`; its manifest identifies the current fusion file and correction receipt.

### Full trace coverage

The article selector covers every selected paper. All 180 original intermediate files (nine per paper) are preserved in the frozen inputs and match the selection fingerprints. The current replay uses derived corrections where its manifest records them. The six authored walkthroughs remain optional; the other fourteen papers offer free browsing, with Start walkthrough disabled. Graph evidence links now open the corresponding full archive for any of the twenty papers. Combined Recovery has no source tables or archived table records, so its Gate and IR stages correctly show zero records.

The full-trace expansion originally repackaged frozen outputs without changing the graph. On 1 November 2026, fusion was rerun with a same-brand prerequisite before model candidate scoring. The active graph now excludes three cross-brand variant links; all other displayed edges, nodes, observations and replay archives are preserved. No extraction API was called. The earlier browser verification covered all twenty papers and all eight stage controls per paper (160 stage selections).

## Completed build

- 20 paper inputs and 17 catalog records, copied and fingerprint-verified.
- FLORA with the existing cached `Lihuchen/pearl_small` encoder, both Hugging Face offline flags enabled; convergence after 2 iterations. Extraction API calls: **0**.
- An explicit `--triple-field triples` makes fusion and replay read the same published list. The legacy default is unchanged for other runs. No source extraction payload was rewritten.
- 497 graph nodes including helper families; **470 core entities**, **1,587 displayed relations**, **1,073 quantitative observations** in that 20+17 full-traces version.
- 6 guides / **51 stops**: phones (8), smartphone battery composition (8), battery bioleaching (10), ultrasound (8), anode leaching (8), flotation limits (9). Every stop was exercised through the browser.
- 1,988 graph records with source relation IDs resolve to one or more exact archived final records. Any ambiguity remains a user choice, not a first-match inference.
- 20 Node test files and 3 Python tests pass; original 40-paper data and old fusion output directory fingerprints remain unchanged.

The current policy requires explicit equal brands before model candidate scoring. Publication consumes those scored candidates without repeating brand comparison or passing brand maps again. It emits three remaining same-brand variant links, which are still weaker than confirmed model identity. The three cross-brand links (Brondi–Huawei, Wiko–HTC and Wiko–Micromax) are gone. The update receipt and original fusion/active graph copies are in `updates/brand-gate-20261101/`. Earlier snapshots and the 40-paper dataset retain their original data.

At the brand-gate simplification step, all 677 raw candidate scores, typed/final alignments, Scope links and 25,244 RDF triples matched the preceding brand-gated run exactly. That step left the graph unchanged; see `updates/brand-gate-20261101/simplification_verification.json`. The later material correction below publishes a new derived graph.

## Material identity corrections (1 November 2026)

`updates/material-identity-20261101/corrections.json` records a separate evidence-reviewed version: four PU/plutonium endpoint corrections, five carbonyl/cobalt endpoint corrections, and retraction of one preparation-medium composition claim and two crystal-structure-type composition claims. These are explicit frozen-record corrections, not online material-name blacklists. Original sources, extraction files, gold and historical LLM archives remain unchanged; all 241 original fingerprints still match. No extraction API was called.

The three affected table programs were executed offline using their archived Semantic IR/direct records and source cells. The original stage archives remain visible as history. A correction receipt appears in Revision / Postprocessing, followed by corrected Final relations. The 179 remaining Co records are identical to the preceding graph; only five reviewed XPS records moved to C=O. The six guides, 51 stops and 2,026 graph-to-final archive anchors pass the snapshot check. Details are in `updates/material-identity-20261101/verification.json`.

To reproduce the corrected fusion only:

```sh
HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 python3 weee_kg_system/fusion/FLORA/run_flora_fusion.py --mineru-root demo/ontoweee/datasets/battery20/updates/material-identity-20261101/inputs --catalog demo/ontoweee/datasets/battery20/catalog.json --outdir demo/ontoweee/datasets/battery20/updates/material-identity-20261101/fusion --triple-field triples --max-iterations 100
```

## Experimental-condition corrections (1 November 2026)

For **Comprehensive Evaluation on Effective Leaching of Critical Metals from Spent Lithium-Ion Batteries**, the archived IR used “Recovery rate” as a condition while omitting experimental context. Three evidence-reviewed IR programs were replayed offline: Table 1 (30 observations), Table 3 (27) and Table 5 (33). Conditions now retain the shared temperature and row pH; Tables 3 and 5 additionally retain acid concentration, solid/liquid ratio, and the distinct absence of added reductant versus H2O2 at 4 vol%. Table 1 retains its Table S2 reference without inventing unavailable parameters.

The derived table archives, final records and active graph agree. Original LLM response strings remain historical; IR / Execution shows the corrected offline execution, and Revision / Postprocessing includes its receipt. All values, units, Process endpoints and graph counts are unchanged. This replay validates execution and publication; it does not measure the revised prompt's performance on a new API call.

The pipeline now passes table notes and current/parent section context to the IR extractor. Its prompt distinguishes measured quantities from experimental conditions, and execution retains source quotes supplied with bindings. There are no paper-name, table-number or reagent-specific online rules. Existing frozen caches remain frozen until an explicit refresh.

Receipts: `updates/table-conditions-20261101/corrections.json`, `ir-replay.json` and `verification.json`. All 241 original fingerprints still match; 48 related Python checks and 2,026 graph-to-archive checks pass. Extraction API calls: **0**.

## Measurement semantics corrections (1 November 2026)

`updates/measurement-semantics-20261101/` retains a separate version of seven papers with 30 reviewed records. Fourteen activation-energy results, nine leachate molar fractions, three TG mass-loss measurements and two film-weighing removal proxies are retained as measurement evidence rather than core material-output/composition claims. Two XPS measurements now describe the LiCoO2 sample surface via CONTAINS, with the surface/peak basis and treatment state preserved. The film percentages retain their original film-mass denominator rather than being presented as PVDF yield.

All 30 original values and units survive in their corrected relations or measurement evidence. Unreviewed core triples and scientific graph records are identical to the preceding version. The nine bare acid-name Process entities lost their erroneous output edges and were removed from the derived core entity list; original entities and claims remain in correction receipts. The molar-fraction table was replayed offline as nine HAS_OBSERVATION measurements of leachate, without creating reagent Process entities. Its original Gate/LLM strings remain historical.

Revision / Postprocessing exposes the measurement records and downloads; Final relations and fusion contain only the corrected core claims. The ultrasound guide now visits its activation-energy record in Revision before Scope. Text, table IR and direct repair prompts distinguish actual material outputs from measurements using the measured entity, quantity and denominator. Runtime filtering continues to use explicit semantic roles and the existing evidence-only/observation channel, without a unit or metric-name blacklist. Unquantified actual outputs remain allowed by structural filtering.

That measurement-correction version had 543 total nodes (516 core entities), 1,586 display edges and 1,077 quantitative material observations. The graph's observation count excludes archived measurement-only evidence. Model identity/variant and Scope link counts remain 9/3/81; the preceding 90 condition corrections are retained. All 241 original frozen fingerprints match. Validation: 62 Python checks, six guides / 51 stops and 1,998 graph-to-archive records. No extraction API was called; the revised prompts have not been evaluated through fresh API completions.

Receipts and original snapshot copies are in `updates/measurement-semantics-20261101/corrections.json`, `table-replay.json`, `verification.json` and `before/`. Earlier correction sections describe their own preserved versions.

## Experimental-group and operation binding corrections (1 November 2026)

`updates/experiment-binding-20261101/` reviews eight records across five papers. Four analytical-digestion, ANC or microbial-acclimation claims are retained in operation evidence rather than attached as recovery execution. Copper-Catalyzed Co=32.7% is bound to the reported 10 g/L Cu treatment; its incorrect alias under the 1.0 g/L Process is removed. Anode HCl Li=84% is bound to the pure-water control, and Li=97.1% to HCl without H2O2. Three source-supported input links accompany these treatment/control records. The 84% baseline attached to the HCl 98% result is retained separately as comparison evidence, with its water-treatment identity.

Original LLM and intermediate stages remain historical. Revision / Postprocessing includes source-reviewed operation records and correction downloads; Final relations and fusion use the corrected claims. No new extraction API call was made. The anode walkthrough now points to the corrected no-peroxide observation.

The pipeline preserves decimal points inside candidate aliases and ignores Process aliases with explicitly contradictory parsed conditions. Mechanism two can request a missing Process when a uniquely supported setting has no owner. Explicit conflicts are evidence-only pending resolution, and a successful correction restores the prior graph status. A sole setting is no longer inherited without observation/process evidence. Missing information alone does not retract an existing relation. Process/Relation prompts distinguish the operation governed by each condition. The existing ratio-unit parser now produces the same number/unit shape whether or not prose explicitly says concentration. No reagent names, paper titles or outcome values were added to online decisions.

Validation: 135 related Python tests; offline replay verifies the three corrected output bindings and escalation of the original 32.7% conflict; all six guides / 51 stops and 1,997 graph-to-archive records pass. That binding-correction version had 546 total nodes, 519 core entities, 1,590 display edges and 1,077 quantitative observations. All unreviewed scientific graph records and final triples are unchanged; prior condition/material/measurement repairs are retained. Model identity/variant and Scope links remain 9/3/81. Original frozen data and earlier versions remain intact. Revised prompts have not been tested with fresh API completions.

See `corrections.json`, `binding-replay.json`, `verification.json` and `before/` within this update directory.

## Initial and treated sample-state corrections (1 November 2026)

`updates/sample-state-20261101/` reviews 36 records in two papers. Copper-Catalyzed's text claim that the battery contains Co=0.09% is superseded by the matching residual-sediment table observation, retaining the text quotation as supporting evidence. All 30 sediment-table observations now identify the post-bioleaching residual solid and the full copper concentration in g/L. Original values and % units are preserved; the source does not specify mass versus atomic percentage, so the percentage basis remains explicitly unspecified.

Five fluorinated compounds from analytical pyrolysis are retained as transformation evidence in Revision / Postprocessing, not as initial electrode constituents or as presumed retained-solid composition. Their observations come from TG-GC/MS characterization; the frozen archive does not justify assigning them as products of a separately extracted recovery Process. Original relations and source quotes remain in the correction receipts. No extraction API was called.

Entity and relation prompts distinguish physical form from separated streams and chemical transformations. Automatic qualifier stripping no longer removes treatment-state labels. Summary refinement and input-edge deduplication require matching sample/state and measurement basis; composition summaries additionally require matching experiment conditions and setting. Missing state is not assumed to be initial state. Existing source_sample, sample_state and measurement_basis fields are now carried into replay and graph metadata, without introducing a Sample entity type or a paper-specific filter.

The corrected residue IR was executed offline: all 30 values and cell coordinates match the original execution. Validation includes 117 focused Python tests, six guides / 51 stops, and 1,991 graph-to-archive records. Five legacy tests still fail with both old and revised dedup logic; their names are recorded in verification.json. That sample-state version had 541 nodes, 514 core entities, 1,584 displayed relations and 1,076 RDF quantitative observations. All other final triples and scientific graph records are unchanged apart from exposing existing sample metadata. Earlier material, condition, measurement and experiment-binding repairs remain in the input chain. Model identity/variant and Scope links remain 9/3/81; all 241 original fingerprints match.

Receipts, offline execution and previous snapshot copies: `updates/sample-state-20261101/corrections.json`, `table-replay.json`, `verification.json` and `before/`. Revised prompts have not been tested through fresh API completions.

## Flattened Reductive Leaching table publication (1 November 2026)

`updates/flattened-table-published-20261101/` reuses the successful `flattened-table-test-20261101/result.json` without further extraction calls. Table 1 now has one constituent-header row and one Wt.% row. Its six observations are LiCoO2 27.5, Steel/Ni 24.5, Cu/Al 14.5, carbon 16, electrolyte 3.5 and polymer 14. Values and units are unchanged; carbon is normalized to C through the existing material canonicalizer. The previously established document-level LIB container is retained.

All six table records and their cell coordinates are replaced across the published views. The other 39 final triples in this paper are unchanged. Its derived source JSON/Markdown, Gate response, Semantic IR and execution archive use the verified flattened-table version, so source-cell navigation follows the new columns. Earlier table artifacts and original frozen source remain in their previous versions. The preceding API test used two calls; this publication uses zero new extraction API calls.

That flattened-table version had 542 nodes, 515 core entities, 1,587 displayed relations and 1,076 RDF quantitative observations. All unrelated scientific graph records and all fusion-link endpoints are unchanged. All six guides / 51 stops and 1,991 graph-to-archive records pass; all 241 original frozen fingerprints match. See corrections.json and verification.json in this update directory.

## Numeric attribution corrections (1 November 2026)

`updates/numeric-attribution-20261101/` withdraws three Li=99/75/30% temperature-point claims whose quoted sentence assigns those values to Co and describes Li only as similar. The independently reported Li=75% without reductant remains. All three Co temperature points remain, with the explicit close-to-99% approximation retained. The Li qualitative comparison is preserved in evidence, without inventing three Li point values. All other final triples, including the six verified table results, remain identical.

A general numeric-attribution rule alone failed the first local DeepSeek test: all three unsupported Li values were copied again. A short generic contrast example was then added to the existing Relation prompt, without a material/value blacklist or another agent. The second test on the same two source paragraphs retained the independent Li=75% and Co points, emitted no unsupported Li numbers, and retained the trend as unquantified evidence. Both attempts, prompts, responses and summaries are archived in local-test-initial/ and local-test/. This is a local success after a failed first attempt, not a corpus-wide reliability estimate. No other extraction agent was called; the two local tests used two API calls in total.

The published revision changes only the reviewed claims, rather than replacing every relation with the fresh test output. Approximation qualifiers now survive graph/replay export and display. Revision / Postprocessing exposes the correction receipt, qualitative evidence and local Relation result. Original Relation-stage files remain historical. Original frozen data, previous snapshots and the flattened-table source remain intact.

That numeric-attribution version had 542 nodes, 515 core entities, 1,587 displayed relations and 1,073 RDF quantitative observations. Validation: 45 focused Python tests, six guides / 51 stops and 1,988 graph-to-archive records; all 241 original frozen fingerprints match. All fusion-link endpoints are unchanged. Receipts: corrections.json and verification.json in this update directory.

## Reproduction commands

From the repository root, with a Python environment containing rdflib, torch and transformers:

```sh
python3 demo/ontoweee/build_dataset.py demo/ontoweee/datasets/battery20/manifest.json --phase prepare
HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 python3 weee_kg_system/fusion/FLORA/run_flora_fusion.py --mineru-root demo/ontoweee/datasets/battery20/inputs --catalog demo/ontoweee/datasets/battery20/catalog.json --outdir demo/ontoweee/datasets/battery20/fusion-published --triple-field triples --max-iterations 100
python3 demo/ontoweee/build_dataset.py demo/ontoweee/datasets/battery20/manifest.json --phase export --fusion-dir demo/ontoweee/datasets/battery20/fusion-published --output-dir demo/ontoweee/datasets/battery20/snapshot/data
```

These record the completed build, not a command to overwrite it: export refuses an existing snapshot. For a future version, use a new dataset directory and update its case/guide paths. The local build used `/Library/Frameworks/Python.framework/Versions/3.12/bin/python3`; the default Homebrew Python does not have the required fusion libraries installed.

## Suggested industry presentation

Start with the phone-model battery fraction to establish provenance, then battery composition to identify resource targets. Use bioleaching or ultrasound to inspect a material-specific outcome with its feed and conditions. Use anode leaching to show why input granularity matters. Finish with flotation to demonstrate an extraction failure honestly. None of these observations is automatically applicable to a catalog phone's battery, and no measurements are pooled.

Catalog records establish model/specification context. A shared battery label or chemistry does **not** establish that a recycling experiment was performed on a particular catalog phone, or justify copying/averaging its measurements.


## Final publication orphan cleanup (2026-11-01)

`updates/orphan-cleanup-20261101/` applies the shared final-export cleanup to the existing fused RDF, without extraction API calls or recomputing alignments. Cleanup runs after fusion and Scope links exist. Labels, literal attributes, reified evidence references and category membership alone do not count as a real connection. Connections to Scope and Observation nodes do count; a Process is not removed merely for lacking `HAS_OUTPUT` when it has another real connection.

The update removes 45 isolated core entities: 9 Product, 4 Component and 32 Material. All 87 ScopeContext nodes remain. The active projection has 497 nodes, including 470 core entities, and no remaining isolated displayed nodes. All 1,587 displayed edge records and 1,073 quantitative observations remain unchanged.

Original extraction archives, all 20 frozen inputs and the preceding fusion snapshot are preserved. Validation checks all 241 original frozen fingerprints and archived download hashes, eight related Python tests, six guides / 51 stops and 1,988 graph-to-archive records. Removal details and validation are recorded in [cleanup.json](updates/orphan-cleanup-20261101/cleanup.json) and [verification.json](updates/orphan-cleanup-20261101/verification.json). `before/data/` preserves the previous active snapshot.


## Battery type normalization (2026-11-01)

`updates/battery-types-20261101/` publishes canonical names and Component types for 45 battery-related entities using the existing ontology alias dictionary. Seventeen entities previously typed Product become Component. All 17 distinct lithium-ion battery source entities now share the `lithium-ion battery` browsing group, including sources without Scope metadata. Ni–Cd, Ni–MH, LFP, unspecified battery, power battery and battery module retain separate type names; an unspecified chemistry is never inferred from a broad word such as battery.

The publication vocabulary is declared by `published_component_types` in `weee_kg_system/ontology/entity_canonicalization.json`; aliases are read from its existing `component_aliases` section. The shared final fusion exporter matches complete labels, preserves former spellings as aliases and writes a `canonicalType` attribute for grouping. Ambiguous aliases and unmatched sample labels are not guessed. This is an ontology vocabulary, without article-specific conditions or substring rules. Type metadata takes precedence over a broad Scope label for browsing, without rewriting or inheriting Scope.

All node IDs, 87 ScopeContext records, 1,587 displayed relations and their evidence records, and 1,073 quantitative observations remain unchanged. The active graph still contains 497 nodes, including 470 core entities, with no display isolates. Frozen inputs and extraction replay archives retain the original extraction decisions; the final published graph reflects the normalization. Neither extraction APIs nor alignment recomputation were used.

Ten related Python tests and the hierarchy regression test pass; all six guides / 51 stops and 1,988 graph-to-archive records resolve. The preceding active graph and manifest are in `before/`; the prior fusion snapshot remains untouched. See [normalization.json](updates/battery-types-20261101/normalization.json) for entity changes and [verification.json](updates/battery-types-20261101/verification.json) for checks. A fingerprinted copy of the applied ontology vocabulary is stored beside these receipts.


Component browsing follow-up: `hierarchy.js?v=component-groups-20261101` registers published canonical types before Scope/catalog fallbacks, matches Component type names with normalized whitespace and hyphens, and resolves registered aliases to the same preferred label. Exact-name samples without Scope can therefore join an established type group without inheriting Scope or merging identity. Product grouping is unchanged. The actual HTTP-served script was checked against all 17 distinct lithium-ion source samples; the graph SHA-256 is unchanged. Mixed-metadata regression tests retain independent sample composition values and keep unsupported or ambiguous matches unclassified. See [component-grouping-verification.json](updates/battery-types-20261101/component-grouping-verification.json).


Component name-group fallback: `hierarchy.js` and `app.js` now load with `v=component-name-groups-20261101`. Components that still lack a declared type can form a browsing-only NAME GROUP when their normalized full names repeat. Empty names and conflicting registered aliases are excluded. The rule contains no article/component name list, does not equate different names, and does not mutate frozen graph data. In the active dataset it moves 33 entities into ten name groups and reduces unclassified Components from 100 to 67. All source-specific nodes, scopes and measurements remain separate. See [component-name-group-verification.json](updates/battery-types-20261101/component-name-group-verification.json) for the HTTP-served code and snapshot checks.


Graph level navigation: Top level, the Overview breadcrumb and All entities preserve source/type/relation filters and the fusion-link toggle. They only change the presentation level and clear the current drill-down route. The regression test switches repeatedly between levels with filters enabled and checks the visible entities, in addition to existing Back restoration checks. The versioned page script is `app.js?v=preserve-graph-filters-20261101`; graph data and extraction archives are unchanged.
