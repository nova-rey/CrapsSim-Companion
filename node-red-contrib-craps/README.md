Node-RED Contrib Craps (Vanilla + Engine API)

A collection of custom Node-RED nodes for designing, validating, and exporting Craps betting strategies.

These nodes let you build strategies visually as a “recipe flow,” validate them, and export them as vanilla CrapsSim-compatible Python strategy files.

No coding required—just drag, drop, and connect blocks.

This node pack exposes a supported-only bet surface aligned with the CrapsSim Engine API. For the full list of supported bets and their mappings, see [docs/bet_surface_capabilities.md](./docs/bet_surface_capabilities.md).

## Bet Surface Overview (Phase 1)

- `bet_surface.json` at the repo root is the single source of truth for every bet identifier used by the pack. Each entry includes a canonical key, the engine code it maps to, and is currently supported for export.
- Bet nodes (`bet-type`, `bet-prop`, `bet-in`, `clear`) emit canonical keys such as `pass_line`, `place_6`, or `hardway_8`. Exporters and validators use those keys to align with CrapsSim’s bet classes.
- Supported today: Pass/Don’t Pass, Come/Don’t Come, Field, numbered Place/Lay (4/5/6/8/9/10), and Hardways (4/6/8/10).

### Supported Bets (Phase 1)

| Family  | Canonical keys (supported) |
|---------|---------------------------|
| Line    | `pass_line`, `dont_pass`, `come`, `dont_come` |
| Field   | `field` |
| Place   | `place_4`, `place_5`, `place_6`, `place_8`, `place_9`, `place_10` |
| Lay     | `lay_4`, `lay_5`, `lay_6`, `lay_8`, `lay_9`, `lay_10` |
| Hardway | `hardway_4`, `hardway_6`, `hardway_8`, `hardway_10` |

### Adding or Deprecating Bet Types

1. Add or edit entries in `bet_surface.json`, setting `supported` to `true` when the CrapsSim engine/API can accept the bet and `false` when the UI should show it but exporters must ignore it.
2. Update exporters/validators as needed in future phases to map new bets to CrapsSim classes.
3. Keep this README and example flows in sync with the catalog so users can see what is available at a glance.

### Version Compatibility

Phase 1 targets the current CrapsSim vanilla/API bet surface that exposes `BetPassLine`, `BetDontPass`, `BetCome`, `BetDontCome`, `BetPlace`, `BetLay`, `BetField`, and `BetHardway`. If CrapsSim adds or removes bet types, update `bet_surface.json`, the supported list above, and any related exporters/validators to stay aligned.

### Example Flows

- `examples/simple_line_and_place_flow.json`: Pass Line plus Place 6/8 using canonical keys with both the legacy recipe.debug path and the strategy compiler + exporter path for parity checks.
- `examples/hardway_example_flow.json`: Hardway 6 and Hardway 8 via `bet-prop`.
- `examples/strategy_simple_line_place.json`: Minimal Pass Line + Place 6/8 feeding strategy-compiler → export-vanilla with debug taps for `msg.strategy_config` and the exported Python.
- `examples/strategy_hardway_demo.json`: Hardway 6/8 demonstrating how `bet-prop` → strategy-compiler → export-vanilla produces hardway bets in `strategy_config`.
- `examples/api_simple_line_place.json`: Simple Engine API run for Pass Line + Place 6/8 with debug taps for `sim_result` and `sim_journal`.
- `examples/api_with_file_output.json`: Engine API run with file-ready NDJSON journal wired into the standard Node-RED File node.

## What is `strategy_config`?

`strategy_config` is the normalized object the node pack builds from your graph. Bet nodes emit canonical bet steps (with amounts and unit types), table nodes provide limits/multipliers, and the **Strategy Compiler** assembles everything into a single object that exporters and runners can consume.

You usually do not edit `strategy_config` by hand; it is produced automatically. A typical object looks like:

```json
{
  "strategy_name": "MyStrategy",
  "table": { "mode": "10", "multiplier": 10, "bubble": false },
  "bets": [
    { "key": "pass_line", "base_amount": 10, "unit_type": "units" },
    { "key": "place_6", "base_amount": 12, "unit_type": "dollars", "number": 6 }
  ],
  "metadata": { "created_by": "node-red-contrib-craps", "version": "1.3.0", "notes": "optional" }
}
```

Exporters and runners read `strategy_config` to build CrapsSim components. Amounts expressed in `units` are scaled using the table multiplier; amounts in `dollars` are passed through directly.

## Strategy Compiler node

- **Inputs:** Expects `msg.recipe.steps` (emitted by bet nodes), plus optional `msg.varTable` and metadata (e.g., `msg.strategy_name`, `msg.strategy_notes`).
- **Outputs:** Writes `msg.strategy_config` (and also `msg.payload`) containing the normalized strategy and table info.
- **Usage:** Wire bet nodes → `strategy-compiler` → exporters/runners. You generally don’t need to know the internal schema beyond that; the node handles normalization and validation for you.

## Engine API Runner (Phase 3)

The Engine API Runner executes a compiled `strategy_config` against a running CrapsSim Engine HTTP API (e.g., `uvicorn crapssim_api.http:app`). It complements the vanilla exporter path—you can still export local Python files, or you can hit the HTTP API for immediate simulation feedback.

