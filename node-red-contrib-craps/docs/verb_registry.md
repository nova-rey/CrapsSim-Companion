# Verb Registry

The verb registry (`lib/verb_registry.json`) defines every action verb the node pack understands. `lib/verb_registry.js` loads the registry, validates its schema, and enforces argument requirements when actions are compiled, exported, or executed.

## Entry fields

Each entry must include:
- `verb`: Canonical identifier used in `strategy_config.actions[]`.
- `family`: Grouping used for normalization (line, place, odds, management, feature, etc.).
- `engine_verb`: The verb sent to the Engine API.
- `label`: Human-readable name for UI/debug contexts.
- `args_schema`: Validation contract:
  - `required`: Array of argument names that must appear.
  - `optional`: Array of arguments allowed but not required.
  - `types`: Map of argument name → expected type (`number`, `integer`, `string`, `boolean`, `object`).
  - `constraints`: Optional map of argument name → `{ min, max, allowed }` rules applied after type checks.
- `vanilla_mapping` (optional): Mapping for the vanilla exporter with `class` (Python class name) and `arg_order` (array of argument names in constructor order). Omit or set to `null` when a verb has no vanilla equivalent.

## Examples

Place bet:
```json
{
  "verb": "place",
  "family": "place",
  "engine_verb": "place",
  "label": "Place",
  "args_schema": {
    "required": ["amount", "number"],
    "optional": ["working"],
    "types": { "amount": "number", "number": "integer", "working": "boolean" },
    "constraints": { "amount": { "min": 0.01 }, "number": { "allowed": [4,5,6,8,9,10] } }
  },
  "vanilla_mapping": { "class": "BetPlace", "arg_order": ["amount", "number", "working"] }
}
```

Management verb:
```json
{
  "verb": "remove_bet",
  "family": "management",
  "engine_verb": "remove_bet",
  "label": "Remove Bet",
  "args_schema": {
    "required": ["bet_id"],
    "optional": [],
    "types": { "bet_id": "string" },
    "constraints": {}
  },
  "vanilla_mapping": null
}
```

## Adding a new verb
1. Add the entry to `lib/verb_registry.json` with the required fields and argument schema.
2. Provide a vanilla mapping (`vanilla_mapping`) when the verb should be exported to Python; leave it null for Engine-only verbs.
3. Update any vanilla mapping helpers or action mappers if a new family needs special handling.
4. Add tests that cover the new verb in both action validation and any exporter/runner paths that use it.
