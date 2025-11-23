# Phase 4A Bet Surface Catalog & Mapping Design

## Overview
Phase 4A tightens the Node-RED craps pack around the CrapsSim Engine HTTP API bet verbs. The goal is to replace the current loose mix of UI options, catalog entries, and exporter-specific mappings with a single, truthful bet catalog plus a shared mapping helper that both the vanilla exporter and the Engine API runner can use. This document records the current surface, identifies gaps, and proposes the Phase 4 schema and mapping APIs. No runtime or UI changes are made in this checkpoint.

## Current State Inventory

### Node-facing bet options
| Node | Implementation | UI option label/value | Emitted canonical key | Extra fields |
| --- | --- | --- | --- | --- |
| `bet-type` | `bet-type/bet-type.html` | Pass → `Pass`, DontPass → `DontPass`, Come → `Come`, DontCome → `DontCome`, Field → `Field`, Place → `Place`, Lay → `Lay`, PassOdds → `PassOdds`, DontPassOdds → `DontPassOdds`, ComeOdds → `ComeOdds`, DontComeOdds → `DontComeOdds` | `pass_line`, `dont_pass`, `come`, `dont_come`, `field`, `place_${number}`, `lay_${number}`, `odds_pass_line`, `odds_dont_pass`, `odds_come`, `odds_dont_come` (resolved via `resolveCanonical`) | Optional `number`, optional `betId`, `valueSource` (fixed/feed), `amount`, `unitType`, `note` |
| `bet-prop` | `bet-prop/bet-prop.html` | Hardway → `Hardway`, Any7 → `Any7`, AnyCraps → `AnyCraps`, Yo11 → `Yo11`, Aces → `Aces`, Boxcars → `Boxcars`, AceDeuce → `AceDeuce`, Horn → `Horn`, HornHigh → `HornHigh`, Hop → `Hop`, Prop → `Prop` | `hardway_${number}`, `prop_any7`, `prop_any_craps`, `prop_yo11`, `prop_aces`, `prop_boxcars`, `prop_ace_deuce`, `prop_horn`, `prop_horn_high`, `prop_hop_generic`, `prop_other` | Hardway requires `number`; optional `betId`, `valueSource` (fixed/feed), `amount`, `unitType`, `note` |
| `clear` | `clear/clear.html` | Mode: All bets / Specific bets; specific types list: Pass, Don't Pass, Come, Don't Come, Field, Place, Lay, Hardway, Prop, Odds | Not a bet emitter; filters `msg.bets` | Optional selected `types` and `points` |
| `bet-in` | `bet-in/bet-in.html` | Captures Bet ID for latch | Stores amount/unitType in flow context under Bet ID | Required `betId` |

### Catalog definitions (`bet_surface.json`)
| Key | Family | Engine code | Number | Supported flag | Notes |
| --- | --- | --- | --- | --- | --- |
| `pass_line`, `dont_pass`, `come`, `dont_come` | line | same as key | — | true | Line bets, odds supported in UI but odds entries marked unsupported |
| `field` | field | field | — | true | — |
| `place_4/5/6/8/9/10` | place | place | number per key | true | — |
| `lay_4/5/6/8/9/10` | lay | lay | number per key | true | — |
| `hardway_4/6/8/10` | hardway | hardway | number per key | true | — |
| `odds_pass_line`, `odds_dont_pass`, `odds_come`, `odds_dont_come` | odds | pass/dont/come odds engine codes | dynamic | false | Listed for parity only |
| `prop_any7`, `prop_any_craps`, `prop_yo11`, `prop_aces`, `prop_boxcars`, `prop_ace_deuce`, `prop_horn`, `prop_horn_high`, `prop_hop_generic`, `prop_other` | prop | various prop engine codes | — | false | Exposed in UI, not exported |

### Exporter and API runner mappings
- **Vanilla exporter (`vanilla/export-vanilla.js`):**
  - Canonicalization maps generic kinds (pass, dontpass, place, lay, hardway, prop, odds) to catalog keys; unsupported odds/props are still canonicalized but later warned.
  - Mappings to CrapsSim classes: `pass_line` → `BetPassLine`, `dont_pass` → `BetDontPass`, `come` → `BetCome`, `dont_come` → `BetDontCome`, `place_*` → `BetPlace` aggregated by number, `lay_*` → `BetLay`, `field` → `BetField`, `hardway_*` → `BetHardway`. Prop/odds families have no mapped class beyond a warning.
  - Numbers validated for place/lay/hardway; unsupported catalog entries emit warnings but remain in the component structure.
