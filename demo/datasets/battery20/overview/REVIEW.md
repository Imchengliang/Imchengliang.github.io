# Battery overview source review

Reviewed on 4 November 2026. This view uses the 20 battery-demo papers and their frozen source text, tables and final relations.

## Classification basis

Sample profiles are reviewed annotations with literal source passages in `review.json`. Chemistry, material stream, feedstock source and preparation state are recorded separately. A paper can contribute several profiles. Profiles represent study materials or cohorts. Physical sample counts remain in the source archives.

Chemistry follows the described study material. An NMC product or paper title alone does not establish that its input was NMC. Unspecified chemistry is retained where the source does not establish a narrower class. Manufacturing scraps, end-of-life material, size fractions and recycling intermediates retain their own context.

## Available records

- 20 reviewed studies and 29 sample profiles.
- 151 elemental mass-composition records from 8 studies.
- 56 reviewed treatment methods and 244 numeric percentage result records.
- 135 results have a usable temperature in their own observation context.

Study coverage appears beside each result table; sample-profile coverage appears in the statistical summaries and source review. Multiple assays of the same profile remain separate measurements.

## Composition eligibility

The mass-composition view accepts existing `CONTAINS` observations selected during source review. Each table value is checked against its original cell and element header. Text observations use reviewed sample subjects and source passages. Only explicitly approved elemental mass bases and supported mass units enter the composition view. Unit conversion uses the existing pipeline unit aliases and mass-ratio arithmetic. Original values, units, uncertainty and record identifiers are retained.

Important source decisions include the following.

- Smartphone Assessment contributes the battery columns of its elemental-composition table. Its component mass shares and allocation of an element across phone parts use separate denominators.
- Chemical Characterisation contributes seven Ni-Cd, Ni-MH and Li-ion fractions. Every fraction keeps its own chemistry and size context. Its aqueous leachate concentrations are separate from feedstock mass composition.
- Bioleaching contributes the XRF and acid-digestion assays separately.
- The HCl anode paper contributes five ICP-AES contents in mg/g, converted by mass to wt%.
- Copper-Catalyzed EDX percentages have an unspecified mass-versus-atomic basis. They are excluded from the mass-content summary pending clarification. The unresolved Ki identity is also excluded.
- Combined Recovery gives a collective impurity total for several elements in recovered electrodes. The output copied to individual impurities is excluded. The separately reported Co content is retained.
- Surface atomic fractions, compound shares, solution concentrations and regenerated-product composition have separate measurement objects and are excluded from this feedstock-element summary.

## Query semantics

1. Composition returns retained observations with their sample and assay. The Records view shows individual measurements.
2. Content thresholds apply to normalized elemental mass fractions. Qualified bounds are excluded from this threshold query.
3. Treatment queries use the reviewed experimental input for each frozen Process. A target filter requires a retained numeric result for that material.
4. Recovery and temperature filters must both match one observation. Temperature ranges use their upper end. A specified temperature limit excludes missing temperatures and literature-table average conditions. Leaving the temperature limit blank imposes no temperature requirement.
5. Reagent absence requires explicit wording in the observation or treatment name. Reagent names are matched literally after case and Unicode normalization.
6. Comparison groups by material stream, chemistry, method family, target and metric. Reported ranges use the retained unqualified scalar values. Preparation, assay and experimental conditions remain visible in individual rows.

The original graph and extraction archives remain the provenance behind Graph and Source actions. Each numeric row stores its actual final-record index and relation ID. The page checks their agreement before opening evidence. The source-review data are independent of runtime query code.

## Per-study decisions

