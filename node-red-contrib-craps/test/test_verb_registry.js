const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { loadVerbRegistry, getVerbEntry, validateAction, VerbRegistryError, _test } = require("../lib/verb_registry");

const registry = loadVerbRegistry();
assert(registry instanceof Map, "Registry should be a Map");
["pass_line", "place", "odds", "field", "hardway", "remove_bet"].forEach(v => {
    assert(registry.has(v), `Registry should include '${v}'`);
    const entry = getVerbEntry(v);
    assert(entry.args_schema, "Entry should include args_schema");
});

validateAction("place", { amount: 15, number: 6 });

let threw = false;
try {
    validateAction("place", { amount: 10 });
} catch (err) {
    threw = err instanceof VerbRegistryError;
}
assert(threw, "validateAction should throw on missing required args");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "verb-reg-"));
const badFile = path.join(tmpDir, "bad_registry.json");
fs.writeFileSync(badFile, JSON.stringify([
    { verb: "dup", family: "line", engine_verb: "a", args_schema: { required: [], optional: [], types: {} } },
    { verb: "dup", family: "line", engine_verb: "b", args_schema: { required: [], optional: [], types: {} } }
]));
let badThrew = false;
try {
    _test.loadVerbRegistryFromFile(badFile);
} catch (err) {
    badThrew = err instanceof VerbRegistryError;
}
assert(badThrew, "Loader should reject duplicate verbs");

console.log("verb registry tests passed");
