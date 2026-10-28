---
version: 1
slug: "static-index-html"
primary_target: "static/index.html"
related_targets: ["static/assets/app.js","static/assets/style.css"]
---

# CreditDesk workspace
Mode: Operate. Audience: bank staff. User-pinned replacement palette: black and gold.
## Direction contract
THESIS: A Vietnamese credit appraisal workspace. Search, profile context and reviewer action lead; engineering commentary stays out of business screens.
OWN-WORLD: Charcoal rail, ivory work surfaces, muted brass for selected navigation and primary actions; workhorse system sans and aligned tabular figures.
STORY: Staff identify the active dataset, filter records, open an appraisal, read score and evidence, then record a proposal.
FIRST VIEWPORT: Fixed 224px navigation on desktop; slim context header; source selector above compact filters and a dense, readable table. Appraisal has score/evidence left and a sticky decision form right. Mobile uses a horizontally scrolling navigation bar and stacked work areas.
FORM: Standard banking workspace, constrained by explicit user black/gold brief. Seed 029fdd0c. Signature: the selected record and pending review share a brass accent and an inline status label. Motion: brief source-state transition with reduced-motion support.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Finish verdict
Completed: desktop list/appraisal, dataset and profile dialogs, model report and policy navigation, and 390px appraisal inspected. Mobile denominator wrap corrected; table opening actions remain available at narrow widths. The source dialog contains only dataset name/count and a switch action. JavaScript syntax checks and all 22 API tests pass. DESIGN.md records the shipped system. Raster outputs are browser screenshots in runtime/, not shipping artwork.
