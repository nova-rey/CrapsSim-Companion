# Phase 3-A: CrapsSim Engine API Runner Design

## 1. Strategy Config Summary (client view)
The Strategy Compiler emits `msg.strategy_config` containing a normalized strategy name, optional table configuration, metadata, and a bet list. Each bet preserves the canonical bet surface key, base amount, unit type, resolved number, optional `bet_id`, and note. Entries validate unit type (`units` or `dollars`), require positive amounts, and resolve point numbers for number-aware families; unsupported bet keys are still recorded with warnings. Metadata defaults to a `created_by` marker and package version but can include user-supplied fields when present.

## 2. Engine HTTP API Cheat Sheet
- **Session lifecycle**
  - `POST /session/start` – `{ seed:int, profile_id:string }` → returns a `session_id` plus opening bankroll/puck/bet state.
  - `POST /session/roll` – `{ session_id, dice?: [d1,d2] }` → executes a roll; returns roll result, bankroll, hand/point status, and emitted events/errors.
  - `POST /end_session` – `{ session_id }` → closes session; returns a minimal summary/report.
  - `POST /step_roll` (if exposed) – deterministic/testing path; not required for P3 MVP.
- **Actions**
  - `POST /session/apply_action` – `{ session_id, verb, args }` where `verb` is one of: line/odds (`pass_line`, `dont_pass`, `come`, `dont_come`, `put`, `odds`), place/buy/lay/big (`place`, `buy`, `lay`, `big6`, `big8`), field/props (`field`, `any7`, `c&e`, `horn`, `world`, `any_craps`, `two`, `three`, `yo`, `boxcars`), hardways/hops/sidebets (`hardway`, `hop`, `fire`, `all`, `tall`, `small`), management (`remove_bet`, `reduce_bet`, `clear_*`, `set_odds_working`). Args vary per verb (e.g., `{ amount }`, `{ number, amount }`, `{ bet_id }`, `{ working: bool }`).
- **Meta**
  - `GET /health` – engine version and readiness.
  - `GET /capabilities` – supported bets/increments for sanity checks.
- **Error contract**
  - HTTP 200 with an `errors` array is valid. Representative codes: `INVALID_ARGS`, `UNKNOWN_SESSION`, `ILLEGAL_BET`, `INSUFFICIENT_FUNDS`, `BAD_TIMING`, `INTERNAL_ERROR`. Non-2xx statuses signal transport/contract faults.

## 3. API Config Node (design)
Purpose: centralize Engine API defaults so runner nodes avoid hardcoding.

Config fields:
- `base_url` (string) – e.g., `http://127.0.0.1:8000`.
- `profile_id` (string) – default Engine profile for sessions.
- `default_seed_mode` (enum) – `fixed` (use configured seed), `random` (fresh RNG per run), `from_msg` (prefer `msg.seed`).
- `seed` (int, used when mode=fixed).
- `timeout_ms` (int) – per-request timeout.
- Optional future-proofing: `retries`, `retry_backoff_ms`, `auth_token`/custom headers.

Integration: runner nodes reference this config node; resolved settings can be copied into `msg.api_config` during execution (base URL, seed decision, timeout, profile). Overrides in `msg` take precedence when explicitly provided.

## 4. API Runner Node Behavior
### Inputs
- Required: `msg.strategy_config` from the Strategy Compiler (fields: `strategy_name`, `bets[]`, optional `table`, `metadata`).
- Optional overrides: `msg.seed`, `msg.rolls`/`msg.runs` (target roll count), `msg.profile_id`, injected deterministic dice array (deferred unless parity mode enabled), and `msg.api_config` (if bypassing a config node).

### Session lifecycle
1. **Start** – pick seed using config mode + overrides; call `POST /session/start` with `{ seed, profile_id }`; store `session_id` and initial bankroll/point snapshot.
2. **Apply layout** – iterate `strategy_config.bets`, map canonical keys to `apply_action` verbs/args (see §5), issue `POST /session/apply_action` per bet, collect any 200-level errors for reporting; unknown/unsupported keys log warnings and are skipped unless strict mode is added.
3. **Roll loop** – perform N rolls (node setting with `msg.rolls` override). For each roll, `POST /session/roll { session_id }`; append responses to an in-memory `sim_journal`. Deterministic dice injection via `{ dice }` is reserved for a later testing mode.
4. **End** – call `POST /end_session { session_id }`; attach returned summary to results.

### Outputs
- `msg.sim_result` (Phase 3 core fields): `{ strategy_name, seed, rolls, bankroll_start, bankroll_end, net, ev_per_roll?, errors[] }` (ev_per_roll optional proxy; errors aggregates non-fatal API errors).
- `msg.sim_journal`: ordered list of roll responses (optionally trimmed to key fields in future revisions).
- `msg.payload` defaults to `msg.sim_result` for easy chaining.
- Optional future outputs: `msg.api_calls` diagnostics; `msg.journal_path` if file output enabled.

## 5. Bet key → API verb mapping (current surface)
- Line: `pass_line` → verb `pass_line` `{ amount }`; `dont_pass` → `dont_pass`; `come` → `come`; `dont_come` → `dont_come`.
- Field: `field` → verb `field` `{ amount }`.
- Place: `place_{n}` → verb `place` `{ number: n, amount }` for n ∈ {4,5,6,8,9,10}.
- Lay: `lay_{n}` → verb `lay` `{ number: n, amount }`.
- Hardway: `hardway_{n}` → verb `hardway` `{ number: n, amount }` for n ∈ {4,6,8,10}.
- Unsupported/placeholder keys (odds/props) are logged and skipped in P3 MVP; future versions can extend verbs/args per HTTP reference.

Amounts: resolve bet `base_amount` using `unit_type` (units vs dollars) with any table scaling from `strategy_config.table` before sending.

## 6. Error Handling Model
- **Pre-flight**: missing `strategy_config` or API config → Node-RED error, aborts without HTTP calls.
- **Transport/HTTP**: non-2xx responses are treated as fatal; include status/body in `msg.api_error` and halt.
- **200 with errors[]**: record in `sim_result.errors`. Policy: continue for recoverable bet-level issues (e.g., `ILLEGAL_BET`, `INSUFFICIENT_FUNDS`, `BAD_TIMING`) unless a strict mode is added; still append the roll/action response to the journal. If `UNKNOWN_SESSION` appears, treat as fatal and abort/end-session attempt.
- **Timeout/connection**: treat as fatal; emit Node-RED error, optionally attach partial `sim_journal` for completed calls.

## 7. Journal/File Output (design)
Primary output is in-memory `msg.sim_journal`. Optional node setting: “Write journal to file.” If enabled, serialize journal as NDJSON (one roll per line) or CSV (selected columns), write to a configurable path, and expose `msg.journal_path` for downstream nodes. File I/O is deferred to P3-B implementation.

## 8. Documentation Plan (for P3-C)
- **What is the API Runner?** Overview describing execution of `strategy_config` through CrapsSim Engine HTTP endpoints.
- **Configuring the Engine API**: explain API Config node fields (base URL, profile, seed behavior, timeout, auth placeholders).
- **Running a Strategy via API**: sample flow wiring bet nodes → Strategy Compiler → API Runner → Debug/File nodes, highlighting `msg.payload` and journal outputs.
- **Error Handling & Troubleshooting**: clarify how node-level errors surface vs. `sim_result.errors`, and guidance on common HTTP codes/timeouts.

