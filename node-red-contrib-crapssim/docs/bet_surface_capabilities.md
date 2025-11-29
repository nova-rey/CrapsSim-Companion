# Bet Surface & Capabilities

## Overview
This Node-RED pack uses a curated, supported-only bet surface so that every bet exposed in the UI maps directly to a CrapsSim engine verb. If a bet key is not listed here, it is not currently supported by this pack.

## Supported Bet Types
The following tables are generated from the current `bet_surface.json` catalog and reflect the exact bets that can be emitted by the nodes. Any numbered bet carries the point shown in the key/label and must use that same number when sent to the engine.

### Line & Field Bets
| Key | Label | Family | Engine verb | Notes |
| --- | --- | --- | --- | --- |
| pass_line | Pass Line | line | pass_line |  |
| dont_pass | Don't Pass | line | dont_pass |  |
| come | Come | line | come |  |
| dont_come | Don't Come | line | dont_come |  |
| field | Field | field | field |  |

### Odds Bets
| Key | Label | Family | Engine verb | Notes |
| --- | --- | --- | --- | --- |
| odds_pass_line | Pass Odds | odds | odds | Base pass_line; no point required |
| odds_dont_pass | Don't Pass Odds | odds | odds | Base dont_pass; no point required |
| odds_come | Come Odds | odds | odds | Base come; requires point number |
| odds_dont_come | Don't Come Odds | odds | odds | Base dont_come; requires point number |

### Place Bets
| Key | Label | Family | Engine verb | Notes |
| --- | --- | --- | --- | --- |
| place_4 | Place 4 | place | place | Requires number 4 |
| place_5 | Place 5 | place | place | Requires number 5 |
| place_6 | Place 6 | place | place | Requires number 6 |
| place_8 | Place 8 | place | place | Requires number 8 |
| place_9 | Place 9 | place | place | Requires number 9 |
| place_10 | Place 10 | place | place | Requires number 10 |

### Lay Bets
| Key | Label | Family | Engine verb | Notes |
| --- | --- | --- | --- | --- |
| lay_4 | Lay 4 | lay | lay | Requires number 4 |
| lay_5 | Lay 5 | lay | lay | Requires number 5 |
| lay_6 | Lay 6 | lay | lay | Requires number 6 |
| lay_8 | Lay 8 | lay | lay | Requires number 8 |
| lay_9 | Lay 9 | lay | lay | Requires number 9 |
| lay_10 | Lay 10 | lay | lay | Requires number 10 |

### Hardway Bets
| Key | Label | Family | Engine verb | Notes |
| --- | --- | --- | --- | --- |
| hardway_4 | Hardway 4 | hardway | hardway | Requires number 4 |
| hardway_6 | Hardway 6 | hardway | hardway | Requires number 6 |
| hardway_8 | Hardway 8 | hardway | hardway | Requires number 8 |
| hardway_10 | Hardway 10 | hardway | hardway | Requires number 10 |

## Relationship to CrapsSim Engine API
Each `engine_verb` above maps directly to the CrapsSim HTTP API. The node pack does not expose placeholder or unsupported bets: every bet configured in the UI resolves to one of the verbs shown in the catalog and is forwarded to the engine with the required arguments.

## Adding New Bets (Developers)
When adding new bet types:
1. Add the bet definition to `bet_surface.json` with the canonical key, family, engine verb, label, UI group, and argument schema.
2. Ensure the Node-RED UIs emit only catalog keys; update node dropdowns or logic as needed.
3. Update the exporter/API mapping to recognize the new key and forward it to CrapsSim.
4. Keep the documentation and tests in sync with the catalog so unsupported bets do not leak into the UI.