| Study | Reviewed material groups | Elemental mass records | Percentage result records | Review notes |
| --- | --- | ---: | ---: | --- |
| A Combined Recovery Process of Metals in Spent Lithium-Ion Batteries | Whole spent lithium-ion batteries<br>Recovered mixed electrode fraction | 6 | 4 | The reported 2% impurity total is excluded from individual Al, Fe and Cu contents. |
| A Comprehensive Characterization of End-of-Life Mobile Phones for Secondary Material Resources Identification | Batteries dismantled from 20 phone models | 0 | 0 | The study reports battery mass shares in phones. Its elemental table concerns electronic parts. |
| A Copper-Catalyzed Bioleaching Process for Enhancement of Cobalt Dissolution from Spent Lithium-Ion Batteries | Ground cathode powder | 0 | 5 | EDX percentages have an unspecified mass/atomic basis. The Ki header is unresolved. Sediment compositions are post-treatment records. |
| A Promising Physical Method for Recovery of Licoo 2 and Graphite from Spent Lithium-Ion Batteries Grinding Flotation | LiCoO2 / graphite electrode powder | 0 | 10 | 66.75% describes LiCoO2 compound content. XPS surface percentages are excluded from elemental mass summaries. |
| Assessment of Smartphones’ Components and Materials for a Recycling Perspective- Tendencies of Composition and Target Elements | Phone batteries manufactured before 2015<br>Phone batteries manufactured after 2015 | 27 | 0 | Table 3 distributes each element among phone components. Those shares are excluded from battery concentration summaries. |
| Bioleaching of Valuable Metals from Spent Lithium-Ion Mobile Phone Batteries Using Aspergillus Niger | Mixed cathode and anode powder | 21 | 17 | XRF and digestion are assays of the same sample group. |
| Chemical Characterisation of Spent Rechargeable Batteries | Ni-Cd ferrous fraction<br>Ni-Cd fraction below 1 mm<br>Ni-Cd fraction 1–3 mm<br>Ni-MH fraction below 1 mm<br>Ni-MH fraction 1–3 mm<br>Li-ion fraction below 1 mm<br>Li-ion fraction 1–3 mm | 77 | 0 | Table 3 reports leachate release in mg/kg and is excluded from feedstock composition. Table 3 reports leachate release in mg/kg and is excluded from feedstock composition. Table 3 reports leachate release in mg/kg and is excluded from feedstock composition. Table 3 reports leachate release in mg/kg and is excluded from feedstock composition. Table 3 reports leachate release in mg/kg and is excluded from feedstock composition. Table 3 reports leachate release in mg/kg and is excluded from feedstock composition. Table 3 reports leachate release in mg/kg and is excluded from feedstock composition. |
| Comprehensive Evaluation on Effective Leaching of Critical Metals from Spent Lithium-Ion Batteries | LiCoO2 cathode production scrap | 0 | 98 | Frozen TiO=5 wt.% has no validated elemental mass-composition basis for this overview. |
| Green and Facile Method for the Recovery of Spent Lithium Nickel Manganese Cobalt Oxide (NMC) Based Lithium Ion Batteries | Cathode and anode films from phone batteries | 0 | 4 | The title mentions NMC while the sample description reports mixed brands and LiCoO2 diffraction. A specific NMC feed chemistry is left unassigned. Literature-comparison results are excluded. |
| Heat Treatment of Licoo2 Recovered from Cathode Scraps with Solvent Method | LiCoO2 cathode manufacturing scrap<br>Impure Al foil mixture after solvent separation | 0 | 3 | Slurry, recovered active material and fabricated test electrodes have different composition bases. No elemental feedstock fractions are available in the frozen output. Electrochemical cycling is a product performance test and is excluded from treatment queries. This is the downstream foil mixture from solvent separation. NaOH dissolution is linked to that mixture as its experimental input. |
| Leaching Lithium from the Anode Electrode Materials of Spent Lithium-Ion Batteries by Hydrochloric Acid (Hcl) | Calcined anode active material | 5 | 8 | The source gives 500 °C in preparation and 600 °C in characterization. This overview retains the broader calcined state. |
| Pneumatic Separation and Recycling of Anode and Cathode Materials from Spent Lithium Iron Phosphate Batteries | Crushed LiFePO4 battery-core fragments | 0 | 2 | Al=96% and Cu=97% are product metal fractions. Component masses in kg have no validated whole-sample mass denominator. |
| Process Controls for Improving Bioleaching Performance of Both Li and Co from Spent Lithium Ion Batteries at High Pulp Density and its Thermodynamics and Kineti | Mixed cathode and anode powder | 2 | 12 | Source material and frozen sample identity reviewed. |
| Pyrolysis-Ultrasonic-Assisted Flotation Technology for Recovering Graphite and Licoosub2sub from Spent Lithium-Ion Batteries | LiCoO2 / graphite electrode mixture | 0 | 5 | Surface XPS and thermal products are excluded from bulk elemental feedstock composition. |
| Recovery of Cobalt as Cobalt Oxalate from Spent Lithium Ion Batteries by Using Glycine as Leaching Agent | Separated LiCoO2 cathode material | 0 | 7 | Residual carbon and literature review tables are excluded from feedstock metal mass summaries. |
| Recovery of Lithium, Nickel, Cobalt, and Manganese from Spent Lithium-Ion Batteries Using Scplscp-Tartaric Acid as a Leachant | Cathodic material from mixed consumer LIBs | 5 | 12 | Source material and frozen sample identity reviewed. |
| Reductive Leaching of Cathodic Active Materials from Lithium Ion Battery Wastes | Calcined LiCoO2 cathodic active material | 0 | 13 | Table 1 gives typical whole-battery constituent fractions, including LiCoO2 and Cu/Al mixtures. These are excluded from elemental feedstock mass fractions. |
| Selective Leaching of Valuable Metal from Spent Lithium-Ion Batteries in the Alkaline Glycinate System | Ternary lithium-ion battery black powder | 8 | 9 | Source material and frozen sample identity reviewed. |
| Synthesis and Performance of Li[(ni13co13mn13)1−mg ]o2 Prepared from Spent Lithium Ion Batteries | Battery-derived leachate and recovered salts | 0 | 0 | Solution concentrations and regenerated cathode composition are retained in trace. Regenerated NMC chemistry is not assigned to the original feed. |
| Ultrasound-Assisted Leaching of Cobalt and Lithium from Spent Lithium-Ion Batteries | Calcined cathode active material | 0 | 35 | Source material and frozen sample identity reviewed. |

