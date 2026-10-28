# CreditDesk design system

## Audience and mode
Operate: Vietnamese bank staff. List → appraisal → record a proposal. Dataset context is visible; repository and storage details belong in developer documentation.

## Palette
- Shell: charcoal `#191b1e`, active region `#363126`.
- Workspace: cool neutral `#f8f9fa`, surfaces white, divider `#e4e3df`.
- Primary action: brass `#c1a46b` with dark text. Active navigation: `#e8c982`.
- Links: dark brass `#72541e`. Body: `#25272b`; supporting text: `#666a70`.
- Positive changes: `#286449`; negative changes: `#a0473d`. Words and signs preserve meaning alongside color.

## Typography and spacing
Be Vietnam Pro, self-hosted in static/assets/fonts/, with Vietnamese and Latin subsets at weights 400/500/600/700 under the SIL Open Font License. Headings 26–28px, section headings 18px, normal copy 14–15px, metadata 13px. Tabular numbers in tables and scores. Primary buttons and form controls are 44px high with an 8px radius; text actions have a 36–40px hit area. Mobile fields use 16px type to avoid focus zoom. Spacing uses 8/12/16/24/32px.

## Structure
Desktop: fixed 240px sidebar, 64px context header, work area padded 32px. Compact dataset selector above search filters and a full-width profile table. Appraisal: assessment left, sticky 336px proposal form right. The selected record uses a warm brass background. The primary proposal action uses the same accent.
Mobile: compact brand plus horizontally scrollable navigation, stacked filters and appraisal panels. Profile tables scroll within their own region; ID and opening action remain reachable at the edges. Sidebar never imposes desktop width on the page.

## Content
Dataset dialogs show only dataset name and count with a change action. Profile information shows dataset, group and saved review. CSV upload requirements live under import help. The model report and policy simulation remain secondary navigation. Policy output retains its simulation meaning.

## States and accessibility
Visible labels and focus rings; native select, input, details and dialog behavior. Loading, no matches, errors, unsaved and saved proposals retain explicit text. Reduced motion disables transitions. No generated identity, account or operational metrics.

## Verification
Inspected list, appraisal and dataset dialog on desktop, and appraisal/list at 390px. Fixed mobile score denominator wrapping and kept table actions available on narrow layouts. API regression suite and JavaScript syntax checks pass. No bitmap art is shipped; logo is a project SVG and result captures are browser screenshots.


## Finance workspace refinement · 28/10/2026
Reference evidence: Mercury's [Transactions update](https://mercury.com/blog/updated-transactions-page), including the published UI gallery, and Ramp's [platform workflows](https://ramp.com/platform). Borrow task proximity, table readability and progressive disclosure; retain CreditDesk's own charcoal/brass identity. No external product artwork is copied into the app.

Source selection sits on a quiet context line. The catalog offers All profiles and In appraisal desk views over real records, right-aligned numeric columns and compact rows. The appraisal pager offers a direct ID selector backed by the persisted desk. Remove repeated explanation text and decorative sidebar/footer copy.

Custom policy uses a 304px condition column with a comparison table beside it; narrow screens stack those areas. Target approval rate chooses an exact whole-number quota independently for A and B, ordered by predicted risk and then customer ID. Results show predicted risk and boundary values, with explicit rounding/tie rules. Empty and changed-condition states clear old results.

Verification: 36 API tests pass; browser checks cover the 50% quota, zero-selected state, desk scope, direct ID navigation and reload restoration. At 390px, the page stays within the viewport and wide tables scroll inside their own region. No new dependencies or generated illustrations.


## Typography, layout and buttons
Primary actions use the same brass fill and height across search, simulation and proposal forms. Dataset import is a bordered secondary action. Buttons define hover, pressed, disabled and keyboard-focus states. Field heights and baseline rhythm align across catalog, appraisal and policy screens; narrow page headings place actions beneath the title without squeezing Vietnamese copy.

Verified the loaded Vietnamese font, 44px primary button height and 14px desktop button text in the browser. Catalog, appraisal and custom policy were inspected at 1440px; 390px catalog uses 16px fields and stays within the viewport. This pass changes presentation only; JavaScript syntax and the UI detector pass.
