const { dollarsFromUnitsOrLiteral, legalizeBetByType } = require("../vanilla/legalizer");
const { allowedNumbers } = require("./bet_surface");

class UnknownBetError extends Error {
    constructor(message) {
        super(message);
        this.name = "UnknownBetError";
    }
}

function resolveNumber(betEntry, catalogEntry) {
    const number = betEntry.number !== undefined && betEntry.number !== null
        ? Number(betEntry.number)
        : catalogEntry.number;
    return number !== undefined ? Number(number) : undefined;
}

function ensureNumberAllowed(number, requires_number) {
    if (!requires_number) return true;
    if (Array.isArray(requires_number)) {
        return requires_number.includes(Number(number));
    }
    if (requires_number === true) {
        return allowedNumbers.has(Number(number));
    }
    return true;
}

function normalizeAmount(betEntry, varTable) {
    const baseAmount = Number(betEntry.base_amount);
    const unitType = betEntry.unit_type;
    if (!(baseAmount > 0)) {
        throw new Error(`bet '${betEntry.key}' is missing a positive base_amount`);
    }
    if (!unitType || !["units", "dollars"].includes(unitType)) {
        throw new Error(`bet '${betEntry.key}' must specify unit_type as 'units' or 'dollars'`);
    }
    const preDollars = dollarsFromUnitsOrLiteral(
        unitType === "units" ? { units: baseAmount } : { dollars: baseAmount },
        varTable
    );
    if (!(preDollars > 0)) {
        throw new Error(`bet '${betEntry.key}' resolved to non-positive dollars (${preDollars})`);
    }
    return preDollars;
}

function mapBetToApiAction(betEntry, catalogEntry, { varTable, logger } = {}) {
    if (!catalogEntry) {
        throw new UnknownBetError(`Unknown bet key '${betEntry?.key}'`);
    }
    const number = resolveNumber(betEntry, catalogEntry);
    if (catalogEntry.requires_number && !ensureNumberAllowed(number, catalogEntry.requires_number)) {
        throw new Error(`bet '${catalogEntry.key}' requires a valid number`);
    }

    const preDollars = normalizeAmount(betEntry, varTable);
    const legalized = legalizeBetByType({ type: catalogEntry.key, point: number }, preDollars, undefined, varTable);
    if (!(legalized > 0)) {
        throw new Error(`bet '${catalogEntry.key}' resolved to non-positive dollars after legalization`);
    }

    const args = { amount: legalized };
    if (number !== undefined && number !== null && catalogEntry.requires_number) {
        args.number = Number(number);
    }

    return {
        key: catalogEntry.key,
        verb: catalogEntry.engine_verb,
        args,
        dollars: legalized,
        number: number !== undefined ? Number(number) : undefined,
        family: catalogEntry.family
    };
}

function mapBetToVanillaSpec(betEntry, catalogEntry, { varTable } = {}) {
    if (!catalogEntry) {
        throw new UnknownBetError(`Unknown bet key '${betEntry?.key}'`);
    }
    const number = resolveNumber(betEntry, catalogEntry);
    if (catalogEntry.requires_number && !ensureNumberAllowed(number, catalogEntry.requires_number)) {
        throw new Error(`bet '${catalogEntry.key}' requires a valid number`);
    }

    const preDollars = normalizeAmount(betEntry, varTable);
    const legalized = legalizeBetByType({ type: catalogEntry.key, point: number }, preDollars, undefined, varTable);
    if (!(legalized > 0)) {
        throw new Error(`bet '${catalogEntry.key}' resolved to non-positive dollars after legalization`);
    }

    let className = null;
    switch (catalogEntry.key) {
        case "pass_line": className = "BetPassLine"; break;
        case "dont_pass": className = "BetDontPass"; break;
        case "come": className = "BetCome"; break;
        case "dont_come": className = "BetDontCome"; break;
        case "field": className = "BetField"; break;
        default:
            if (catalogEntry.family === "place") className = "BetPlace";
            if (catalogEntry.family === "lay") className = "BetLay";
            if (catalogEntry.family === "hardway") className = "BetHardway";
            break;
    }

    if (!className) {
        throw new Error(`No vanilla mapping available for bet '${catalogEntry.key}'`);
    }

    return {
        className,
        args: { number: number !== undefined ? Number(number) : undefined, amount: legalized },
        dollars: legalized,
        family: catalogEntry.family,
        key: catalogEntry.key,
        number: number !== undefined ? Number(number) : undefined
    };
}

module.exports = {
    UnknownBetError,
    mapBetToApiAction,
    mapBetToVanillaSpec
};
