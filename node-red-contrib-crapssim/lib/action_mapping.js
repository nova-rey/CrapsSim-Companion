const { dollarsFromUnitsOrLiteral, legalizeBetByType } = require("../vanilla/legalizer");
const { allowedNumbers } = require("./bet_surface");
const { getVerbEntry, validateAction, VerbRegistryError } = require("./verb_registry");

function deriveOddsBase(key) {
    switch (key) {
        case "pass_line":
        case "dont_pass":
        case "come":
        case "dont_come":
            return key;
        default:
            return null;
    }
}

function resolveNumber(args, entry) {
    const number = args.number !== undefined && args.number !== null ? Number(args.number) : entry?.number;
    return number !== undefined ? Number(number) : undefined;
}

function normalizeAmount(amount, unit_type, vt) {
    const baseAmount = Number(amount);
    if (!(baseAmount > 0)) {
        throw new Error("amount must be positive");
    }
    const payload = (unit_type || "dollars") === "units"
        ? { units: baseAmount }
        : { dollars: baseAmount };
    const preDollars = dollarsFromUnitsOrLiteral(payload, vt);
    if (!(preDollars > 0)) {
        throw new Error("resolved amount must be positive");
    }
    return preDollars;
}

function buildLegalizeKey(entry, number) {
    if (["place", "buy", "lay", "hardway", "put", "big6", "big8"].includes(entry.engine_verb) && number !== undefined) {
        return `${entry.engine_verb}_${number}`;
    }
    return entry.engine_verb;
}

function normalizeActionArgs(action, entry, { varTable }) {
    const args = action.args || {};
    validateAction(entry.verb, args);
    const unit_type = action.meta?.unit_type || action.meta?.unitType || args.unit_type || args.unitType || "dollars";
    const preDollars = normalizeAmount(args.amount, unit_type, varTable);
    const number = resolveNumber(args, entry);
    if (entry.args_schema.required.includes("number") && !allowedNumbers.has(Number(number))) {
        throw new VerbRegistryError(`Action '${entry.verb}' requires a valid number`);
    }

    const normalizedArgs = {};
    let legalized = preDollars;

    if (entry.family === "odds") {
        const base = deriveOddsBase(args.base);
        if (!base) {
            throw new VerbRegistryError(`Action '${entry.verb}' requires a valid odds base`);
        }
        if (args.number !== undefined && args.number !== null && !allowedNumbers.has(Number(args.number))) {
            throw new VerbRegistryError(`Action '${entry.verb}' requires a valid number`);
        }
        legalized = legalizeBetByType({ type: base, point: number }, preDollars, undefined, varTable);
        normalizedArgs.base = base;
        if (number !== undefined) normalizedArgs.number = Number(number);
        if (args.working !== undefined) normalizedArgs.working = Boolean(args.working);
    } else {
        const typeKey = buildLegalizeKey(entry, number);
        legalized = legalizeBetByType({ type: typeKey, point: number }, preDollars, undefined, varTable);
        if (number !== undefined && (entry.args_schema.required.includes("number") || entry.args_schema.optional.includes("number"))) {
            normalizedArgs.number = Number(number);
        }
        if (args.working !== undefined && entry.args_schema.optional.includes("working")) {
            normalizedArgs.working = Boolean(args.working);
        }
    }

    if (!(legalized > 0)) {
        throw new VerbRegistryError(`Action '${entry.verb}' resolved to non-positive dollars after legalization`);
    }

    normalizedArgs.amount = legalized;
    return { normalizedArgs, legalized, number };
}

function mapActionToApiCall(action, { varTable, logger } = {}) {
    const verb = action?.verb;
    let entry;
    try {
        entry = getVerbEntry(verb);
    } catch (err) {
        if (logger && logger.warn) logger.warn(err.message);
        return null;
    }

    try {
        const { normalizedArgs } = normalizeActionArgs(action, entry, { varTable });
        return { verb: entry.engine_verb, args: normalizedArgs };
    } catch (err) {
        if (logger && logger.warn) logger.warn(`api-runner: skipping action '${verb}': ${err.message}`);
        return null;
    }
}

function mapActionToVanillaSpec(action, { varTable, logger } = {}) {
    const verb = action?.verb;
    let entry;
    try {
        entry = getVerbEntry(verb);
    } catch (err) {
        if (logger && logger.warn) logger.warn(err.message);
        return null;
    }

    if (!entry.vanilla_mapping) {
        if (logger && logger.warn) logger.warn(`export: no vanilla mapping for action '${verb}'`);
        return { comment: `# action '${verb}' skipped (no vanilla mapping)` };
    }

    try {
        const { normalizedArgs, legalized, number } = normalizeActionArgs(action, entry, { varTable });
        const orderedArgs = (entry.vanilla_mapping.arg_order || []).map(name => normalizedArgs[name]);
        return {
            className: entry.vanilla_mapping.class,
            args: orderedArgs,
            dollars: legalized,
            family: entry.family,
            number: number !== undefined ? Number(number) : undefined,
            key: entry.engine_verb
        };
    } catch (err) {
        if (logger && logger.warn) logger.warn(`export: skipping action '${verb}': ${err.message}`);
        return null;
    }
}

module.exports = {
    mapActionToApiCall,
    mapActionToVanillaSpec,
    normalizeActionArgs,
    deriveOddsBase
};