Typical flow: `bet` nodes → **Strategy Compiler** → **API Runner** → Debug/File.

### craps-api-config (config node)

Holds shared Engine API defaults so individual flows don’t have to repeat them:

- **base_url**: API host, e.g., `http://127.0.0.1:8000`.
- **profile_id**: Profile to send to `/session/start` (default: `default`).
- **default_seed_mode**: `fixed`, `random`, or `from_msg`.
- **seed**: Used when `default_seed_mode` is `fixed`.
- **timeout_ms**: Per-request timeout.
- **retries/retry_backoff_ms**: Exposed for future use; currently plumbed through the config object.
- **auth_token**: Optional bearer token for protected deployments.

Override behavior: `msg.api_config` can override most fields, and `msg.profile_id`/`msg.seed` take precedence when provided. With `default_seed_mode: from_msg`, the runner pulls seeds from `msg.seed` (falling back to a timestamp when missing).

### api-runner node

- **Inputs:** Requires `msg.strategy_config` from the Strategy Compiler. Optional overrides: `msg.seed`, `msg.rolls`/`msg.runs`, `msg.profile_id`, `msg.api_config`.
- **Calls:** `/session/start` → `/session/apply_action` (for each bet) → `/session/roll` (for configured roll count) → `/end_session`.
- **Outputs:**
  - `msg.sim_result`: Summary with `strategy_name`, `seed`, `profile_id`, `rolls`, bankroll start/end, `net`, `ev_per_roll`, and aggregated `errors`.
  - `msg.sim_journal`: Roll-by-roll responses from the Engine API.
  - `msg.payload`: Defaults to `sim_result` for dashboards.
  - When **Prepare File Output** is enabled: `msg.file_output` (NDJSON string) and `msg.filename` (auto-generated when not provided) for downstream File nodes.
- **Config options:**
  - **rolls**: Default roll count when `msg.rolls`/`msg.runs` is absent.
  - **strict_mode**: When true, aborts on the first non-empty API `errors` array; when false, aggregates errors but keeps running.
  - **prepare_file_output**: Prepares NDJSON journal and filename, but leaves actual disk I/O to a File node.

### API Runner walkthrough

1. Start the Engine API locally: `uvicorn crapssim_api.http:app --reload` (or your deployment of choice).
2. Import `examples/api_simple_line_place.json` into Node-RED.
3. Open the `craps-api-config` node in the flow and confirm `base_url` matches your running API.
4. Press the Inject node to trigger the flow.
5. Watch `sim_result` in the debug sidebar. If you also import `examples/api_with_file_output.json`, the journal arrives in `msg.file_output` and is written by the File node (path set in the example).

📦 Nodes
🎲 Bet Construction

bet-type

Defines line/field/place/lay/hardway bets with fixed or fed amounts.

Outputs a bet object for the recipe.

bet-prop

For proposition bets (hardways, horn, etc.) that CrapsSim supports.

bet-in

Accepts amounts from upstream value nodes (val-int, type-units, type-dollars) and passes them to bet-type/bet-prop.

clear

Removes specified bets (or all bets) at that point in the flow.

🔢 Value Blocks

val-int

A simple integer value node.

Can be set to participate in validation/evolution (in future forks).

type-units

Treats values as “units” (table minimum multiples).

Useful for quickly scaling strategies by table denomination.

type-dollars

Treats values as literal dollars.

📑 Phase Markers

Used to structure the recipe into “chapters,” mirroring real Craps gameplay.
They don’t affect rolls directly but control when bets are considered active.

comeout-marker

Marks the start/end of the Come-Out phase.

maingame-marker

Marks the start/end of the Point-On phase (main loop).

endgame-marker

Marks the cleanup/stop phase.

roll-marker

A visual indicator for where rolls conceptually occur.

Ignored in vanilla export (CrapsSim handles rolling internally).

✅ Validation

validator-recipe

Checks that the flow forms a syntactically valid recipe (generic).

validator-vanilla

Ensures all bets and amounts can be mapped to real CrapsSim classes.

Warns or errors if unsupported bet types are used.

📤 Export

export-vanilla

Converts the recipe into a runnable Python module using CrapsSim’s strategy API (AggregateStrategy, BetDontPass, BetPlace, BetField, etc.).

ℹ️ The exporter now prefers <code>msg.strategy_config</code> (assembled by the <b>strategy-compiler</b> node) as its primary input, but will fall back to <code>msg.recipe.steps</code> for legacy flows. Wiring is unchanged: feed your bet nodes into the compiler, then into the exporter.

Exports to a .py file via the File node.

Harness block at the bottom lets you run the strategy immediately with CrapsSim’s Table.

⚙️ Simulation Variables

Nodes that set parameters for the exported harness. They write into msg.sim and are read by export-vanilla.

var-bankroll

Sets starting bankroll (default: 300).

var-max-rolls

Sets maximum rolls. Options:

infinite → no limit (float("inf"))

fixed → user-specified number

var-seed

Sets RNG seed. Options:

none → leave seed unset (engine picks; fresh randomness each run)

fixed → explicit seed (number or string, repeatable runs)

random → a new random seed baked into each exported file

🔧 Typical Flow
