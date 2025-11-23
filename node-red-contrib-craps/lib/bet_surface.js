const fs = require("fs");
const path = require("path");

const allowedFamilies = new Set(["line", "place", "lay", "field", "hardway", "prop", "odds", "meta"]);
const numberRequiredFamilies = new Set(["place", "lay", "hardway", "odds"]);
const allowedNumbers = new Set([4, 5, 6, 8, 9, 10]);

let catalogCache = null;

function loadCatalog() {
    if (catalogCache) return catalogCache;
    const file = path.join(__dirname, "..", "bet_surface.json");
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw);
    catalogCache = validateAndNormalize(parsed);
    return catalogCache;
}

function validateAndNormalize(entries) {
    if (!Array.isArray(entries)) {
        throw new Error("bet_surface.json must be an array of bet definitions");
    }
    const seen = new Set();
    return entries.map((entry, idx) => {
        const ctx = `bet_surface[${idx}]`;
        if (!entry || typeof entry !== "object") {
            throw new Error(`${ctx}: entry must be an object`);
        }
        const { key, engine_code, friendly_name, family, number, min_unit, increment, dynamic_point } = entry;
        if (!key || !engine_code || !friendly_name || !family) {
            throw new Error(`${ctx}: missing required field (key, engine_code, friendly_name, family)`);
        }
        if (seen.has(key)) {
            throw new Error(`${ctx}: duplicate key '${key}'`);
        }
        seen.add(key);
        if (!allowedFamilies.has(family)) {
            throw new Error(`${ctx}: unknown family '${family}'`);
        }
        if (numberRequiredFamilies.has(family)) {
            const hasNumber = number !== undefined && number !== null;
            if (!hasNumber && !dynamic_point) {
                throw new Error(`${ctx}: family '${family}' requires number in {4,5,6,8,9,10}`);
            }
            if (hasNumber && !allowedNumbers.has(Number(number))) {
                throw new Error(`${ctx}: invalid number '${number}' for family '${family}'`);
            }
        }
        if (min_unit !== undefined && (!Number.isInteger(min_unit) || min_unit <= 0)) {
            throw new Error(`${ctx}: min_unit must be a positive integer`);
        }
        if (increment !== undefined && (!Number.isInteger(increment) || increment <= 0)) {
            throw new Error(`${ctx}: increment must be a positive integer`);
        }
        return { ...entry, key: String(key), engine_code: String(engine_code), friendly_name: String(friendly_name), family };
    });
}

function getBetDefinition(key) {
    if (!key) return undefined;
    return loadCatalog().find(b => b.key === key);
}

function isSupported(key) {
    const def = getBetDefinition(key);
    return !!def && def.supported !== false;
}

function listSupported() {
    return loadCatalog().filter(b => b.supported !== false);
}

function listByFamily(family) {
    return loadCatalog().filter(b => b.family === family);
}

function validateCatalog() {
    loadCatalog();
    return true;
}

validateCatalog();

module.exports = {
    getBetDefinition,
    isSupported,
    listSupported,
    listByFamily,
    validateCatalog,
    allowedNumbers
};
