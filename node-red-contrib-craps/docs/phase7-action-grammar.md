# Phase 7 Action Grammar

This document tracks the evolving action grammar for CrapsSim strategies.

## Implementation Notes (P7-B)

- The strategy compiler now emits `strategy_config.actions[]` alongside the legacy `bets[]` array. Actions include `verb`, `args`, and optional `meta` describing the source bet.
- The Engine API runner prefers `actions[]` when present, validating and normalizing each action through the Verb Registry before calling `/session/apply_action`. The legacy bet path remains available for backward compatibility.
- The vanilla exporter also prefers `actions[]` when available and falls back to `bets[]` otherwise. Management verbs without a direct vanilla equivalent are skipped with a warning comment.
- A Verb Registry (`lib/verb_registry.json`) defines supported verbs, schemas, and vanilla mappings. The registry is validated at load time and enforced during compilation and execution.
