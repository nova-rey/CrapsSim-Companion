# CrapsSim Bet Surface — Phase 1 Analysis (Design Only)

## Scope and Goals
- Inventory every bet-related Node-RED node and the bet identifiers it emits or consumes.
- Compare node-facing bet types to the CrapsSim vanilla/API surface implied by the exporter and validator.
- Define a proposed `bet_surface.json` schema and validator behavior for Phase 1-B.
- Provide draft documentation text for later publishing (Phase 1-C).

## Inventory of Bet Nodes
| Node | Path | Bet identifiers exposed in UI | Notable configuration / payload behavior |
| --- | --- | --- | --- |
| `bet-type` | `node-red-contrib-craps/bet-type` | Line/field/place/lay and odds dropdown values: `Pass`, `DontPass`, `Come`, `DontCome`, `Field`, `Place`, `Lay`, `PassOdds`, `DontPassOdds`, `ComeOdds`, `DontComeOdds`. | Optional point `number` for place/lay; optional `betId` for keyed feeds; supports `fixed` vs `feed` amount/unit sources (units or dollars) and adds `{ type, amount, unitType, number?, betId?, note? }` into `msg.recipe.steps` as `type: <kind>`. |
| `bet-prop` | `node-red-contrib-craps/bet-prop` | Prop dropdown values: `Hardway`, `Any7`, `AnyCraps`, `Yo11`, `Aces`, `Boxcars`, `AceDeuce`, `Horn`, `HornHigh`, `Hop`, `Prop`. | `Hardway` supports a point `number` (4/6/8/10); other props have no point. Supports `fixed` vs `feed` amounts and emits `{ type: propKind, amount, unitType, number?, betId?, note? }` into `msg.recipe.steps`. |
| `bet-in` | `node-red-contrib-craps/bet-in` | Stores arbitrary `betId` strings as feed keys. | Latches `msg.value` (integer) and `msg.unitType` (`unit` or `dollars`) plus optional `msg.var` into flow context under the given `betId` for later retrieval by bet nodes. |
| `clear` | `node-red-contrib-craps/clear` | Type filter includes `pass`, `dont_pass`, `come`, `dont_come`, `field`, `place`, `lay`, `hardway`, `prop`, `odds`; optional point filter (4/5/6/8/9/10). | Removes items from `msg.bets` matching configured or runtime `clear` filters; supports mode `all` vs `specific` by type/point. |

## Comparison: Nodes vs CrapsSim Vanilla/API Bet Surface
- **Engine/API bet types visible in exporter output**: `BetPassLine`, `BetDontPass`, `BetCome`, `BetDontCome`, `BetPlace`, `BetLay`, `BetField`, `BetHardway`. The exporter ignores unmapped prop kinds (e.g., Any7/Horn/Hop) and only recognizes `Hardway` among prop outputs. Odds attachments from node dropdowns are not emitted as distinct engine bet classes.
- **Validator-known bet types**: accepts `pass`, `dont_pass`, `come`, `dont_come`, `field`, `place`, `lay`, `hardway`, `prop`/`proposition`, and generic `odds`; requires points for `place`, `lay`, `hardway`, `odds` and will warn on unknown types.
- **Discrepancies**
  - `bet-type` exposes odds selections (`PassOdds`, `DontPassOdds`, `ComeOdds`, `DontComeOdds`) that neither the exporter nor validator maps to CrapsSim bet classes (validator only knows generic `odds`).
  - `bet-prop` exposes several one-roll props (`Any7`, `AnyCraps`, `Yo11`, `Aces`, `Boxcars`, `AceDeuce`, `Horn`, `HornHigh`, `Hop`, generic `Prop`) that are ignored by the exporter; only `Hardway` maps to `BetHardway`.
  - CrapsSim engine/API bet surface lacks dedicated nodes for odds attachments and non-Hardway props; future catalog should mark these as unsupported or pending.

