const axios = require("axios");
const { getBetDefinition } = require("../lib/bet_surface");
const { getVarTable } = require("../vanilla/legalizer");
const { mapBetToApiAction, UnknownBetError } = require("../lib/bet_mapping");

function sanitizeInt(val) {
    const n = Number(val);
    return Number.isInteger(n) ? n : null;
}

function resolveSeed(seedMode, configSeed, msgSeed) {
    switch (seedMode) {
        case "from_msg":
            if (Number.isInteger(msgSeed)) return msgSeed;
            return Math.floor(Date.now() % 2147483647);
        case "fixed":
            if (Number.isInteger(configSeed)) return configSeed;
            return Math.floor(Date.now() % 2147483647);
        case "random":
        default:
            return Math.floor(Date.now() % 2147483647);
    }
}

function buildEffectiveConfig(apiConfigNode, msg) {
    const overrides = msg.api_config || {};
    const base_url = overrides.base_url || apiConfigNode?.base_url || "http://127.0.0.1:8000";
    const profile_id = msg.profile_id || overrides.profile_id || apiConfigNode?.profile_id || "default";
    const default_seed_mode = overrides.default_seed_mode || apiConfigNode?.default_seed_mode || "random";
    const seed = overrides.seed !== undefined ? overrides.seed : apiConfigNode?.seed;
    const timeout_ms = overrides.timeout_ms || apiConfigNode?.timeout_ms || 5000;
    const retries = overrides.retries || apiConfigNode?.retries || 0;
    const retry_backoff_ms = overrides.retry_backoff_ms || apiConfigNode?.retry_backoff_ms || 0;
    const auth_token = overrides.auth_token || apiConfigNode?.auth_token;

    return { base_url, profile_id, default_seed_mode, seed, timeout_ms, retries, retry_backoff_ms, auth_token };
}

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

