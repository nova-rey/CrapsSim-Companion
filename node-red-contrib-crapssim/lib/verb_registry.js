const fs = require("fs");
const path = require("path");

class VerbRegistryError extends Error {
    constructor(message) {
        super(message);
        this.name = "VerbRegistryError";
    }
}

let registryCache = null;

function validateArgsSchema(args_schema, ctx) {
    if (!args_schema || typeof args_schema !== "object") {
        throw new VerbRegistryError(`${ctx}: args_schema must be an object`);
    }
    const required = Array.isArray(args_schema.required) ? args_schema.required : [];
    const optional = Array.isArray(args_schema.optional) ? args_schema.optional : [];
    const types = args_schema.types || {};

    for (const field of [...required, ...optional]) {
        if (!types[field]) {
            throw new VerbRegistryError(`${ctx}: missing type for argument '${field}'`);
        }
    }

    return { required, optional, types, constraints: args_schema.constraints || {} };
}

function validateEntry(entry, idx, seen) {
    const ctx = `verb_registry[${idx}]`;
    if (!entry || typeof entry !== "object") {
        throw new VerbRegistryError(`${ctx}: entry must be an object`);
    }
    const { verb, family, engine_verb, args_schema } = entry;
    if (!verb || typeof verb !== "string") throw new VerbRegistryError(`${ctx}: verb must be a non-empty string`);
    if (seen.has(verb)) throw new VerbRegistryError(`${ctx}: duplicate verb '${verb}'`);
    seen.add(verb);
    if (!family || typeof family !== "string") throw new VerbRegistryError(`${ctx}: family must be a non-empty string`);
    if (!engine_verb || typeof engine_verb !== "string") throw new VerbRegistryError(`${ctx}: engine_verb must be a non-empty string`);

    const normalizedSchema = validateArgsSchema(args_schema, ctx);

    return {
        ...entry,
        verb: verb.toString(),
        family: family.toString(),
        engine_verb: engine_verb.toString(),
        args_schema: normalizedSchema
    };
}

function loadVerbRegistryFromFile(filePath) {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
        throw new VerbRegistryError("verb_registry.json must be an array");
    }
    const seen = new Set();
    const entries = parsed.map((entry, idx) => validateEntry(entry, idx, seen));
    const map = new Map();
    for (const entry of entries) map.set(entry.verb, entry);
    return map;
}

function loadVerbRegistry() {
    if (registryCache) return registryCache;
    const file = path.join(__dirname, "verb_registry.json");
    registryCache = loadVerbRegistryFromFile(file);
    return registryCache;
}

function getVerbEntry(verb) {
    const registry = loadVerbRegistry();
    if (!registry.has(verb)) {
        throw new VerbRegistryError(`Unknown verb '${verb}'`);
    }
    return registry.get(verb);
}

function typeMatches(expected, value) {
    switch (expected) {
        case "number": return typeof value === "number" && !Number.isNaN(value);
        case "integer": return Number.isInteger(value);
        case "string": return typeof value === "string";
        case "boolean": return typeof value === "boolean";
        case "object": return value && typeof value === "object" && !Array.isArray(value);
        default: return true;
    }
}

function validateConstraints(name, val, constraints = {}) {
    const rules = constraints[name];
    if (!rules) return;
    if (rules.allowed && Array.isArray(rules.allowed) && !rules.allowed.includes(val)) {
        throw new VerbRegistryError(`Argument '${name}' must be one of: ${rules.allowed.join(", ")}`);
    }
    if (typeof rules.min === "number" && !(Number(val) >= rules.min)) {
        throw new VerbRegistryError(`Argument '${name}' must be >= ${rules.min}`);
    }
    if (typeof rules.max === "number" && !(Number(val) <= rules.max)) {
        throw new VerbRegistryError(`Argument '${name}' must be <= ${rules.max}`);
    }
}

function validateAction(verb, args = {}) {
    const entry = getVerbEntry(verb);
    if (!args || typeof args !== "object") {
        throw new VerbRegistryError(`Action for '${verb}' must supply args object`);
    }
    const { required, optional, types, constraints } = entry.args_schema;
    for (const field of required) {
        if (!(field in args)) {
            throw new VerbRegistryError(`Action '${verb}' is missing required arg '${field}'`);
        }
    }
    for (const [name, value] of Object.entries(args)) {
        if (![...required, ...optional].includes(name)) continue;
        const expectedType = types[name];
        if (expectedType && !typeMatches(expectedType, value)) {
            throw new VerbRegistryError(`Action '${verb}' arg '${name}' must be type ${expectedType}`);
        }
        validateConstraints(name, value, constraints);
    }
    return true;
}

module.exports = {
    VerbRegistryError,
    loadVerbRegistry,
    getVerbEntry,
    validateAction,
    _test: { loadVerbRegistryFromFile, validateEntry, typeMatches }
};
