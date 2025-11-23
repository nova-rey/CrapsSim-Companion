# Phase 7-A — Engine Action Grammar & Verb Registry (Design Checkpoint)

This document defines the Phase 7 plan for turning the Node-RED craps pack from a “static bet layout” generator into a **verb-based action emitter** that can drive CrapsSim via both the HTTP Engine API and the legacy vanilla Python exporter.

No runtime behavior changes are part of this checkpoint. This is a design-only spec to be implemented in later Phase 7 work.

---

## 1. Goals

Phase 7 introduces a unified **action grammar** and **verb registry**:

- Provide a single, engine-truthful representation for all craps actions:
  - Line bets, place/buy/lay, odds, props, hops, Big 6/8, side features (Fire, All/Tall/Small).
  - Bet management verbs (remove/reduce/clear/set working).
- Make the Strategy Compiler emit **actions**, not just flat “bets”.
- Let both execution paths share the same vocabulary:
  - Engine HTTP API runner.
  - Legacy vanilla CrapsSim exporter.
- Preserve determinism and reproducibility:
  - Given the same strategy, table config, seed (or dice script), and engine version → identical outcomes.

Implementation (P7-B/P7-C) will wire this design into the actual nodes and runtime.

---

## 2. Current State (Pre–Phase 7)

### 2.1 Strategy Compiler

- Produces `strategy_config` with:
  - `strategy_name`
  - optional `table` settings
  - `bets[]`: normalized bet entries of the form:
    - `key` (canonical bet_surface key, e.g. `pass_line`, `place_6`)
    - `base_amount`
    - `unit_type` (`units` or `dollars`)
    - optional `number`
    - optional `bet_id`, `note`

There is **no explicit action grammar**; bets are interpreted as “layout at start of run”.

### 2.2 Bet Surface & Mapping

- `bet_surface.json` defines which bet keys exist and maps them to families and engine codes, but only for a subset (line, field, place, lay, hardway, odds v1).
- `bet_mapping.js` converts bet entries into:
  - Engine HTTP calls (for API runner).
  - Vanilla spec constructors (for legacy exporter).

Unsupported bets (e.g., some props, features) are not represented, and there is no general verb/action layer.

### 2.3 API Runner

- Takes `strategy_config.bets[]`.
- Places initial layout by mapping each bet to engine HTTP verbs (e.g., `place`/`lay`/`hardway`).
- Runs a roll loop via `/session/roll`.
- No concept of “action tape” or management verbs; layout is essentially static.

---

## 3. Target Action Grammar

Phase 7 standardizes on a simple, explicit action shape:

