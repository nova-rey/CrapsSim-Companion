# API Runner & Parity Mode

The **Run: Engine API Simulation** node executes a compiled `strategy_config` against the CrapsSim Engine HTTP API. Phase 5 adds parity mode for deterministic dice scripts alongside the normal random-roll behavior.

## Normal mode recap
1. Input: `msg.strategy_config` (from Strategy Compiler). Optional overrides: `msg.rolls`/`msg.runs`, `msg.seed`, `msg.profile_id`, `msg.api_config`. When `strategy_config.actions[]` exists, the runner uses it directly and skips `bets[]`.
2. Calls: `/session/start` (with seed + profile) → `/session/apply_action` (one per action) → `/session/roll` (for the configured roll count) → `/end_session`.
3. Output fields:
   - `msg.sim_result`: `{ strategy_name, seed, profile_id, rolls, bankroll_start, bankroll_end, net, ev_per_roll, errors, end_summary }`
   - `msg.sim_journal`: roll-by-roll responses.
   - `msg.payload`: defaults to `sim_result`.
   - When **Prepare File Output** is enabled: `msg.file_output` (NDJSON journal) and `msg.filename` (auto-generated when missing).

## Parity mode (scripted dice)
- **Activate with:**
  - `msg.roll_mode = "script"`, **or**
  - `msg.parity_mode = true` (alias for script mode).
- **Provide:** `msg.dice_script` as an array of `[d1, d2]` pairs (integers 1–6) in roll order.
- **Behavior:**
  - One entry per roll is sent to `/session/roll` as `dice`.
  - Script length must be at least the requested roll count; exhaustion raises a roll-stage error and aborts the run.
  - Invalid entries (non-array, wrong length, or values outside 1–6) fail during preflight with a clear error.
  - Extra script entries are ignored after the last roll (warning only).
  - Seeds still flow to `/session/start`, but dice outcomes come from the script instead of RNG.

### Example
```json
{
  "strategy_config": {
    "strategy_name": "ParityDemo",
    "actions": [ { "verb": "pass_line", "args": { "amount": 10 }, "meta": { "unit_type": "units" } } ],
    "bets": [ { "key": "pass_line", "base_amount": 10, "unit_type": "units" } ]
  },
  "roll_mode": "script",
  "dice_script": [ [3,4], [2,2], [6,1] ],
  "rolls": 3
}
```
This run sends `[3,4]`, `[2,2]`, and `[6,1]` to `/session/roll` in order. If only two entries were provided, roll 3 would raise a script exhaustion error.

## Troubleshooting
- **"dice_script must be an array" / "Invalid dice_script entry"**: Ensure the script is an array of two-integer arrays with values 1–6.
- **"dice_script exhausted at roll N"**: Provide at least as many entries as requested rolls.
- **Unexpected API errors**: Parity mode still forwards `seed` and other config; engine-level bet validation errors surface in `sim_result.errors` when strict mode is off.
