const assert = require("assert");
const { mapBetToApiAction, mapBetToVanillaSpec, UnknownBetError } = require("../lib/bet_mapping");
const { getBetDefinition } = require("../lib/bet_surface");
const { getVarTable } = require("../vanilla/legalizer");

const varTable = getVarTable({ get: () => undefined }, {});

function buildBet(key, base_amount, unit_type, number) {
    const bet = { key, base_amount, unit_type };
    if (number !== undefined) bet.number = number;
    return bet;
}

const samples = [
    { key: "pass_line", amount: 10, unit: "dollars" },
    { key: "dont_pass", amount: 10, unit: "dollars" },
    { key: "come", amount: 10, unit: "dollars" },
    { key: "dont_come", amount: 10, unit: "dollars" },
    { key: "field", amount: 5, unit: "dollars" },
    { key: "place_6", amount: 12, unit: "dollars", number: 6 },
    { key: "place_8", amount: 18, unit: "dollars", number: 8 },
    { key: "lay_4", amount: 20, unit: "dollars", number: 4 },
    { key: "lay_10", amount: 20, unit: "dollars", number: 10 },
    { key: "hardway_6", amount: 5, unit: "dollars", number: 6 }
];

for (const sample of samples) {
    const def = getBetDefinition(sample.key);
    assert(def, `Definition missing for ${sample.key}`);

    const betEntry = buildBet(sample.key, sample.amount, sample.unit, sample.number ?? def.number);

    const action = mapBetToApiAction(betEntry, def, { varTable });
    assert.strictEqual(action.verb, def.engine_verb, "Engine verb should match catalog");
    assert(action.args.amount > 0, "Amount should be positive after mapping");

    if (def.requires_number) {
        assert.strictEqual(action.args.number, Number(sample.number ?? def.number), "Number should be propagated for numbered bets");
    } else {
        assert.strictEqual(action.args.number, undefined, "Number should be omitted when not required");
    }

    const vanilla = mapBetToVanillaSpec(betEntry, def, { varTable });
    switch (def.family) {
        case "line":
            if (def.key === "pass_line") assert.strictEqual(vanilla.className, "BetPassLine");
            if (def.key === "dont_pass") assert.strictEqual(vanilla.className, "BetDontPass");
            if (def.key === "come") assert.strictEqual(vanilla.className, "BetCome");
            if (def.key === "dont_come") assert.strictEqual(vanilla.className, "BetDontCome");
            break;
        case "field":
            assert.strictEqual(vanilla.className, "BetField");
            break;
        case "place":
            assert.strictEqual(vanilla.className, "BetPlace");
            break;
        case "lay":
            assert.strictEqual(vanilla.className, "BetLay");
            break;
        case "hardway":
            assert.strictEqual(vanilla.className, "BetHardway");
            break;
        default:
            throw new Error(`Unexpected family ${def.family}`);
    }

    assert(vanilla.args.amount > 0, "Vanilla amount must be positive");
    if (def.requires_number) {
        assert.strictEqual(vanilla.args.number, Number(sample.number ?? def.number));
    }
}

const unknown = { key: "unsupported_bet", base_amount: 5, unit_type: "dollars" };
assert.throws(() => mapBetToApiAction(unknown, null, { varTable }), UnknownBetError, "Unknown keys should throw");
assert.throws(() => mapBetToVanillaSpec(unknown, null, { varTable }), UnknownBetError, "Unknown keys should throw");

const requiresNumberDef = { ...getBetDefinition("place_6"), number: undefined };
const missingNumberBet = { key: "place_6", base_amount: 12, unit_type: "dollars" };
assert.throws(() => mapBetToApiAction(missingNumberBet, requiresNumberDef, { varTable }), /requires a valid number/);
assert.throws(() => mapBetToVanillaSpec(missingNumberBet, requiresNumberDef, { varTable }), /requires a valid number/);

const oddsSamples = [
    { key: "odds_pass_line", number: undefined, base: "pass_line" },
    { key: "odds_dont_pass", number: undefined, base: "dont_pass" },
    { key: "odds_come", number: 6, base: "come" },
    { key: "odds_dont_come", number: 8, base: "dont_come" }
];

for (const sample of oddsSamples) {
    const def = getBetDefinition(sample.key);
    const betEntry = buildBet(sample.key, 10, "dollars", sample.number);
    const action = mapBetToApiAction(betEntry, def, { varTable });
    assert.strictEqual(action.verb, "odds");
    assert.strictEqual(action.args.base, sample.base);
    assert(action.args.amount > 0);
    if (def.requires_number) {
        assert.strictEqual(action.args.number, sample.number);
    } else {
        assert.strictEqual(action.args.number, undefined);
    }
    assert.throws(() => mapBetToVanillaSpec(betEntry, def, { varTable }), /Odds bets are not yet supported/);
}

const missingOddsNumber = buildBet("odds_come", 5, "dollars");
assert.throws(() => mapBetToApiAction(missingOddsNumber, getBetDefinition("odds_come"), { varTable }), /requires a valid number/);

assert.throws(() => mapBetToApiAction({ key: "odds_unknown", base_amount: 5, unit_type: "dollars" }, null, { varTable }), UnknownBetError);

console.log("bet_mapping helper round-trip tests passed");
