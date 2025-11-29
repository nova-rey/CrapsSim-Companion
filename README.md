# CrapsSim Companion (Node-RED Strategy Builder)

**Design craps strategies visually → compile into [CrapsSim](https://skent259.github.io/crapssim/) strategies.**

This Node-RED contrib package provides drag-and-drop nodes for building, validating, and exporting craps betting strategies.  
It is a **vanilla-only** release intended for day-to-day use with CrapsSim.

---

## ✨ Features

- **Visual flow design**: Build strategies using Node-RED’s drag-and-drop editor.
- **Bet nodes**: Pass, Don’t Pass, Come, Don’t Come, Place, Lay, Field, Hardways, basic Props.
- **Value nodes**: Integers in **dollars** or **units** (`int-type`).
- **Markers**: Comeout, Main Game, Endgame, and Roll (for readability).
- **Variables**:
  - `var-bankroll`
  - `var-max-rolls`
  - `var-seed`
  - `var-table` (bubble vs. $5/$10/$15/$20/$25 tables)
- **Validator**: Sanity-check strategies (bubble-aware).
- **Exporter**: Generate a ready-to-run Python strategy file using CrapsSim.

---

## 📦 Installation

```bash
cd ~/.node-red
npm install nova-rey/crapssim-companion
