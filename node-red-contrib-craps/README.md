Node-RED Contrib Craps (Vanilla)

A collection of custom Node-RED nodes for designing, validating, and exporting Craps betting strategies.

These nodes let you build strategies visually as a “recipe flow,” validate them, and export them as vanilla CrapsSim-compatible Python strategy files.

No coding required—just drag, drop, and connect blocks.

## Bet Surface Overview (Phase 1)

- `bet_surface.json` at the repo root is the single source of truth for every bet identifier used by the pack. Each entry includes a canonical key, the engine code it maps to, and whether it is currently supported for export.
- Bet nodes (`bet-type`, `bet-prop`, `bet-in`, `clear`) emit canonical keys such as `pass_line`, `place_6`, or `hardway_8`. Exporters and validators use those keys to align with CrapsSim’s bet classes.
- Supported today: Pass/Don’t Pass, Come/Don’t Come, Field, numbered Place/Lay (4/5/6/8/9/10), and Hardways (4/6/8/10).
- Odds and non-hardway prop bets stay visible in the UI for parity but are marked `supported: false` and will emit warnings until the CrapsSim engine/API exposes matching bet types.

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

- `examples/simple_line_and_place_flow.json`: Pass Line plus Place 6/8 using canonical keys.
- `examples/hardway_example_flow.json`: Hardway 6 and Hardway 8 via `bet-prop`.

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
