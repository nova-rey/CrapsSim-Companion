# Phase 4 Bet Surface Design (P4-A/P4-B sync)

The bet surface catalog is the single source of truth for bets supported by the Node-RED craps pack. The JSON is now supported-only: every entry maps directly to a CrapsSim engine verb and must be wired through both the vanilla exporter and the API runner via the shared bet mapping helper.

## Catalog shape

Each bet entry follows this schema:

```json
{
  "key": "place_6",
  "family": "place",
  "engine_verb": "place",
  "label": "Place 6",
  "ui_group": "main",
  "number": 6,
  "requires_number": [6],
  "args_schema": {
    "required": ["amount", "number"],
    "optional": []
  }
}
```

Only Pass/Don't Pass, Come/Don't Come, Field, Place/Lay on 4/5/6/8/9/10, and Hardways on 4/6/8/10 are present in this checkpoint. Odds and loose prop placeholders were removed until they can be wired end-to-end.

## Mapping helper

`lib/bet_mapping.js` converts `strategy_config.bets[]` entries into either (and remains available for Phase 7 legacy fallbacks when `actions[]` is absent):

- `{ verb, args }` payloads for the CrapsSim Engine API, or
- `{ className, args, dollars }` specs for the vanilla exporter.

Both paths validate required numbers, unit types, and amounts up front and surface errors instead of silently skipping invalid bets.

## Adding bets

New bet types must be added to `bet_surface.json` first, with a concrete engine verb and validation metadata, before any UI exposure or exporter changes.
