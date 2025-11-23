const assert = require("assert");
const { compileStrategyConfig } = require("../lib/strategy_compiler");
const { getVarTable } = require("../vanilla/legalizer");

const vt = getVarTable({ get: () => undefined }, {});

const steps = [
    { type: "pass_line", amount: 5, unitType: "units" },
    { type: "place_6", amount: 18, unitType: "dollars", number: 6 },
    { type: "place_8", amount: 2, unitType: "units", number: 8 }
];

const { config, errors } = compileStrategyConfig({ steps, strategyName: "My_Strategy", table: vt });

assert(Array.isArray(errors) && errors.length === 0, `Expected no errors, got ${errors}`);
assert(config, "strategy_config should be produced");
assert.strictEqual(config.strategy_name, "My_Strategy");
assert.strictEqual(config.bets.length, 3, "Should include three bets");

const passLine = config.bets.find(b => b.key === "pass_line");
assert(passLine, "pass_line bet present");
assert.strictEqual(passLine.base_amount, 5);
assert.strictEqual(passLine.unit_type, "units");

const place6 = config.bets.find(b => b.key === "place_6");
assert(place6 && place6.number === 6, "place_6 should include number 6");
assert.strictEqual(place6.unit_type, "dollars");

const place8 = config.bets.find(b => b.key === "place_8");
assert(place8 && place8.number === 8, "place_8 should include number 8");
assert.strictEqual(place8.unit_type, "units");

assert(Array.isArray(config.actions) && config.actions.length === 3, "actions should mirror bets");
assert(config.actions.some(a => a.verb === "pass_line"), "actions should include pass_line verb");
const placeAction = config.actions.find(a => a.verb === "place" && a.args.number === 6);
assert(placeAction && placeAction.args.amount === 18, "place action should include normalized amount");

let threwInvalid = false;
const registry = require("../lib/verb_registry").loadVerbRegistry();
const placeEntry = registry.get("place");
try {
    registry.delete("place");
    const { errors: badErrors } = compileStrategyConfig({
        steps: [{ type: "place_6", amount: 10, unitType: "dollars", number: 6 }],
        strategyName: "Bad",
        table: vt
    });
    threwInvalid = Array.isArray(badErrors) && badErrors.some(e => e.includes("Invalid action"));
} finally {
    registry.set("place", placeEntry);
}
assert(threwInvalid, "compiler should surface invalid verbs/actions");

console.log("strategy_compiler basic assembly passed");
