const { getBetDefinition, isSupported, allowedNumbers } = require("./bet_surface");
const { getVarTable } = require("../vanilla/legalizer");
const pkg = require("../package.json");

function requiresNumber(def) {
    return !!def && !!def.requires_number;
}

function normalizeStrategyName(name, fallback = "MyStrategy") {
    const raw = (name || fallback || "MyStrategy").toString();
    return raw.replace(/[^A-Za-z0-9_]/g, "_");
}

function buildMetadata(input = {}) {
    const meta = { created_by: "node-red-contrib-craps" };
    meta.version = pkg.version || null;

    for (const [k, v] of Object.entries(input)) {
        if (v !== undefined && v !== null && v !== "") {
            meta[k] = v;
        }
    }
    return meta;
}

function compileStrategyConfig({
    steps = [],
    strategyName,
    table,
    metadata,
    flow,
    msg,
    logger = {},
    fallbackGetVarTable = getVarTable
} = {}) {
    const warn = logger.warn || (() => {});
    const errorLog = logger.error || (() => {});
    const errs = [];
    const warnings = [];

    const vt = table || (fallbackGetVarTable ? fallbackGetVarTable(flow, msg) : undefined);

    const bets = [];
    for (const step of steps || []) {
        if (!step || typeof step !== "object") continue;
        const type = step.type;
        const def = getBetDefinition(type);
        if (!def) {
            errs.push(`Unknown bet type '${type}'`);
            continue;
        }

        const baseAmount = Number(step.amount);
        if (!(baseAmount > 0)) {
            errs.push(`Bet '${type}' is missing a positive amount`);
            continue;
        }

        const unitType = step.unitType || step.unit_type;
        if (!unitType || !["units", "dollars"].includes(unitType)) {
            errs.push(`Bet '${type}' must specify unit_type as 'units' or 'dollars'`);
            continue;
        }

        const number = step.number ?? step.point ?? def.number;
        if (requiresNumber(def)) {
            if (!allowedNumbers.has(Number(number))) {
                errs.push(`Bet '${type}' requires a valid point number (4,5,6,8,9,10)`);
                continue;
            }
        }

        if (!isSupported(def.key)) {
            const msgWarn = `Bet key ${def.key} is not currently supported by the exporter`;
            warnings.push(msgWarn);
            warn(msgWarn);
        }

        bets.push({
            key: def.key,
            base_amount: baseAmount,
            unit_type: unitType,
            number: number ?? null,
            bet_id: step.betId ?? step.bet_id ?? null,
            note: step.note ?? null
        });
    }

    if (!bets.length) {
        errs.push("strategy_config requires at least one bet entry");
    }

    if (errs.length) {
        errorLog(errs.join("; "));
        return { config: null, errors: errs, warnings };
    }

    const strategy_config = {
        strategy_name: normalizeStrategyName(strategyName),
        table: vt,
        bets,
        metadata: buildMetadata(metadata)
    };

    return { config: strategy_config, errors: [], warnings };
}

module.exports = {
    compileStrategyConfig,
    normalizeStrategyName,
    buildMetadata
};
