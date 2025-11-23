const assert = require("assert");
const { getBetDefinition, isSupported, validateCatalog } = require("../lib/bet_surface");

validateCatalog();

const passLine = getBetDefinition("pass_line");
assert(passLine, "pass_line should exist in catalog");
assert.strictEqual(passLine.family, "line");

const placeSix = getBetDefinition("place_6");
assert(placeSix, "place_6 should exist in catalog");
assert.strictEqual(placeSix.number, 6);

assert.strictEqual(isSupported("pass_line"), true, "pass_line should be supported");
assert.strictEqual(isSupported("odds_pass_line"), false, "odds_pass_line should be marked unsupported");
assert.strictEqual(isSupported("prop_any7"), false, "prop_any7 should be marked unsupported");

console.log("bet_surface catalog validation passed");