```json
{
  "verb": "place",
  "args": {
    "number": 6,
    "amount": 30
  },
  "meta": {
    "note": "optional free-form metadata"
  }
}

3.1 Action Object Schema

Each action is an object with:
•verb (string, required):
•Engine-facing verb name ("pass_line", "place", "odds", "horn", "remove_bet", etc.).
•args (object, required):
•Arguments required for that verb (see §4).
•meta (object, optional):
•Additional metadata not sent to the engine:
•note (string)
•bet_id (string)
•future flags for tracing, authoring hints, etc.

Constraints:
•verb must be present in the Verb Registry (see §4).
•args must satisfy the registry-defined argument schema.
•meta must be ignored by engine calls and vanilla mapping; it’s for tooling only.

⸻

4. Verb Registry

Phase 7 introduces a formal Verb Registry as a JSON catalog. It is the single source of truth for what actions the pack supports.

4.1 Registry Storage

File:
•lib/verb_registry.json — machine-readable catalog.
•lib/verb_registry.js — loader and validator for the JSON.

This registry is used by:
•Strategy Compiler v2 (to validate actions).
•Engine API mapping.
•Vanilla mapping.
•Node-RED nodes (via helper functions) to know which verbs/args exist.

4.2 Registry Entry Schema

Each entry in verb_registry.json has the form:

{
  "verb": "place",
  "family": "bet",
  "engine_verb": "place",
  "label": "Place Bet",
  "args_schema": {
    "required": ["amount", "number"],
    "optional": [],
    "types": {
      "amount": "number",
      "number": "integer"
    },
    "constraints": {
      "amount": { "min": 0.01 },
      "number": { "allowed": [4, 5, 6, 8, 9, 10] }
    }
  },
  "vanilla_mapping": {
    "class": "Place",
    "arg_order": ["number", "amount"]
  },
  "notes": "Standard Place bet on a box number."
}

Fields:
•verb (string, required):
•Canonical name, must be unique (e.g., "pass_line", "place", "odds", "horn", "remove_bet").
•family (string, required):
•Category: "bet", "prop", "management", "feature", "meta", etc.
•engine_verb (string, required):
•HTTP verb name to send to /session/apply_action. Usually the same as verb, but not required.
•label (string, required):
•Human-facing short name (for Node-RED UI).
•args_schema (object, required):
•required: list of argument names.
•optional: list of argument names.
•types: map of argument name → basic type ("number", "integer", "string", "boolean", "array").
•constraints: per-argument restrictions (e.g., allowed numbers, min/max, array shape).
•vanilla_mapping (object, optional):
•For legacy exporter: class name and arg ordering, or "none" if not supported.
•notes (string, optional):
•Human notes for maintainers.

4.3 Example Verb Coverage (Engine-Truthful)

The registry is designed to cover the Engine HTTP API verbs, grouped approximately as:
•Line & odds:
•pass_line, dont_pass, come, dont_come, put
•odds (with base, number?, amount, working?)
•Place / buy / lay / big:
•place, buy, lay, big6, big8
•Field & props:
•field, any7, any_craps, two, three, yo, boxcars, horn, world, c&e
•Hardways / hops / features:
•hardway, hop, fire, all, tall, small
•Management:
•remove_bet, reduce_bet, clear_all_bets, clear_center_bets,
clear_place_buy_lay, clear_ats_bets, clear_fire_bets,
set_odds_working

Phase 7’s registry design assumes one entry per verb; certain usages (like which number to use, or which bets to affect on a remove_bet) are encoded purely in args.

⸻

5. Strategy Config v2 (Actions)

Phase 7 extends the strategy_config schema to include actions.

5.1 Target Shape

New shape (conceptual):

{
  "strategy_name": "my_strategy",
  "table": {
    "...": "unchanged table configuration"
  },
  "actions": [
    {
      "verb": "pass_line",
      "args": { "amount": 10 },
      "meta": { "note": "Opening line bet" }
    },
    {
      "verb": "odds",
      "args": { "base": "pass_line", "amount": 20 }
    },
    {
      "verb": "place",
      "args": { "number": 6, "amount": 30 }
    }
  ],
  "metadata": {
    "created_by": "node-red-contrib-craps",
    "version": "x.y.z"
  }
}

Notes:
•strategy_name, table, and metadata remain consistent with the pre–Phase 7 schema.
•actions becomes the primary driver for execution.
•bets[] may be kept around (Phase 7-B decision) for backward compatibility, but actions is the canonical representation going forward.

5.2 Strategy Compiler v2 Responsibilities

The upgraded compiler will:
•Consume the same recipe steps from bet nodes and any future control nodes.
•Resolve each step into one or more actions:
•Example: a “3-point Molly” builder might generate multiple pass_line, come, odds, and place actions.
•Validate actions against the Verb Registry:
•Unknown verb → error.
•Missing required arguments → error.
•Type mismatch or invalid ranges → error.
•Preserve order:
•The order in actions[] is deterministic and used as the execution order for layout/setup at the start of a run.

The details of how recipe nodes map to single or multiple actions are left for implementation, but the compiler must always emit registry-valid actions.

⸻

6. Engine API Mapping (Action → HTTP)

The Engine API Runner v2 will operate on strategy_config.actions[].

6.1 Mapping Flow

For each action:
1.Lookup verb in verb_registry.json.
2.Validate args against args_schema.
3.Normalize and legalize amounts using the same varTable / table configuration used today.
4.Construct the HTTP payload:

{
  "session_id": "<from /session/start>",
  "verb": "<registry.engine_verb>",
  "args": { ...normalized args... }
}


5.POST to /session/apply_action.
6.Record the response (effects + errors) in the simulation journal.

6.2 Example Mappings
•Pass Line:
•Action:

{ "verb": "pass_line", "args": { "amount": 10 } }


•HTTP:

{ "verb": "pass_line", "args": { "amount": 10 } }


•Place 6:
•Action:

{ "verb": "place", "args": { "number": 6, "amount": 30 } }


•Odds on Pass Line:
•Action:

{ "verb": "odds", "args": { "base": "pass_line", "amount": 20 } }


•Horn:
•Action:

{ "verb": "horn", "args": { "amount": 5 } }


•Reduce Bet:
•Action:

{ "verb": "reduce_bet", "args": { "type": "place", "number": 6, "new_amount": 18 } }



The registry gives the runner enough information to verify and transform these actions without special-casing every verb in multiple places.

⸻

7. Vanilla Mapping (Action → Python Spec)

The legacy vanilla exporter continues to emit Python code that uses the crapssim bet classes directly.

Phase 7 defines a parallel mapping layer:
•lib/vanilla_mapping.js:
•For each action:
•Look up verb.
•Convert to BetXXX(...) or appropriate helper call.
•Aggregate as needed (e.g., Place bets by number).

Example:
•Action:

{ "verb": "place", "args": { "number": 8, "amount": 24 } }


•Vanilla mapping:
•verb: "place" → class: "Place" with { number, amount }.
•Produces: Place(8, 24) in the emitted strategy.

Non-bet management verbs such as clear_all_bets may map to comments or no-ops in vanilla export (implementation detail), but the design requirement is that the mapping be explicit and governed by the registry.

⸻

8. Validation and Error Semantics

Phase 7 establishes the following validation layers:
1.Registry Load Validation:
•verb_registry.json must:
•Have unique verb keys.
•Only use allowed families.
•Provide complete args_schema for each verb.
•Fail fast if the registry is invalid.
2.Compiler Validation:
•Every emitted action must:
•Use a known verb.
•Satisfy argument requirements and types.
•Compiler errors stop generation of strategy_config.
3.Runner Validation:
•Before calling HTTP or generating vanilla output:
•Re-validate actions using the same registry.
•This protects against malformed configs coming from external clients.
4.Engine-Level Errors:
•The HTTP engine may still reject legal-looking actions (e.g., insufficient funds, illegal timing).
•These are recorded in the sim journal and sim_result as today.

⸻

9. Backward Compatibility & Migration

Phase 7 is designed to be rolled out without breaking existing flows:
•strategy_config.bets[] may continue to exist for a while.
•P7-B can either:
•Derive actions[] from bets[] internally (when legacy flows are detected), or
•Provide a migration path where nodes emit actions directly.
•The Engine API Runner and vanilla exporter should prefer actions[] when present; fall back to bets[] only if actions[] is absent.

Exact migration rules will be specified in P7-B once the implementation details are clear.

⸻

10. Non-Goals for Phase 7-A

Out of scope for this checkpoint:
•No changes to node HTML or Node-RED UI.
•No changes to bet_surface.json.
•No JS or runtime modifications.
•No new HTTP endpoints or engine features.
•No DSL/conditional rules (that will be a later phase).

Phase 7-A establishes the contracts the implementation (P7-B/P7-C) must satisfy.

---

## 2) Optional Roadmap Touch-Up (If Present)

If the repo has a high-level roadmap doc such as `docs/ROADMAP.md` or similar, append a short Phase 7 entry summarizing:

```markdown
## Phase 7 — Engine Action Grammar & Verb Registry

- Introduce a unified action grammar (`{ verb, args, meta }`) for all craps operations.
- Add a verb registry (`lib/verb_registry.json`) describing supported verbs and their argument schemas.
- Upgrade the Strategy Compiler to emit `strategy_config.actions[]`.
- Wire Engine API runner and vanilla exporter to use actions via shared mapping layers.
- Maintain backward compatibility with existing `bets[]`-based strategies during migration.

If no such file exists, skip this step.

⸻

3) No Tests / No Code Changes
•Do not modify any JS, HTML, or JSON code in this checkpoint.
•Do not update bet mapping or node behavior.
•This is strictly a documentation-only change.

You can still run any doc lint/formatting commands that exist (e.g., markdown lint), but there should be no runtime impact.

⸻

4) Commit Message

Use:

P7-A: define action grammar and verb registry

Write results of any analysis to a .md file