## Rebuild and verification

Run from the repository root.

```sh
python3 demo/ontoweee/build_battery_overview.py
python3 -m pytest demo/ontoweee/test_build_dataset.py demo/ontoweee/test_battery_overview.py -q
node --test demo/ontoweee/*.test.cjs
```

The builder checks the hashes of all reviewed final-result inputs and paper text, the source-table axes and values, and final replay record identities before emitting `data.json`. It makes zero extraction API calls.

The browser reads `data.json` through the local HTTP server. The entry page loads Battery overview first. Query filters persist when opening and returning from the existing graph or extraction trace.

## Scope of the first version

The frozen outputs have uneven evidence coverage. Some studies provide treatment results without usable elemental feedstock composition. The reviewed result list is limited to numeric percentage records already present in the frozen outputs. The view supports source inspection and literature comparison. Treatment feasibility also depends on scale, reagent use, product quality and operating cost.

Graph SHA-256

```text
9cadfb8b0bad0e9f086423200df866a24aafe24b8758ecd64ded47dcb2039a12
```

## Local RDF queries and statistics — 5 November 2026

The current local entry uses `server.py`. Its fixed queries run against the independent `ontoweee-battery20` GraphDB repository. The frozen fusion graph and reviewed annotations are imported into separate, content-versioned named graphs. Existing repositories retain their data.

`analysis.ttl` represents reviewed sample profiles, treatment associations, elemental mass-composition eligibility, normalized mass fractions, result conditions and archived record identities. Queries select these reviewed records and require the corresponding source entity in the frozen graph. The JSON payload stored beside queryable RDF fields is the exact transport record used by the existing evidence viewer.

Of the 395 retained numeric records, 384 link to existing Observation nodes. Eleven records have direct archived evidence but lack an Observation in the old export, whose conversion admitted Component/Process sources and Material/Element targets. These eleven retain their archived relation ID, final-record index, source entity and evidence in the reviewed projection. Their original graph is fingerprinted in `analysis-manifest.json`.

The source graph contains 28,876 RDF triples. The reviewed annotations contain 10,900 triples. These counts include metadata and transport fields.

### Running locally

From the repository root, using the Python environment that contains RDFLib, requests, pandas and NumPy.

