# Odds Support (Line & Come)

Phase 5 adds Engine-backed odds betting for the standard line/come contexts. Odds are only supported through the Engine API path.

## Supported odds types
- `odds_pass_line`
- `odds_dont_pass`
- `odds_come`
- `odds_dont_come`

Odds map to the Engine `odds` verb with the base derived from the key (`pass_line`, `dont_pass`, `come`, or `dont_come`). No other odds flavors are currently exposed.

## Node usage (bet-type)
- Choose **Pass Odds**, **Don't Pass Odds**, **Come Odds**, or **Don't Come Odds** from the Bet kind dropdown.
- Number field:
  - Pass/Don't Pass odds do **not** require a number.
  - Come/Don't Come odds **require** the point number (4/5/6/8/9/10).
- Optional **Working on come-out** checkbox forwards the `working` flag to the API.

## Engine/API mapping
- Odds always produce verb `odds`.
- `args.base` comes from the key (see mapping above).
- `args.number` is included only for Come/Don't Come odds when provided and validated.
- Odds are **not** supported in the vanilla Python exporter; attempting to export them there will throw an explicit error.

## Caveats
- No exotic odds bets in v1; only the line/come contexts listed above.
- Engine table limits still apply—if you exceed allowed odds, the API may return `ILLEGAL_BET` errors.