- **API Runner (`api-runner/api-runner.js`):**
  - `mapBetToAction` converts catalog keys to Engine verbs: `pass_line`, `dont_pass`, `come`, `dont_come` passthrough; `field` → `field`; `place_*` → verb `place` with `{number, amount}`; `lay_*` → verb `lay` with `{number, amount}`; `hardway_*` → verb `hardway` with `{number, amount}`. Odds and prop families fall through and return `null` with a warning.
  - Amounts are scaled/legalized via `legalizeBetByType` and unit conversion before emitting the action.

## Coverage Matrix: Node Surface → Catalog → Engine

Legend: **Mapped** = has catalog entry and exporter/API wiring; **UI-only** = UI exposes but catalog/engine path missing; **Catalog-only** = catalog entry without UI exposure; **Missing** = absent from both.

| Logical bet | Engine verb | Node option(s) | Catalog key(s) | Vanilla exporter mapping | API runner mapping | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Pass Line | `pass_line` | bet-type: Pass | `pass_line` | `BetPassLine` | verb `pass_line` | Mapped |
| Don't Pass | `dont_pass` | bet-type: DontPass | `dont_pass` | `BetDontPass` | verb `dont_pass` | Mapped |
| Come | `come` | bet-type: Come | `come` | `BetCome` | verb `come` | Mapped |
| Don't Come | `dont_come` | bet-type: DontCome | `dont_come` | `BetDontCome` | verb `dont_come` | Mapped |
| Put | `put` | — | — | — | — | Missing |
| Pass Odds | `odds` (pass base) | bet-type: PassOdds | `odds_pass_line` | None (warn only) | None (filtered) | UI-only |
| Don't Pass Odds | `odds` (dont_pass base) | bet-type: DontPassOdds | `odds_dont_pass` | None | None | UI-only |
| Come Odds | `odds` (come base) | bet-type: ComeOdds | `odds_come` | None | None | UI-only |
| Don't Come Odds | `odds` (dont_come base) | bet-type: DontComeOdds | `odds_dont_come` | None | None | UI-only |
| Field | `field` | bet-type: Field | `field` | `BetField` | verb `field` | Mapped |
| Place 4/5/6/8/9/10 | `place` | bet-type: Place + number | `place_4`…`place_10` | `BetPlace` aggregated | verb `place` with number | Mapped |
| Lay 4/5/6/8/9/10 | `lay` | bet-type: Lay + number | `lay_4`…`lay_10` | `BetLay` aggregated | verb `lay` with number | Mapped |
| Big 6/8 | `big6`/`big8` | — | — | — | — | Missing |
| Hardway 4/6/8/10 | `hardway` | bet-prop: Hardway + number | `hardway_4/6/8/10` | `BetHardway` | verb `hardway` with number | Mapped |
| Any 7 | `any7` | bet-prop: Any7 | `prop_any7` | None | None | UI-only |
| Any Craps | `any_craps` | bet-prop: AnyCraps | `prop_any_craps` | None | None | UI-only |
| Two (Aces) | `two` | bet-prop: Aces | `prop_aces` | None | None | UI-only |
| Three | `three` | bet-prop: AceDeuce | `prop_ace_deuce` | None | None | UI-only |
| Yo 11 | `yo` | bet-prop: Yo11 | `prop_yo11` | None | None | UI-only |
| Boxcars (12) | `boxcars` | bet-prop: Boxcars | `prop_boxcars` | None | None | UI-only |
| C&E | `c&e` | — | — | — | — | Missing |
| Horn | `horn` | bet-prop: Horn | `prop_horn` | None | None | UI-only |
| Horn High | `horn` (high variant) | bet-prop: HornHigh | `prop_horn_high` | None | None | UI-only |
| World | `world` | — | — | — | — | Missing |
| Hop (result-param) | `hop` | bet-prop: Hop | `prop_hop_generic` | None | None | UI-only |
| Fire | `fire` | — | — | — | — | Missing |
| All | `all` | — | — | — | — | Missing |
| Tall | `tall` | — | — | — | — | Missing |
| Small | `small` | — | — | — | — | Missing |
| Remove/Reduce/Clear/Set odds working | management verbs | `clear` node (local filtering only) | none | not mapped | not mapped | Missing |

## Proposed bet_surface schema (supported bets only)
- **Supported-only catalog:** Only include bet types that map to an Engine verb in scope and that the pack intends to support. Omit out-of-scope bets instead of keeping `supported: false` placeholders.
- **Entry shape:**
  ```json
  {
    "key": "place_6",
    "family": "place",               // line | place | buy | lay | big | field | prop | hardway | hop | feature | management
    "engine_verb": "place",           // HTTP verb
    "label": "Place 6",               // short human-facing label
    "ui_group": "main" ,              // suggested palette grouping
    "args_schema": {
      "required": ["amount"],
      "optional": ["number"],
      "notes": "number required for place/lay/buy/hardway/hop families"
    },
    "requires_number": [4,6,8,10],     // boolean or allowed set depending on granularity
    "notes": "Skip point allowed handled at mapping time"
  }
  ```
