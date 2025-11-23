const assert = require("assert");
const { listSupported, validateCatalog, getBetDefinition } = require("../lib/bet_surface");
const { mapBetToApiAction } = require("../lib/bet_mapping");
const { getVarTable } = require("../vanilla/legalizer");

validateCatalog();

const vt = getVarTable({ get: () => undefined }, {});
const catalog = listSupported();

assert(Array.isArray(catalog) && catalog.length > 0, "Catalog should contain supported bets");

for (const entry of catalog) {
    assert(entry.key, "entry.key required");
    assert(entry.family, "entry.family required");
    assert(entry.engine_verb, "entry.engine_verb required");
    assert(entry.label, "entry.label required");
    assert(entry.ui_group, "entry.ui_group required");
    assert(Array.isArray(entry.args_schema.required), "args_schema.required must be array");
}

const sampleBets = [
    { key: "pass_line", base_amount: 10, unit_type: "units" },
    { key: "dont_pass", base_amount: 10, unit_type: "units" },
    { key: "field", base_amount: 5, unit_type: "dollars" },
    { key: "place_6", base_amount: 12, unit_type: "dollars", number: 6 },
    { key: "lay_4", base_amount: 15, unit_type: "dollars", number: 4 },
    { key: "hardway_8", base_amount: 5, unit_type: "units", number: 8 }
];

for (const bet of sampleBets) {
    const def = getBetDefinition(bet.key);
    assert(def, `Definition missing for ${bet.key}`);
    const action = mapBetToApiAction(bet, def, { varTable: vt });
    assert.strictEqual(action.verb, def.engine_verb, "Engine verb should match catalog");
    assert(action.args.amount > 0, "Amount should be positive after mapping");
    if (def.requires_number) {
        assert(action.args.number === bet.number || action.args.number === def.number, "Number should be carried through");
    }
}

console.log("bet_surface catalog validation passed");
