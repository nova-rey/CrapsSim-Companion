# Phase 5 (P5-C) – Odds, Parity Mode, and Batch Runner

This document captures the expected behavior for Phase 5 features (odds bets, parity/scripted dice, and batch execution) as implemented in the Node-RED pack. Code, docs, and tests should remain aligned with this contract.

## Odds Support (v1)
- **Catalog keys:** `odds_pass_line`, `odds_dont_pass`, `odds_come`, `odds_dont_come`.
- **Family:** `odds` (bet_surface.json) maps to engine verb `odds`.
- **Base mapping:**
  - `odds_pass_line` → base `pass_line` (no point required)
  - `odds_dont_pass` → base `dont_pass` (no point required)
  - `odds_come` → base `come` (point number required)
  - `odds_dont_come` → base `dont_come` (point number required)
- **Number handling:**
  - Pass/Don't Pass odds: no `number` is sent.
  - Come/Don't Come odds: `number` must be 4/5/6/8/9/10 and is sent as the odds point.
- **Working flag:** `working` (boolean) is forwarded when provided.
- **Vanilla export:** Odds are not supported; vanilla mapping must throw a clear error when odds are requested.

## Parity Mode (Scripted Dice)
- **Activation:** `msg.roll_mode = "script"` or `msg.parity_mode = true`.
- **Input:** `msg.dice_script` as an array of `[d1, d2]` pairs, each integer 1–6.
- **Validation:**
  - Non-array or malformed entries cause a preflight error.
  - Values outside 1–6 cause a preflight error.
  - Script shorter than requested rolls causes a roll-stage error identifying the exhaustion point.
- **Execution:**
  - One entry per roll is sent to `/session/roll` as `dice` in order.
  - Remaining entries after the last roll are ignored (warning only).
  - Seed still flows to `/session/start`, but dice come from the script instead of RNG.

## Batch Runner
- **Inputs:** Requires `msg.strategy_config`. Seeds come from `msg.seeds` (array) or `seed_start` + `seed_count` when the array is empty. `msg.rolls` overrides node default for rolls-per-run.
- **Per-run execution:** For each seed, calls the same strategy runner used by the single-run API Runner with the chosen roll/parity settings.
- **Outputs:**
  - `msg.batch_result`: array of per-run summaries `{ seed, bankroll_start, bankroll_end, net, rolls, ev_per_roll, errors }`.
  - `msg.batch_summary`: aggregate `{ runs, mean_net, stddev_net, min_net, max_net, winning_run_fraction, bankroll_start, rolls_per_run }` and set as `msg.payload`.
- **Error handling:**
  - Missing seeds configuration → config-stage fatal error with `batch_error` populated.
  - First fatal run error stops the batch and records `batch_error` with `seed` and `stage`.
- **Non-batch behavior:** Single-run API Runner behavior is unchanged; batch runner is an additive entry point.