- **Granularity:** Catalog bets per-number for number-specific families (place/buy/lay/big/hardway) to align with existing node keys and simplify validation. Hop bets should store required dice results in `args_schema` (e.g., `requires_number: false`, `args_schema.required: ["amount", "dice"]`). Odds should be modeled as distinct keys per base (`odds_pass_line`, etc.) to capture the base relationship explicitly.
- **Management verbs:** Keep management actions (`remove_bet`, `reduce_bet`, `clear_all_bets`, `clear_center_bets`, `clear_place_buy_lay`, `clear_ats_bets`, `clear_fire_bets`, `set_odds_working`) in a parallel catalog section (e.g., `management_surface.json`) to avoid polluting wagering bets. Each entry would still use `engine_verb` and `args_schema` but would be grouped under `family: "management"` to guide future UI separation.

### Example supported catalog (Phase 4 scope)
- Line: `pass_line`, `dont_pass`, `come`, `dont_come`, optional `put` if Engine verb is available.
- Odds: `odds_pass_line`, `odds_dont_pass`, `odds_come`, `odds_dont_come` (only if Engine `odds` verb is confirmed; otherwise omit until implemented).
- Place/Buy/Lay: `place_4/5/6/8/9/10`, `buy_4/5/6/8/9/10`, `lay_4/5/6/8/9/10`.
- Big: `big6`, `big8`.
- Field & props: `field`, `any7`, `any_craps`, `two`, `three`, `yo`, `boxcars`, `c&e`, `horn`, `world`.
- Hardways/Hops/Features: `hardway_4/6/8/10`, `hop_*` (result-encoded), `fire`, `all`, `tall`, `small`.

## Shared mapping helper API (design)
- **Purpose:** Centralize translation from `strategy_config.bets[]` + catalog entry → (a) Engine HTTP actions and (b) vanilla CrapsSim constructors.
- **Signatures:**
  - `mapBetToApiAction(betEntry, catalogEntry, { varTable, logger }) -> { verb, args, dollars } | null | throws`
  - `mapBetToVanillaSpec(betEntry, catalogEntry, { varTable, logger }) -> { className, args, dollars } | null | throws`
- **Behavior:**
  - Validate presence of `catalogEntry`; throw `UnknownBetError` when missing.
  - Validate `betEntry.base_amount > 0` and `unit_type in {units,dollars}`; throw `InvalidAmountError` when invalid.
  - Normalize/validate numbers for families that require them; if missing, throw `MissingNumberError` (hardway/place/lay/buy/big/hop) unless `requires_number` is `false`.
  - Convert units to dollars using `varTable` multipliers; reject or warn on zero/negative results.
  - For API path: emit `{ verb: catalogEntry.engine_verb, args: { amount, number?, base?, dice? } }` where `base` describes the line bet for odds and `dice` describes hop combinations. Skip/return null only when explicitly instructed (e.g., management bets gated off by caller), otherwise throw to surface programmer errors.
  - For vanilla path: map to `{ className, args }` using a lookup table (e.g., `pass_line -> BetPassLine`, `place -> BetPlace` with aggregated numbers). Odds map to specialized constructors or helper methods once available.
- **Odds representation:**
  - `betEntry.base` (or derived from key) identifies the underlying line bet (`pass_line`, `dont_pass`, `come`, `dont_come`).
  - `args` should include `{ base: "pass_line", amount }` for Engine `odds` verb; vanilla mapping should route to the correct odds constructor or aggregation.
- **Hop representation:**
  - Require `args.dice` as a tuple/list of dice outcomes (e.g., `[1,2]`, `[5,5]`), optionally plus `kind` (easy/hard) if the Engine verb needs it.

## Scope and non-goals
- Catalog entries should reflect only bets that the Engine API supports and that the pack will wire end-to-end. Unsupported bets should be removed rather than marked `supported: false` once the Phase 4 catalog is adopted.
- This checkpoint does **not** modify source code, Node-RED nodes, or `bet_surface.json`; it delivers design only.
- Deferred to later phases: implementing the new catalog, migrating UI to the supported-only surface, odds ergonomics, hop/result UX, deterministic parity mode, batch simulation runs, and palette/UI reorganization.
