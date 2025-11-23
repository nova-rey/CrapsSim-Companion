const axios = require("axios");
const { getVarTable } = require("../vanilla/legalizer");
const { runStrategyViaApi, mapBetToAction, extractSessionId, extractBankroll } = require("../lib/api_runner_core");

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

async function runSimulation({
    msg,
    nodeConfig,
    apiConfigNode,
    node,
    httpClient = axios
}) {
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
    const roll_mode = msg.roll_mode || (msg.parity_mode ? "script" : undefined);

    try {
        const result = await runStrategyViaApi({
            strategyConfig,
            apiConfig: {
                base_url,
                profile_id: effective_profile_id,
                seed: effective_seed,
                timeout_ms: effective_timeout_ms,
                auth_token: effConfig.auth_token
            },
            varTable: vt,
            rolls: targetRolls,
            strict_mode,
            prepare_file_output,
            roll_mode,
            parity_mode: msg.parity_mode,
            dice_script: msg.dice_script,
            httpClient,
            logger: node
        });

        const strategy_name = strategyConfig.strategy_name || nodeConfig.label || result.sim_result.strategy_name;
        msg.sim_result = {
            ...result.sim_result,
            strategy_name
        };
        msg.sim_result.seed = effective_seed;
        msg.sim_result.profile_id = effective_profile_id;
        msg.sim_journal = result.sim_journal;
        msg.payload = msg.sim_result;
        if (prepare_file_output) {
            msg.file_output = result.file_output;
            msg.filename = result.filename;
        }
        return msg;
    } catch (err) {
        if (err.api_error) {
            msg.api_error = err.api_error;
        }
        throw err;
    }
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
