const axios = require("axios");
const { getBetDefinition } = require("./bet_surface");
const { mapBetToApiAction, UnknownBetError } = require("./bet_mapping");

function mapBetToAction(bet, vt, logger) {
    const def = getBetDefinition(bet.key);
    try {
        return mapBetToApiAction(bet, def, { varTable: vt, logger });
    } catch (err) {
        if (err instanceof UnknownBetError) {
            logger && logger.warn && logger.warn(`api-runner: unknown bet key '${bet?.key}'`);
            return null;
        }
        logger && logger.warn && logger.warn(`api-runner: skipping bet '${bet?.key}': ${err.message}`);
        return null;
    }
}

async function doPost(client, baseUrl, path, data, timeout_ms, auth_token) {
    const url = `${baseUrl.replace(/\/$/, "")}${path}`;
    const headers = { "Content-Type": "application/json" };
    if (auth_token) headers["Authorization"] = `Bearer ${auth_token}`;
    const res = await client.post(url, data, { timeout: timeout_ms, headers });
    return res.data;
}

function extractSessionId(payload) {
    if (!payload) return null;
    if (payload.session_id) return payload.session_id;
    if (payload.sessionId) return payload.sessionId;
    if (payload.session?.id) return payload.session.id;
    if (payload.data?.session?.id) return payload.data.session.id;
    return null;
}

function extractBankroll(payload) {
    if (!payload || typeof payload !== "object") return null;
    if (payload.bankroll !== undefined) return payload.bankroll;
    if (payload.session?.bankroll !== undefined) return payload.session.bankroll;
    if (payload.data?.bankroll !== undefined) return payload.data.bankroll;
    return null;
}

function buildStageError(stage, err, message) {
    const e = new Error(message || err?.message || stage);
    e.fatal = true;
    e.api_error = {
        stage,
        error: err?.message || message,
        statusCode: err?.response?.status,
        responseBody: err?.response?.data
    };
    return e;
}

function validateDiceScript(dice_script) {
    if (!Array.isArray(dice_script)) {
        throw buildStageError("preflight", new Error("dice_script must be an array"));
    }
    dice_script.forEach((entry, idx) => {
        if (!Array.isArray(entry) || entry.length !== 2) {
            throw buildStageError("preflight", new Error(`Invalid dice_script entry at index ${idx}`));
        }
        const [d1, d2] = entry;
        if (![d1, d2].every(v => Number.isInteger(v) && v >= 1 && v <= 6)) {
            throw buildStageError("preflight", new Error(`Invalid dice_script entry at index ${idx}`));
        }
    });
    return dice_script.map(pair => [Number(pair[0]), Number(pair[1])]);
}

