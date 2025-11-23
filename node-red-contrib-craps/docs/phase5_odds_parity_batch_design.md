# Phase 5 Design: Odds, Parity Mode, and Batch Runner (P5-A)

## Overview
Phase 5 adds three capabilities to the Node-RED craps pack without changing runtime behavior in this checkpoint:
- **Odds v1**: Add line/come odds support wired to the Engine HTTP `odds` verb.
- **Parity Mode**: Deterministic dice-script execution for the API Runner.
- **Batch Runner**: Multi-seed / multi-run orchestration that aggregates results.

This document extends the Phase 4 bet surface and mapping model while staying consistent with the existing catalog and helper conventions. Implementation occurs in later checkpoints.

## Current State (Phase 4 Baseline)
- **Bet surface**: `bet_surface.json` includes line (pass/don't, come/don't), field, place/lay on 4/5/6/8/9/10, and hardways on 4/6/8/10. Odds were intentionally excluded in P4.【F:bet_surface.json†L1-L104】
- **Mapping helper**: `lib/bet_mapping.js` validates amounts, resolves numbers, legalizes by bet type, and maps to engine verbs or vanilla specs; unsupported keys throw `UnknownBetError`. Amounts are normalized from `strategy_config.bets[]` (`base_amount`, `unit_type`, optional `number`).【F:lib/bet_mapping.js†L1-L114】【F:lib/bet_mapping.js†L115-L214】
- **Bet surface loader**: `lib/bet_surface.js` enforces allowed families (`line`, `place`, `lay`, `field`, `hardway`) and allowed numbers (4,5,6,8,9,10).【F:lib/bet_surface.js†L1-L92】
- **Strategy compiler**: `lib/strategy_compiler.js` turns recipe steps into `strategy_config` with normalized bet entries `{ key, base_amount, unit_type, number?, bet_id?, note? }`, validating required numbers and unit types.【F:lib/strategy_compiler.js†L1-L98】
- **API Runner**: `api-runner.js` orchestrates `/session/start`, `/session/apply_action` per bet, `/session/roll` loop, and `/end_session`, producing `msg.sim_result` and `msg.sim_journal`. Seeds are resolved via config/msg and passed at start; rolls are RNG-driven today.【F:api-runner/api-runner.js†L10-L157】【F:api-runner/api-runner.js†L158-L239】

## Odds v1 Design
### Catalog Representation
- **Option decision**: Use **Option A (per-base keys)** to align with existing key-driven family handling and avoid per-entry base parsing ambiguity.
  - New keys: `odds_pass_line`, `odds_dont_pass`, `odds_come`, `odds_dont_come`.
  - Each entry fields:
    - `key`: as above.
    - `family`: `"odds"` (new family; add to allowed families).
    - `engine_verb`: `"odds"`.
    - `label`: "Pass Odds", "Don't Pass Odds", "Come Odds", "Don't Come Odds".
    - `ui_group`: `"main"` (same grouping as base line bets).
    - `requires_number`: 
      - `false` for pass/don't pass odds (point inferred by engine).
      - `true` for come/don't come odds (number required because odds target a specific come point).
    - `number`: optional default for catalog normalization (likely omit for come odds to force explicit number).
    - `args_schema`: `{ required: ["amount"], optional: ["number", "working"] }` so `working` can be forwarded when offered by UI.
- **Base derivation**: derive `base` from the key prefix (`odds_pass_line` → `pass_line`, etc.) inside the mapping helper rather than storing a base field in catalog entries.

### Strategy Config Shape for Odds
- `strategy_config.bets[]` entries for odds must include:
  - `key`: one of the four odds keys.
  - `base_amount`: numeric > 0.
  - `unit_type`: `"units"` or `"dollars"`.
  - `number`: required for `odds_come` / `odds_dont_come` (must be 4/5/6/8/9/10); ignored/optional for `odds_pass_line` / `odds_dont_pass` (point inferred from table state).
  - Optional `working` flag may be allowed for future on/off behavior; if omitted, runner will default to engine behavior.

### Node-Level UX (Conceptual)
- Odds appear as additional options in the existing bet-type UI (no dedicated node needed), e.g., dropdown entries “Pass Odds”, “Don’t Pass Odds”, “Come Odds”, “Don’t Come Odds”.
- Node fields:
  - Amount + unit type (existing pattern).
  - Number selector required for come/don’t come odds; hidden/disabled for pass/don’t pass odds.
  - Optional “working on come-out” toggle to populate `working` argument.
- Node emits canonical odds keys matching catalog entries; no free-form base selection in the message payload.

### Mapping Helper Behavior
- Accept odds bet definitions and map to CrapsSim Engine payload:
  - Derive `base` by stripping the `odds_` prefix: `odds_pass_line`→`pass_line`, `odds_dont_pass`→`dont_pass`, `odds_come`→`come`, `odds_dont_come`→`dont_come`.
  - Build `{ verb: "odds", args: { amount, base, number?, working? } }`.
    - `amount`: normalized + legalized like other bets.
    - `number`: required for come/don’t come odds; omitted for pass/don’t pass odds.
    - `working`: include if provided (boolean) without coercing default.
