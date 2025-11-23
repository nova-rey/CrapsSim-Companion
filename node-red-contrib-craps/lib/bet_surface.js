const fs = require("fs");
const path = require("path");

const allowedFamilies = new Set(["line", "place", "lay", "field", "hardway"]);
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

function validateArgsSchema(args_schema, ctx) {
    if (!args_schema || typeof args_schema !== "object") {
        throw new Error(`${ctx}: args_schema must be an object`);
    }
    const required = Array.isArray(args_schema.required) ? args_schema.required : [];
    const optional = Array.isArray(args_schema.optional) ? args_schema.optional : [];
    return { required, optional };
}

function validateRequiresNumber(entry, ctx) {
    const { requires_number, number } = entry;
    if (requires_number === undefined) return { requires_number: false, number };
    if (requires_number === false) return { requires_number: false, number };
    if (requires_number === true) {
        if (number === undefined || number === null) {
            throw new Error(`${ctx}: requires_number=true requires a number field`);
        }
        if (!allowedNumbers.has(Number(number))) {
            throw new Error(`${ctx}: number '${number}' is not allowed`);
        }
        return { requires_number: true, number: Number(number) };
    }
    if (Array.isArray(requires_number)) {
        const normalized = requires_number.map(n => Number(n));
        const invalid = normalized.find(n => !allowedNumbers.has(n));
        if (invalid !== undefined) {
            throw new Error(`${ctx}: requires_number includes invalid number '${invalid}'`);
        }
        if (number !== undefined && !normalized.includes(Number(number))) {
            throw new Error(`${ctx}: number '${number}' not permitted by requires_number`);
        }
        return { requires_number: normalized, number: number !== undefined ? Number(number) : number };
    }
    throw new Error(`${ctx}: requires_number must be boolean or array`);
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
        const { key, family, engine_verb, label, ui_group } = entry;
        if (!key || !family || !engine_verb || !label || !ui_group) {
            throw new Error(`${ctx}: missing required field (key, family, engine_verb, label, ui_group)`);
        }
        if (seen.has(key)) {
            throw new Error(`${ctx}: duplicate key '${key}'`);
        }
        seen.add(key);
        if (!allowedFamilies.has(family)) {
            throw new Error(`${ctx}: unknown family '${family}'`);
        }

        const args_schema = validateArgsSchema(entry.args_schema, ctx);
        const { requires_number, number } = validateRequiresNumber(entry, ctx);
        if (number !== undefined && number !== null && !allowedNumbers.has(Number(number))) {
            throw new Error(`${ctx}: invalid number '${number}'`);
        }

        return {
            ...entry,
            key: String(key),
            engine_verb: String(engine_verb),
            label: String(label),
            family,
            ui_group,
            args_schema,
            requires_number,
            number: number !== undefined ? Number(number) : undefined
        };
    });
}

function getBetDefinition(key) {
    if (!key) return undefined;
    return loadCatalog().find(b => b.key === key);
}

function isSupported(key) {
    return !!getBetDefinition(key);
}

function listSupported() {
    return loadCatalog();
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