async function runStrategyViaApi({
    strategyConfig,
    apiConfig = {},
    varTable,
    rolls = 100,
    strict_mode = false,
    prepare_file_output = false,
    roll_mode,
    parity_mode,
    dice_script,
    httpClient = axios,
    logger
} = {}) {
    if (!strategyConfig) {
        throw buildStageError("preflight", new Error("api-runner: missing strategy_config"));
    }
    const base_url = apiConfig.base_url || "http://127.0.0.1:8000";
    const profile_id = apiConfig.profile_id || "default";
    const seed = apiConfig.seed;
    const timeout_ms = apiConfig.timeout_ms || 5000;
    const auth_token = apiConfig.auth_token;

    const useScript = roll_mode === "script" || parity_mode === true;
    const diceScript = useScript ? validateDiceScript(dice_script || []) : null;

    const errors = [];
    const targetRolls = Number.isInteger(rolls) ? rolls : 0;

    const startPayload = { seed, profile_id };
    let startResp;
    try {
        startResp = await doPost(httpClient, base_url, "/session/start", startPayload, timeout_ms, auth_token);
    } catch (err) {
        throw buildStageError("start", err, "start failed");
    }

    const sessionId = extractSessionId(startResp);
    let bankroll_start = extractBankroll(startResp);
    let bankroll_end = bankroll_start;

    if (!sessionId) {
        throw buildStageError("start", new Error("api-runner: session_id missing from start response"));
    }

    const journal = [];

    for (const bet of strategyConfig.bets || []) {
        const action = mapBetToAction(bet, varTable, logger);
        if (!action) continue;
        let resp;
        try {
            resp = await doPost(httpClient, base_url, "/session/apply_action", {
                session_id: sessionId,
                verb: action.verb,
                args: action.args
            }, timeout_ms, auth_token);
        } catch (err) {
            throw buildStageError("apply_action", err, "apply_action failed");
        }

        const respErrors = Array.isArray(resp?.errors) ? resp.errors : [];
        if (respErrors.length) errors.push(...respErrors);
        if (strict_mode && respErrors.length) {
            break;
        }
    }

    let aborted = strict_mode && errors.length > 0;
    if (!aborted) {
        for (let i = 1; i <= targetRolls; i++) {
            let resp;
            const payload = { session_id: sessionId };
            if (useScript) {
                if (!diceScript || diceScript[i - 1] === undefined) {
                    throw buildStageError("roll", new Error(`dice_script exhausted at roll ${i}`));
                }
                payload.dice = diceScript[i - 1];
            }
            try {
                resp = await doPost(httpClient, base_url, "/session/roll", payload, timeout_ms, auth_token);
            } catch (err) {
                throw buildStageError("roll", err, "roll failed");
            }

            const respErrors = Array.isArray(resp?.errors) ? resp.errors : [];
            if (respErrors.length) errors.push(...respErrors);
            journal.push({ index: i, ...resp });

            if (resp && resp.bankroll !== undefined) bankroll_end = resp.bankroll;
            if (strict_mode && respErrors.length) {
                aborted = true;
                break;
            }
        }

        if (useScript && diceScript && diceScript.length > targetRolls && logger && logger.warn) {
            logger.warn(`api-runner: unused dice_script entries (${diceScript.length - targetRolls})`);
        }
    }

    let endSessionSummary = null;
    try {
        endSessionSummary = await doPost(httpClient, base_url, "/end_session", { session_id: sessionId }, timeout_ms, auth_token);
        if (endSessionSummary && endSessionSummary.bankroll !== undefined && bankroll_end === null) {
            bankroll_end = endSessionSummary.bankroll;
        }
    } catch (err) {
        logger && logger.warn && logger.warn(`api-runner: end_session failed - ${err.message}`);
    }

    if (bankroll_end === null) {
        const last = journal[journal.length - 1];
        if (last && last.bankroll !== undefined) bankroll_end = last.bankroll;
    }

    if (bankroll_start === null) {
        const first = startResp && extractBankroll(startResp);
        if (first !== null) bankroll_start = first;
    }

    const net = (bankroll_end != null && bankroll_start != null) ? bankroll_end - bankroll_start : null;
    const rolls_executed = journal.length;
    const ev_per_roll = (net != null && rolls_executed > 0) ? net / rolls_executed : null;

    const strategy_name = strategyConfig.strategy_name || "unnamed_strategy";

    const sim_result = {
        strategy_name,
        seed: seed ?? null,
        profile_id,
        rolls: rolls_executed,
        bankroll_start,
        bankroll_end,
        net,
        ev_per_roll,
        errors,
        end_summary: endSessionSummary || null
    };

    const result = { sim_result, sim_journal: journal };

    if (prepare_file_output) {
        const fileOutput = journal.map(entry => JSON.stringify(entry)).join("\n");
        result.file_output = fileOutput;
        if (!result.filename) {
            const safeName = (strategy_name || "strategy").toString().replace(/[^\w.-]+/g, "_");
            result.filename = `${safeName}_${seed || "seed"}_journal.ndjson`;
        }
    }

    return result;
}

module.exports = {
    mapBetToAction,
    doPost,
    extractSessionId,
    extractBankroll,
    validateDiceScript,
    runStrategyViaApi
};
