const assert = require("assert");

const { listSupported, allowedNumbers } = require("../lib/bet_surface");

const catalog = listSupported();

assert(Array.isArray(catalog) && catalog.length > 0, "Catalog must contain entries");

for (const entry of catalog) {
    assert(entry.key, "entry.key required");
    assert(entry.family, `entry.family required for ${entry.key}`);
    assert(entry.engine_verb, `entry.engine_verb required for ${entry.key}`);
    assert(entry.label, `entry.label required for ${entry.key}`);
    assert(entry.ui_group, `entry.ui_group required for ${entry.key}`);

    assert(entry.args_schema && Array.isArray(entry.args_schema.required), `args_schema.required must be array for ${entry.key}`);
    assert(entry.args_schema && Array.isArray(entry.args_schema.optional), `args_schema.optional must be array for ${entry.key}`);

    if (entry.requires_number !== undefined) {
        const rn = entry.requires_number;
        const rnTypeOk = typeof rn === "boolean" || Array.isArray(rn);
        assert(rnTypeOk, `requires_number must be boolean or array for ${entry.key}`);
        if (Array.isArray(rn)) {
            assert(rn.length > 0, `requires_number array should not be empty for ${entry.key}`);
            for (const n of rn) {
                assert(allowedNumbers.has(Number(n)), `requires_number value ${n} invalid for ${entry.key}`);
            }
        }
    }

    if (entry.number !== undefined && entry.number !== null) {
        assert(allowedNumbers.has(Number(entry.number)), `entry.number must be allowed for ${entry.key}`);
    }
}

console.log("bet_surface catalog integrity validated");
