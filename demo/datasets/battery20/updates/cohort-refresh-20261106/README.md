# Local battery-demo cohort refresh — 6 November 2026

The local demo now uses the approved four replacements in `replacements.json`. It contains 20 papers and the same 12 connected GSMArena catalog records. This update is local only; the online version has not been published.

## Source integrity

- The 16 retained final extraction files are byte-identical to the preceding active snapshot.
- Four additional papers reuse frozen all_batches extraction outputs and original Markdown/tables. No extraction or entity-alignment API was called.
- Each new input includes `cohort_review.json` with reviewed relation/entity changes, rejected claims and original evidence. `scope_review.json` records Scope corrections. These are reviewed data annotations, not paper-specific runtime filters.
- The original extraction archives were not modified. `before/data/` retains the complete preceding active graph and traces; other `before/` files retain its paper list, review and manifests.
- The same 12 catalog model links are reused after validating both endpoints. New Scope links are computed using existing deterministic fusion code.

## Current counts

- 431 core entities, 452 display nodes, 1805 displayed edges, 1351 quantitative observations.
- 20 complete extraction traces; six authored walkthroughs with 49 stops. The LFP walkthrough replaces the retired pyrolysis/flotation walkthrough.
- 32 reviewed sample profiles; 196 elemental mass-composition records from 12 papers.
- 38 reviewed treatment methods; 386 numeric percentage results. 10 papers contribute both composition and treatment results.

## Review boundaries

Ni-MH positive/negative electrode compositions remain separate from the mixed-electrode leach feed. RE denotes rare-earth elements, not rhenium. Zn–Mn and Ni–Cd powders remain distinct samples; strain and medium conditions remain attached to their results. NMC orthogonal runs retain their own factor values; K/R analysis and activation energies are not material outputs. LFP cathode fractions remain distinct from whole-cell composition, and Others is not an identified element. Reported concentrations are not forced to sum to 100%.

Old direct-repair records may place coordinates under `provenance`; the overview reader accepts both documented coordinate layouts and checks the same original cell and element axis.

## GraphDB

Repository: `ontoweee-battery20`. The active source and analysis named graphs are selected by `../../overview/analysis-manifest.json`. Historical contexts may remain stored for reproducibility but are not included in active queries. Current RDF counts: 33184 source triples and 15329 analysis triples.

## Per-paper overview coverage

| Paper | Composition records | Percentage result records |
|---|---:|---:|
| A Combined Recovery Process of Metals in Spent Lithium-Ion Batteries | 6 | 4 |
| A Comprehensive Characterization of End-of-Life Mobile Phones for Secondary Material Resources Identification | 0 | 0 |
| A Promising Physical Method for Recovery of Licoo 2 and Graphite from Spent Lithium-Ion Batteries Grinding Flotation | 0 | 10 |
| Assessment of Smartphones’ Components and Materials for a Recycling Perspective- Tendencies of Composition and Target Elements | 27 | 0 |
| Bioleaching of Valuable Metals from Spent Lithium-Ion Mobile Phone Batteries Using Aspergillus Niger | 21 | 17 |
| Chemical Characterisation of Spent Rechargeable Batteries | 77 | 0 |
| Comprehensive Evaluation on Effective Leaching of Critical Metals from Spent Lithium-Ion Batteries | 0 | 98 |
| Heat Treatment of Licoo2 Recovered from Cathode Scraps with Solvent Method | 0 | 3 |
| Leaching Lithium from the Anode Electrode Materials of Spent Lithium-Ion Batteries by Hydrochloric Acid (Hcl) | 5 | 8 |
| Pneumatic Separation and Recycling of Anode and Cathode Materials from Spent Lithium Iron Phosphate Batteries | 0 | 2 |
| Process Controls for Improving Bioleaching Performance of Both Li and Co from Spent Lithium Ion Batteries at High Pulp Density and its Thermodynamics and Kineti | 2 | 12 |
| Recovery of Cobalt as Cobalt Oxalate from Spent Lithium Ion Batteries by Using Glycine as Leaching Agent | 0 | 7 |
| Recovery of Lithium, Nickel, Cobalt, and Manganese from Spent Lithium-Ion Batteries Using Scplscp-Tartaric Acid as a Leachant | 5 | 12 |
| Reductive Leaching of Cathodic Active Materials from Lithium Ion Battery Wastes | 0 | 13 |
| Selective Leaching of Valuable Metal from Spent Lithium-Ion Batteries in the Alkaline Glycinate System | 8 | 9 |
| Ultrasound-Assisted Leaching of Cobalt and Lithium from Spent Lithium-Ion Batteries | 0 | 35 |
| Hydrometallurgical Process for Recovery of Metal Values from Spent Nickel-Metal Hydride Secondary Batteries | 17 | 23 |
| Bioleaching of Spent Zn–mn or Ni–cd Batteries by Aspergillus Species | 20 | 12 |
| Sustainable Recovery of Cathode Materials from Spent Lithium-Ion Batteries Using Lactic Acid Leaching System | 4 | 101 |
| Recycling of Spent LiFePO 4 Batteries Using Ultrasonic-Assisted Reducing Leaching | 4 | 20 |

Counts are records, not independent experiments or physical sample counts. Review does not establish statistical comparability or exhaustive extraction accuracy.
