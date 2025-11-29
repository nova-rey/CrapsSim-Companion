# Roadmap

## Phase 7 — Engine Action Grammar & Verb Registry

- Introduce a unified action grammar (`{ verb, args, meta }`) for all craps operations.
- Maintain a verb registry in `lib/verb_registry.json` describing allowed verbs and their argument schemas.
- Have the Strategy Compiler emit `strategy_config.actions[]` alongside legacy `bets[]`.
- Wire the Engine API Runner and vanilla exporter to use actions when present, falling back to `bets[]` for older flows.
