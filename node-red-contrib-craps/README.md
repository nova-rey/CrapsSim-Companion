Node-RED Contrib Craps (Vanilla)

A collection of custom Node-RED nodes for designing, validating, and exporting Craps betting strategies.

These nodes let you build strategies visually as a “recipe flow,” validate them, and export them as vanilla CrapsSim-compatible Python strategy files.

No coding required—just drag, drop, and connect blocks.

📚 Bet Surface Catalog

The pack now ships with a canonical bet catalog (`bet_surface.json`) that all bet nodes share. Each bet emits a canonical key that maps to CrapsSim’s engine identifiers. Phase 1 supports line bets (pass_line, dont_pass, come, dont_come), field, place and lay numbers (4/5/6/8/9/10), and hardways (4/6/8/10). Odds and non-hardway prop bets are listed in the catalog for UI parity but are marked unsupported and will warn during validation/export.

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