### Node → Catalog → Engine/API mapping snapshot
| Node option | Intended catalog key (proposed) | Exporter/validator handling | Engine/API class presence |
| --- | --- | --- | --- |
| `Pass` | `pass_line` | Exported to `BetPassLine`; validator accepts `pass`. | Present. |
| `DontPass` | `dont_pass` | Exported to `BetDontPass`; validator accepts `dont_pass`. | Present. |
| `Come` | `come` | Exported to `BetCome`; validator accepts `come`. | Present. |
| `DontCome` | `dont_come` | Exported to `BetDontCome`; validator accepts `dont_come`. | Present. |
| `Field` | `field` | Exported to `BetField`; validator accepts `field`. | Present. |
| `Place` (numbered) | `place_<point>` | Exported to `BetPlace`; validator accepts `place` with point. | Present. |
| `Lay` (numbered) | `lay_<point>` | Exported to `BetLay`; validator accepts `lay` with point. | Present. |
| `Hardway` (4/6/8/10) | `hardway_<point>` | Exported to `BetHardway`; validator accepts `hardway` with point. | Present. |
| `PassOdds`/`DontPassOdds`/`ComeOdds`/`DontComeOdds` | `odds_<context>` | Not exported; validator treats only generic `odds` with point. | Missing (should be cataloged as unsupported until implemented). |
| `Any7`, `AnyCraps`, `Yo11`, `Aces`, `Boxcars`, `AceDeuce`, `Horn`, `HornHigh`, `Hop`, `Prop` | `prop_<name>` | Exporter ignores; validator only checks `prop`/`proposition` name presence (no engine mapping). | Missing (mark unsupported or future). |

## Proposed `bet_surface.json` Schema (for Phase 1-B implementation)
Each catalog entry should follow:
```json
{
  "key": "pass_line",           // canonical internal ID used by nodes and strategies
  "engine_code": "pass_line",   // CrapsSim API/engine identifier (e.g., BetPassLine → pass_line)
  "friendly_name": "Pass Line", // human label for docs/UI
  "family": "line",             // grouping: line | place | lay | odds | field | prop | hardway | meta
  "number": 4,                   // optional: point required for place/lay/hardway/odds variants
  "min_unit": 5,                 // optional: table minimum in base units (use varTable defaults if omitted)
  "increment": 5,                // optional: step size for rounding/legalization
  "supports_odds": true,         // whether flat bet supports attached odds
  "supported": true,             // false marks deprecated/unimplemented entries
  "notes": "ignored by exporter"// optional maintainer comments
}
```
Validation rules:
- `key`, `engine_code`, `friendly_name`, and `family` are required and non-empty.
- `family` constrained to a known enum (`line`, `place`, `lay`, `field`, `hardway`, `prop`, `odds`, `meta`).
- Bets requiring a point (`family` in `place/lay/hardway/odds`) must include numeric `number` in {4,5,6,8,9,10}.
- `min_unit` and `increment` must be positive integers when present.
- `supported:false` entries remain in the catalog but should trigger warnings when referenced.

## Validator Behavior (to be implemented in Phase 1-B)
- **Unknown bet key in catalog**: hard error during catalog load.
- **Catalog entry missing required fields**: hard error; validation cannot proceed.
- **Node references bet key not in catalog**: validation failure (block deployment/export).
- **Node references catalog entry with `supported:false`**: emit warning; allow export only if running in non-strict mode.
- **Amount/point validation**: reuse existing legalization logic; enforce point presence for families requiring it; warn on non-positive amounts.
- **Odds handling**: until odds are implemented, treat odds-labeled nodes as unsupported and surface a targeted warning.

## Draft Documentation Text (for Phase 1-C)
- **Bet Surface Overview**: Explain that `bet_surface.json` is the single source of truth for all bet identifiers used by Node-RED nodes, the CrapsSim vanilla exporter, and API integrations. Clarify that nodes must emit catalog keys so exporters/validators can map them to CrapsSim bet classes consistently.
- **Relationship to CrapsSim Vanilla/API**: Note that the current vanilla exporter supports `Pass`, `DontPass`, `Come`, `DontCome`, `Field`, numbered `Place`/`Lay`, and `Hardway` bets. Odds and non-hardway props are currently ignored or generic and should be cataloged as unsupported until engine/API support is added.
- **Supported Bets (Phase 1)**: Provide a table derived from the catalog listing canonical keys (e.g., `pass_line`, `dont_pass`, `come`, `field`, `place_6`, `lay_10`, `hardway_8`) and whether they are exported/validated.
- **How to Add or Deprecate Bet Types**: Describe the process: add/update catalog entry with `supported` flag, extend exporter/validator mappings as needed, and document engine/API version compatibility. Deprecation should set `supported:false` and update docs to discourage use.
- **Version Compatibility**: State the CrapsSim version or API branch targeted by the catalog (current vanilla exporter/validator behavior) and remind maintainers to bump the catalog when engine/API bet surfaces change.
