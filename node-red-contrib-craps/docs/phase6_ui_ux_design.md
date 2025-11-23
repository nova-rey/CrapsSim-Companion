# Phase 6-A – UI/UX Unification & Palette Cleanup (Design Checkpoint)

This document captures the Phase 6 design plan for unifying the Node-RED craps pack presentation layer. No behavioral or mapping changes are included in this phase.

## Palette Organization
- Two top-level categories only:
  - **Craps: Strategy Builder** – Bet Type, Bet Props, Bet In, Clear Bets, Strategy Compiler.
  - **Craps: Execution** – Vanilla Exporter, Engine API Runner, Batch Runner, and future Parity Tester/Capability Checker placeholders.
- No nodes live outside these categories; names and palette groups must match their intent.

## Public-Facing Node Names
- Strategy Builder labels:
  - Bet Type → **Bet: Line/Place/Lay/Odds**
  - Bet Props → **Bet: Props/Hardways/Hops**
  - Bet In → **Bet Variable**
  - Clear → **Clear Bets**
  - Strategy Compiler → **Compile Strategy**
- Execution labels:
  - export-vanilla → **Run: Export to CrapsSim (Legacy)**
  - api-runner → **Run: Engine API Simulation**
  - batch-runner → **Run: Batch Simulation**
- Internal type names remain unchanged; only displayed labels, help headers, and UI headings update.

## Standard Form Layout (Betting Nodes)
- Consistent field order: **Bet Key → Amount → Units → Number (if required) → Extra Flags → Optional Note**.
- Layout spacing: 12px separation between sections, vertical alignment only, no mixed inline layouts, and half-width fields only when necessary.

## Colors and Icons
- Builder nodes: soft blue `#4C8BF5` with puzzle-piece icon.
- Execution nodes: deep purple `#6A4CCF` with rocket/terminal triangle icon.
- Utility nodes (Clear Bets, Bet Variable): slate gray `#64748B` with wrench/adjustments icon.
- All icons use 24×24 SVGs stored under `icons/`.

## Help Text Style Guide
- Sections for **What this node does**, **Inputs**, **Outputs**, and **Errors**.
- Tone: concise, direct, aligned with CrapsSim API terminology; avoid unnecessary Node-RED jargon or implementation details.

## Node-Specific UX Notes
- **Bet: Line/Place/Lay/Odds** – Remove obsolete prop/unsupported bet UI, show number selector only for families needing a number, and keep odds “working” toggle limited to odds families.
- **Bet: Props/Hardways/Hops** – Limit props to verbs that map cleanly to CrapsSim; hop UI uses two 1–6 dropdowns; hardways restrict numbers to 4, 6, 8, and 10.
- **Clear Bets** – Help text clarifies this is local filtering rather than a CrapsSim API clear verb; uses utility slate-gray styling.
- **Compile Strategy** – Help text explains production of `strategy_config`.
- **Run: Engine API Simulation** – UI groups for API Parameters, Seeding, Rolls, and Output options; document parity mode activation via `msg.roll_mode = "script"`; remove legacy Vanilla-only hints.
- **Run: Batch Simulation** – Streamline seed options and unify batch output documentation.

## Phase 6-B Implementation Scope
- Update all `.html` node files for labels, layout, colors, and help text per this plan.
- Adjust palette categories and color assignments in `.html` as needed; minimal JS tweaks only when HTML attributes require it.
- Add the unified icon set under `icons/`.
- README and broader docs to be updated later in Phase 6-C.

## Out of Scope
- No new bet types, catalog changes, mapping changes, behavioral changes, API runner logic changes, new families, or error model changes.
