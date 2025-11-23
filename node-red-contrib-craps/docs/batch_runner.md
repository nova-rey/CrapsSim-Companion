# Batch Runner

The Batch Runner executes a compiled `strategy_config` across multiple seeds using the CrapsSim Engine HTTP API and aggregates the results.

## Inputs
- `msg.strategy_config` (required) from the Strategy Compiler.
- Seed configuration (choose one):
  - `msg.seeds = [seed1, seed2, ...]`, or
  - `msg.seed_start` + `msg.seed_count` (contiguous range) when `msg.seeds` is empty.
- Rolls per run: `msg.rolls` overrides the node’s **Rolls per run** field.
- Parity: `msg.roll_mode = "script"` or `msg.parity_mode = true` plus `msg.dice_script` to share a deterministic dice script across runs.

## Outputs
- `msg.batch_result`: array of per-run summaries. Example:
```json
[
  { "seed": 100, "bankroll_start": 300, "bankroll_end": 320, "net": 20, "rolls": 50, "ev_per_roll": 0.4, "errors": [] },
  { "seed": 101, "bankroll_start": 300, "bankroll_end": 280, "net": -20, "rolls": 50, "ev_per_roll": -0.4, "errors": [] }
]
```
- `msg.batch_summary`: aggregate stats (also set as `msg.payload`). Example:
```json
{
  "runs": 2,
  "mean_net": 0,
  "stddev_net": 20,
  "min_net": -20,
  "max_net": 20,
  "winning_run_fraction": 0.5,
  "bankroll_start": 300,
  "rolls_per_run": 50
}
```

## Flow example
Bet nodes → **Strategy Compiler** → **Batch Runner** → Debug/File nodes. The batch node leaves file creation to downstream nodes if you wish to persist `batch_result`.

## Error behavior
- Missing seeds configuration raises a config-stage fatal error and sets `msg.batch_error`.
- The batch stops on the first fatal run error, populating `msg.batch_error` with the failing `seed` and `stage`.
- The single-run API Runner path is unchanged; the batch node is an additive entry point for multi-seed evaluation.