async function runSimulation({
    msg,
    nodeConfig,
    apiConfigNode,
    node,
    httpClient = axios
}) {
    const errors = [];

    if (!msg.strategy_config) {
        const errMsg = "api-runner: missing msg.strategy_config";
        node?.error && node.error(errMsg, msg);
        const e = new Error(errMsg);
        e.fatal = true;
        throw e;
    }

    if (!apiConfigNode) {
        const errMsg = "api-runner: missing Craps API config";
        node?.error && node.error(errMsg, msg);
        const e = new Error(errMsg);
        e.fatal = true;
        throw e;
    }

    const flow = node?.context ? node.context().flow : { get: () => undefined };
    const strategyConfig = msg.strategy_config;
    const vt = (strategyConfig.table && Object.keys(strategyConfig.table || {}).length)
        ? strategyConfig.table
        : getVarTable(flow, msg);

    const effConfig = buildEffectiveConfig(apiConfigNode, msg);
    const effective_seed = resolveSeed(effConfig.default_seed_mode, effConfig.seed, msg.seed);
    const effective_profile_id = msg.profile_id || effConfig.profile_id || "default";
    const effective_timeout_ms = effConfig.timeout_ms || 5000;
    const base_url = effConfig.base_url;

    const targetRolls = sanitizeInt(msg.rolls) || sanitizeInt(msg.runs) || Number(nodeConfig.rolls) || 100;
    const strict_mode = Boolean(nodeConfig.strict_mode);
    const prepare_file_output = Boolean(nodeConfig.prepare_file_output);

    let sessionId = null;
    let bankroll_start = null;
    let bankroll_end = null;

    const startPayload = { seed: effective_seed, profile_id: effective_profile_id };

    let startResp;
    try {
        startResp = await doPost(httpClient, base_url, "/session/start", startPayload, effective_timeout_ms, effConfig.auth_token);
    } catch (err) {
        msg.api_error = {
            stage: "start",
            error: err.message,
            statusCode: err.response?.status,
            responseBody: err.response?.data
        };
        node?.error && node.error("Engine API HTTP error at start", msg);
        const e = new Error("start failed");
        e.fatal = true;
        throw e;
    }

    sessionId = extractSessionId(startResp);
    bankroll_start = extractBankroll(startResp);

    if (!sessionId) {
        const errMsg = "api-runner: session_id missing from start response";
        node?.error && node.error(errMsg, msg);
        const e = new Error(errMsg);
        e.fatal = true;
        throw e;
    }

    const journal = [];

    for (const bet of strategyConfig.bets || []) {
        const action = mapBetToAction(bet, vt, node);
        if (!action) continue;
        let resp;
        try {
            resp = await doPost(httpClient, base_url, "/session/apply_action", {
                session_id: sessionId,
                verb: action.verb,
                args: action.args
            }, effective_timeout_ms, effConfig.auth_token);
        } catch (err) {
            msg.api_error = {
                stage: "apply_action",
                error: err.message,
                statusCode: err.response?.status,
                responseBody: err.response?.data
            };
            node?.error && node.error("Engine API HTTP error at apply_action", msg);
            const e = new Error("apply_action failed");
            e.fatal = true;
            throw e;
        }

        const respErrors = Array.isArray(resp?.errors) ? resp.errors : [];
        if (respErrors.length) errors.push(...respErrors);
        if (strict_mode && respErrors.length) {
            break;
        }
    }

    let rolled = 0;
    let aborted = strict_mode && errors.length > 0;
    if (!aborted) {
        for (let i = 1; i <= targetRolls; i++) {
            let resp;
            try {
                resp = await doPost(httpClient, base_url, "/session/roll", { session_id: sessionId }, effective_timeout_ms, effConfig.auth_token);
            } catch (err) {
                msg.api_error = {
                    stage: "roll",
                    error: err.message,
                    statusCode: err.response?.status,
                    responseBody: err.response?.data
                };
                node?.error && node.error("Engine API HTTP error at roll", msg);
                const e = new Error("roll failed");
                e.fatal = true;
                throw e;
            }

            rolled = i;
            const respErrors = Array.isArray(resp?.errors) ? resp.errors : [];
            if (respErrors.length) errors.push(...respErrors);
            journal.push({
                index: i,
                ...resp
            });

            if (resp && resp.bankroll !== undefined) bankroll_end = resp.bankroll;
            if (strict_mode && respErrors.length) {
                aborted = true;
                break;
            }
        }
    }

    let endSessionSummary = null;
    try {
        endSessionSummary = await doPost(httpClient, base_url, "/end_session", { session_id: sessionId }, effective_timeout_ms, effConfig.auth_token);
        if (endSessionSummary && endSessionSummary.bankroll !== undefined && bankroll_end === null) {
            bankroll_end = endSessionSummary.bankroll;
        }
    } catch (err) {
        node?.warn && node.warn(`api-runner: end_session failed - ${err.message}`);
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

    const strategy_name = strategyConfig.strategy_name || nodeConfig.label || "unnamed_strategy";

    msg.sim_result = {
        strategy_name,
        seed: effective_seed,
        profile_id: effective_profile_id,
        rolls: rolls_executed,
        bankroll_start,
        bankroll_end,
        net,
        ev_per_roll,
        errors,
        end_summary: endSessionSummary || null
    };
    msg.sim_journal = journal;
    msg.payload = msg.sim_result;

    if (prepare_file_output) {
        const fileOutput = journal.map(entry => JSON.stringify(entry)).join("\n");
        msg.file_output = fileOutput;
        if (!msg.filename) {
            const safeName = (strategy_name || "strategy").toString().replace(/[^\w.-]+/g, "_");
            msg.filename = `${safeName}_${effective_seed}_journal.ndjson`;
        }
    }

    return msg;
}

module.exports = function(RED) {
    function ApiRunnerNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        node.status({});
        node.on("input", async function(msg, send, done) {
            const apiConfigNode = RED.nodes.getNode(config.apiConfig);
            try {
                const outMsg = await runSimulation({
                    msg,
                    nodeConfig: config,
                    apiConfigNode,
                    node,
                    httpClient: axios
                });
                node.status({ fill: "green", shape: "dot", text: `${outMsg.sim_result.rolls} rolls` });
                send(outMsg);
                done();
            } catch (err) {
                if (!err || !err.fatal) {
                    node.error(err, msg);
                }
                done();
            }
        });
    }

    RED.nodes.registerType("craps-api-runner", ApiRunnerNode);
};

module.exports._test = {
    resolveSeed,
    buildEffectiveConfig,
    mapBetToAction,
    extractSessionId,
    extractBankroll,
    runSimulation
};