- Validation/error cases:
  - Unknown odds key → `UnknownBetError` (consistent with current behavior).
  - Missing/invalid `base_amount` or `unit_type` → error.
  - Missing required `number` for come/don’t come odds or invalid number → error.
  - Amount ≤ 0 after legalization → error.

## Parity Mode (Deterministic Dice Script) Design
### Input Shape
- Use message-based activation to avoid UI-breaking changes:
  - `msg.dice_script`: array of `[d1, d2]` pairs (integers 1–6).
  - `msg.roll_mode` (string): `"script"` to enable parity mode; default/absent → `"random"` (current behavior). Accept `msg.parity_mode = true` as an alias for `roll_mode === "script"` for flexibility.

### Runner Behavior
- When parity mode is active:
  - For each roll index `i`, if `dice_script[i]` exists and is valid, call `POST /session/roll` with payload `{ session_id, dice: [d1, d2] }`.
  - If `dice_script` is shorter than requested rolls → stop execution and surface an error (`msg.api_error` with stage `"roll"`, message `"dice_script exhausted at roll N"`, and mark fatal to halt the node).
  - If `dice_script` contains invalid entries (non-array, non-integers, out of range) → raise a clear error before starting rolls.
  - If `dice_script` is longer than needed → ignore extra entries; optionally log a warning but do not error.
- In non-parity mode → existing RNG-driven roll loop unchanged.
- Optional (future) recording: reserve `msg.dice_script_out` for later phases to emit the realized dice sequence when RNG is used; out-of-scope for P5 implementation.

### Seed Interaction
- In parity mode, `seed` is treated as metadata only (passed to `/session/start` for traceability) but does not affect dice outcomes.
- In random mode, seeding remains as implemented in P4 (`resolveSeed` logic untouched).

### Error Semantics
- Invalid dice entry or exhausted script results in a deterministic failure with `msg.api_error` populated and an error thrown to stop the flow (consistent with existing fatal error handling for HTTP failures).

## Batch Runner Design
### Node vs Mode Decision
- Introduce a **separate “Batch Runner” node** that wraps the existing API Runner logic. Rationale:
  - Keeps single-run API Runner behavior stable and backward-compatible.
  - Simplifies configuration: batch-specific inputs (seed lists, aggregation options) do not clutter the standard runner UI.
  - Enables internal reuse of `runSimulation` for each run.

### Inputs
- Base input: `msg.strategy_config` (same schema as single run).
- Seed configuration (precedence: explicit list > generated > node defaults):
  - `msg.seeds`: explicit array of integers.
  - Else `msg.seed_start` (int) + `msg.seed_count` (int) to generate sequential seeds `[seed_start, seed_start + seed_count - 1]`.
  - Node config may provide default `seed_start`/`seed_count` when message lacks them.
- Rolls per run: `msg.rolls` overrides node config default; if absent, fall back to API Runner default behavior.
- Optional strictness/HTTP config inherits from API Runner config unless overridden per message.

### Per-Run Outputs
- For each seed/run, capture a summary (using API Runner outputs):
```json
{
  "seed": 12345,
  "bankroll_start": 1000,
  "bankroll_end": 1125,
  "net": 125,
  "rolls": 200,
  "ev_per_roll": 0.625,
  "pso_count": <optional if available>,
  "errors": []
}
```
- Summary can be derived from `sim_result` plus additional counters if exposed by engine responses.

### Aggregated Batch Summary
- Produce both:
  - `msg.batch_result`: array of per-run summaries (in order of execution).
  - `msg.batch_summary`: aggregate metrics across runs, including:
    - `runs` (count), `rolls_per_run` (input), `bankroll_start` (from first run if consistent).
    - `mean_net`, `stddev_net`, `min_net`, `max_net`.
    - `winning_run_fraction` (`runs with net > 0` / total runs).
  - Default `msg.payload` should be `msg.batch_summary` for convenience; retain `batch_result` for detailed analysis.

### Error Handling
- Policy for v1: **stop on first fatal HTTP/engine error**, surface `msg.batch_error` with failing seed and stage, and do not continue remaining runs. Non-fatal per-roll errors captured inside a run should mirror API Runner strictness behavior.
- If a single run fails during `/session/start` or `/apply_action`, the batch aborts and records which seed failed. Successes before the failure remain in `batch_result` for inspection.

## Documentation Plan (for P5-C)
- **Odds Support**: Add a new section to bet surface docs listing odds keys, required fields, and limits (line/come/don’t only; no exotic odds). Include node UI examples for odds amount/working/number fields.
- **Parity Mode**: Document `msg.dice_script` format, activation via `msg.roll_mode = "script"` (or `msg.parity_mode`), seed interaction, and common errors (short script, invalid dice).
- **Batch Runner**: Provide an example flow (Strategy Compiler → Batch Runner → Debug/file writer), explain seed inputs vs defaults, and show sample `batch_result` and `batch_summary` payloads.
- Clarify out-of-scope items for P5 (e.g., dice recording in RNG mode, exotic odds, UI redesigns).

## Out of Scope for P5-A
- No code, JSON, or UI changes in this checkpoint.
- No engine contract changes; relies on existing `odds` verb shape `{ amount, base, number?, working? }`.
- No additional bet families beyond odds; no prop/exotic odds support.
