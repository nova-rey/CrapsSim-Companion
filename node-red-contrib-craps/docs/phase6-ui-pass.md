# Phase 6 UI/UX Pass

This pass standardizes the Node-RED palette presentation, labels, colors, icons, and help content without changing any runtime behavior or bet mappings.

## Palette categories
- **Craps: Strategy Builder** for construction/utility nodes (bet nodes, clear, compiler, variables).
- **Craps: Execution** for runtime/export nodes (Engine API runner, batch runner, vanilla exporter).

## Node labels and colors
- Builder nodes use blue `#4C8BF5` with the builder icon: **Bet: Line/Place/Lay/Odds**, **Bet: Props/Hardways/Hops**, **Compile Strategy**.
- Utility nodes use gray `#64748B` with the utility icon: **Bet Variable**, **Clear Bets**.
- Execution nodes use purple `#6A4CCF` with the execution icon: **Run: Engine API Simulation**, **Run: Batch Simulation**, **Run: Export to CrapsSim (Legacy)**.

## Betting field order
Betting nodes present fields in this order: bet key selector, amount, units, number (when applicable), extra flags (e.g., odds working), optional note.

## Help content
Each node help uses a four-part structure (What/Inputs/Outputs/Errors) and documents message overrides such as `msg.strategy_config`, `msg.vars`, parity mode, and batch seeds.

## Implementation Status
Phase 6 (P6-B/P6-C) is implemented in the current codebase. Icons remain `icons/builder-node.svg`, `icons/utility-node.svg`, and `icons/execution-node.svg`; no deviations from the design were needed.