```sh
docker start graphdb
python3 demo/ontoweee/build_analysis_rdf.py --load
python3 demo/ontoweee/server.py
```

Open `http://127.0.0.1:8765/index.html`. GraphDB Workbench is available at `http://127.0.0.1:7200`. The existing GraphDB client creates and loads the independent repository. Its ruleset is empty, so queries use the exported assertions. Repeated loads reuse matching named graphs and check their triple counts.

`--graphdb-url` and `--repository` select the local database connection. `server.py --local-rdf` runs the same SPARQL templates through RDFLib for explicit offline checks. The active browser entry requires the local query service. The local API requires a running query/statistics service. The GitHub Pages release filters the verified frozen transport records in the browser and executes the shared Python statistics through Pyodide.

### Statistics definitions

Select **Statistical summary** to obtain record mean, median, minimum, maximum and sample standard deviation (`ddof=1`). A single retained record has no sample SD. Qualified values remain in the result list and are excluded from these scalar summaries. Duplicate projections of the same original Observation within one reviewed sample profile count once.

The default grouping retains sample profile and assay for compositions, and sample profile, method and exact recorded condition description for treatment results. **Broader descriptive comparison** groups compositions by material stream, chemistry, state, assay and target. Treatment comparisons retain material stream, chemistry, method family, target and metric, with the number of condition descriptions displayed.

These summaries describe selected records. Repeated conditions from one study can be correlated, and textual condition differences can refer to overlapping experiments. The interface shows study and sample-group coverage, retains each contributing record, and displays its evidence links. Sample SD describes record spread. Original measurement uncertainty stays attached to the source measurement. Confidence intervals, independent experiment counts and automatic route recommendations require additional evidence and assumptions.

The HTTP API accepts fixed template names and validated structured parameters. Browser selections are encoded as RDF literals in SPARQL. Query results include the executed query and snapshot fingerprint for reproducibility. The API exposes query and status operations.

```sh
ONTOWEEE_GRAPHDB_TEST=1 python3 -m pytest demo/ontoweee/test_build_dataset.py demo/ontoweee/test_battery_overview.py demo/ontoweee/test_battery_analysis.py -q
node --test demo/ontoweee/*.test.cjs
```


### Comparison and statistical-unit update

Method-family comparison ranges and coverage are computed by the same Python analysis code as the statistical summaries. The browser renders the returned groups and contributing records. Qualified records remain visible in comparison coverage while numeric ranges use unqualified values.

**Statistical unit** offers reported measurements or one mean per study with equal study weights. For the latter, Python first calculates the mean of retained observations within each paper and selected context, then summarizes these paper means. Mean, median, range and SD all refer to that selected unit. The original record count, study count and contributing records remain visible. This descriptive choice retains the contextual grouping and does not establish experimental independence.

**Reported time condition** and **Reported concentration condition** are populated from the frozen `condition_keys` records. There are 65 results with recorded time descriptions and 100 with recorded concentration descriptions. Both selections must match the same result. Their original wording preserves the operation, reagent and stage where recorded. A cultivation duration or grinding duration therefore retains that description. A full workflow duration is a separate quantity requiring its own evidence.

The six-query analysis uses the same named-graph versioning and frozen source hashes after this update. No extraction model is invoked.

### Simplified overview interface

Composition and Treatment routes share one Feedstock selector and one Target selector. More filters contains optional constraints; collapsed active filters remain visible as a short line. Records and Statistical summary occupy the same result area. Summary settings and source coverage are collapsed initially. Selecting recovery, temperature, time, concentration or reagent-absence filters switches the treatment inventory to matching experiments. All selected result conditions must hold for the same observation. The underlying reviewed records and source hashes are unchanged.

### Static release — 6 November 2026

`analysis-records.json` exports the exact Composition and Result payloads from the verified RDF snapshot. Their record ID sets must match the reviewed overview, including the original Observation IDs where available. Browser filters use the same fixed-query semantics verified against SPARQL. The shared `battery_statistics.py` runs both in the local API and in a Pyodide module worker for the static site. Both grouping choices and both statistical-weight options are checked for parity. First-use Python packages load from the pinned Pyodide distribution; records and calculations stay in the browser.
