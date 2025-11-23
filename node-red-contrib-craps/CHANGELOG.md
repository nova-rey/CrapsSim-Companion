# Changelog

## 1.2.0
- Added Strategy Compiler node that produces normalized `strategy_config` from bet graphs and table context.
- Refactored vanilla exporter to consume `strategy_config` as the primary input while preserving the legacy recipe.steps path and output format.
- Added example flows showing compiler + exporter integration, including simple line/place and hardway strategies.
- Marked Phase 2 verification and docs updates as complete ahead of the API runner phase.

## 1.1.0
- Introduced canonical bet surface catalog (`bet_surface.json`) shared by all bet nodes.
- Updated bet nodes to emit CrapsSim-aligned canonical keys with validation for unsupported entries.
- Added sanity flows for basic line/place and hardway bets, plus warnings for unsupported odds/prop bets.
- Documented the Phase 1 bet surface, supported bets, and catalog maintenance guidelines.
