const axios = require("axios");
const { getVarTable } = require("../vanilla/legalizer");
const { runStrategyViaApi } = require("../lib/api_runner_core");

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

function buildSeedList({ msgSeeds, seed_start, seed_count }) {
    const validSeeds = (msgSeeds || []).filter(s => Number.isInteger(s));
    if (validSeeds.length) return validSeeds;
    if (Number.isInteger(seed_start) && Number.isInteger(seed_count) && seed_count > 0) {
        return Array.from({ length: seed_count }, (_, i) => seed_start + i);
    }
    return [];
}

function summarizeRun(sim_result) {
    const bankroll_start = sim_result.bankroll_start ?? null;
    const bankroll_end = sim_result.bankroll_end ?? null;
    const net = sim_result.net ?? (bankroll_end != null && bankroll_start != null ? bankroll_end - bankroll_start : null);
    return {
        seed: sim_result.seed,
        bankroll_start,
        bankroll_end,
        net,
        rolls: sim_result.rolls,
        ev_per_roll: sim_result.ev_per_roll ?? null,
        errors: sim_result.errors || []
    };
}

function aggregateBatch(batch) {
    if (!batch.length) return null;
    const nets = batch.map(r => Number(r.net) || 0);
    const mean_net = nets.reduce((a, b) => a + b, 0) / nets.length;
    const variance = nets.reduce((a, b) => a + Math.pow(b - mean_net, 2), 0) / nets.length;
    const stddev_net = Math.sqrt(variance);
    const min_net = Math.min(...nets);
    const max_net = Math.max(...nets);
    const winning_run_fraction = batch.filter(r => (r.net || 0) > 0).length / batch.length;
    return {
        runs: batch.length,
        mean_net,
        stddev_net,
        min_net,
        max_net,
        winning_run_fraction
    };
}

async function runBatch({
    msg,
    nodeConfig,
    apiConfigNode,
    node,
    httpClient = axios,
    strategyRunner = runStrategyViaApi
}) {
    if (!msg.strategy_config) {
        const errMsg = "batch-runner: missing msg.strategy_config";
        const e = new Error(errMsg);
        e.fatal = true;
        throw e;
    }
    if (!apiConfigNode) {
        const errMsg = "batch-runner: missing Craps API config";
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
    const effective_profile_id = msg.profile_id || effConfig.profile_id || "default";
    const effective_timeout_ms = effConfig.timeout_ms || 5000;
    const base_url = effConfig.base_url;
    const targetRolls = sanitizeInt(msg.rolls) || Number(nodeConfig.rolls) || 100;
    const strict_mode = Boolean(nodeConfig.strict_mode);
    const prepare_file_output = false;
    const roll_mode = msg.roll_mode || (msg.parity_mode ? "script" : undefined);

    const seeds = buildSeedList({
        msgSeeds: Array.isArray(msg.seeds) ? msg.seeds : [],
        seed_start: sanitizeInt(msg.seed_start) ?? sanitizeInt(nodeConfig.seed_start),
        seed_count: sanitizeInt(msg.seed_count) ?? sanitizeInt(nodeConfig.seed_count)
    });

    if (!seeds.length) {
        const errMsg = "batch-runner: missing seeds (provide seeds array or seed_start + seed_count)";
        msg.batch_error = { stage: "config", error: errMsg };
        const e = new Error(errMsg);
        e.fatal = true;
        throw e;
    }

    const batch_result = [];
    for (const seed of seeds) {
        const effective_seed = Number(seed);
        try {
            const result = await strategyRunner({
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
            const summary = summarizeRun({ ...result.sim_result, seed: effective_seed });
            batch_result.push(summary);
        } catch (err) {
            msg.batch_error = { stage: err?.api_error?.stage || "run", seed: seed, error: err.message };
            throw err;
        }
    }

    const batch_summary = aggregateBatch(batch_result) || {};
    batch_summary.bankroll_start = batch_result[0]?.bankroll_start ?? null;
    batch_summary.rolls_per_run = targetRolls;

    msg.batch_result = batch_result;
    msg.batch_summary = batch_summary;
    msg.payload = batch_summary;
    return msg;
}

module.exports = function(RED) {
    function BatchRunnerNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        node.status({});
        node.on("input", async function(msg, send, done) {
            const apiConfigNode = RED.nodes.getNode(config.apiConfig);
            try {
                const outMsg = await runBatch({
                    msg,
                    nodeConfig: config,
                    apiConfigNode,
                    node,
                    httpClient: axios
                });
                node.status({ fill: "green", shape: "dot", text: `${outMsg.batch_result.length} runs` });
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

    RED.nodes.registerType("craps-batch-runner", BatchRunnerNode);
};

module.exports._test = {
    buildSeedList,
    aggregateBatch,
    summarizeRun,
    runBatch
};
