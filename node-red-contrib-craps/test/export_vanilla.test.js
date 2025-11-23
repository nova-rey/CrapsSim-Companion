const assert = require("assert");
const exporter = require("../vanilla/export-vanilla.js");
const { getVarTable } = require("../vanilla/legalizer");

const helpers = exporter._test;
assert(helpers, "Exporter helpers should be exposed for testing");

const vt = getVarTable({ get: () => undefined }, {});

const strategy_config = {
    strategy_name: "ExampleStrategy",
    table: vt,
    bets: [
        { key: "pass_line", base_amount: 10, unit_type: "units" },
        { key: "place_6", base_amount: 12, unit_type: "dollars", number: 6 },
        { key: "place_8", base_amount: 12, unit_type: "dollars", number: 8 }
    ]
};

const { comp, errors } = helpers.buildCompFromStrategyConfig(strategy_config, vt, () => {});
assert(Array.isArray(errors) && errors.length === 0, `Unexpected errors: ${errors}`);

assert(comp.maingame.line.some(b => b.key === "pass_line"), "Pass Line should be included");
assert.strictEqual(comp.maingame.place[6], 12, "Place 6 should map dollars directly");
assert.strictEqual(comp.maingame.place[8], 12, "Place 8 should map dollars directly");

const py = helpers.generatePython("ExampleStrategy", comp, {});
assert(py.includes("BetPassLine"), "Python output should include BetPassLine");
assert(py.includes("BetPlace"), "Python output should include BetPlace");

console.log("export-vanilla strategy_config path passed");

const unsupportedConfig = {
    strategy_name: "UnsupportedExample",
    table: vt,
    bets: [
        { key: "prop_any7", base_amount: 5, unit_type: "units" }
    ]
};

const { errors: unsupportedErrors } = helpers.buildCompFromStrategyConfig(unsupportedConfig, vt, () => {});
assert(Array.isArray(unsupportedErrors) && unsupportedErrors.length === 0, "Unsupported bets should not cause errors");
