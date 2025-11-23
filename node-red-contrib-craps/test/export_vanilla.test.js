const assert = require("assert");
const exporter = require("../vanilla/export-vanilla.js");
const { getVarTable } = require("../vanilla/legalizer");
const { compileStrategyConfig } = require("../lib/strategy_compiler");

const helpers = exporter._test;
assert(helpers, "Exporter helpers should be exposed for testing");

const vt = getVarTable({ get: () => undefined }, {});

const strategy_config = {
    strategy_name: "ExampleStrategy",
    table: vt,
    bets: [
        { key: "pass_line", base_amount: 10, unit_type: "units" },
        { key: "place_6", base_amount: 12, unit_type: "dollars", number: 6 },
        { key: "place_8", base_amount: 12, unit_type: "dollars", number: 8 },
        { key: "hardway_6", base_amount: 5, unit_type: "dollars", number: 6 }
    ]
};

const { comp, errors } = helpers.buildCompFromStrategyConfig(strategy_config, vt, () => {});
assert(Array.isArray(errors) && errors.length === 0, `Unexpected errors: ${errors}`);

assert(comp.maingame.line.some(b => b.key === "pass_line"), "Pass Line should be included");
assert.strictEqual(comp.maingame.place[6], 12, "Place 6 should map dollars directly");
assert.strictEqual(comp.maingame.place[8], 12, "Place 8 should map dollars directly");
assert(comp.maingame.hard.some(b => b.number === 6), "Hardway 6 should be included");

const py = helpers.generatePython("ExampleStrategy", comp, {});
assert(py.includes("BetPassLine"), "Python output should include BetPassLine");
assert(py.includes("BetPlace"), "Python output should include BetPlace");
assert(py.includes("BetHardway"), "Python output should include BetHardway");

console.log("export-vanilla strategy_config path passed");

// Regression: legacy recipe.steps path should map to the same comp as strategy_config
const recipeSteps = [
    { type: "pass_line", amount: 10, unitType: "units" },
    { type: "place_6", amount: 12, unitType: "dollars", number: 6 },
    { type: "hardway_6", amount: 5, unitType: "units", number: 6 }
];

const { comp: legacyComp } = helpers.buildCompFromSteps(recipeSteps, vt, () => {});

const { config: compiledConfig, errors: compileErrors } = compileStrategyConfig({
    steps: recipeSteps,
    strategyName: "LegacyParity",
    table: vt
});
assert(Array.isArray(compileErrors) && compileErrors.length === 0, `compileStrategyConfig errors: ${compileErrors}`);

const { comp: compiledComp, errors: configErrors } = helpers.buildCompFromStrategyConfig(compiledConfig, vt, () => {});
assert(Array.isArray(configErrors) && configErrors.length === 0, `buildCompFromStrategyConfig errors: ${configErrors}`);

assert.deepStrictEqual(compiledComp, legacyComp, "strategy_config and legacy recipe paths should agree");
console.log("export-vanilla legacy compatibility path passed");
