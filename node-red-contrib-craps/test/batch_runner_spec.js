const assert = require("assert");
const batchRunner = require("../api-runner/batch-runner.js")._test;

function createNodeStub() {
    return {
        warnings: [],
        errors: [],
        warn(msg) { this.warnings.push(msg); },
        error(msg) { this.errors.push(msg); },
        context() { return { flow: { get: () => undefined } }; }
    };
}

function buildStrategy() {
    return { strategy_name: "Test", bets: [] };
}

async function testSeedListBatch() {
    const runs = [];
    const stubRunner = async ({ apiConfig, rolls }) => {
        runs.push({ seed: apiConfig.seed, rolls });
        return {
            sim_result: {
                seed: apiConfig.seed,
                bankroll_start: 100,
                bankroll_end: 110 + apiConfig.seed,
                net: 10 + apiConfig.seed,
                rolls,
                errors: []
            },
            sim_journal: []
        };
    };

    const msg = { strategy_config: buildStrategy(), seeds: [101, 102, 103] };
    const out = await batchRunner.runBatch({
        msg,
        nodeConfig: { rolls: 2 },
        apiConfigNode: { base_url: "http://example.com" },
        node: createNodeStub(),
        strategyRunner: stubRunner
    });

    assert.strictEqual(out.batch_result.length, 3);
    assert.deepStrictEqual(runs.map(r => r.seed), [101, 102, 103]);
    assert(out.batch_summary);
    assert.strictEqual(out.batch_summary.runs, 3);
    assert.strictEqual(out.batch_summary.min_net, 111); // 10 + seed
    assert.strictEqual(out.batch_summary.max_net, 113);
    console.log("batch-runner seed list test passed");
}

async function testGeneratedSeeds() {
    const seedsUsed = [];
    const stubRunner = async ({ apiConfig }) => {
        seedsUsed.push(apiConfig.seed);
        return {
            sim_result: { seed: apiConfig.seed, bankroll_start: 50, bankroll_end: 55, net: 5, rolls: 1, errors: [] },
            sim_journal: []
        };
    };

    const msg = { strategy_config: buildStrategy(), seed_start: 1000, seed_count: 2 };
    await batchRunner.runBatch({
        msg,
        nodeConfig: { rolls: 1 },
        apiConfigNode: { base_url: "http://example.com" },
        node: createNodeStub(),
        strategyRunner: stubRunner
    });

    assert.deepStrictEqual(seedsUsed, [1000, 1001]);
    console.log("batch-runner generated seeds test passed");
}

async function testMissingSeedsError() {
    const msg = { strategy_config: buildStrategy() };
    let threw = false;
    try {
        await batchRunner.runBatch({
            msg,
            nodeConfig: { rolls: 1 },
            apiConfigNode: { base_url: "http://example.com" },
            node: createNodeStub(),
            strategyRunner: async () => ({})
        });
    } catch (err) {
        threw = true;
        assert(msg.batch_error);
        assert.strictEqual(msg.batch_error.stage, "config");
    }
    assert(threw, "expected missing seeds to throw");
    console.log("batch-runner missing seeds test passed");
}

async function testFatalRunStopsBatch() {
    const msg = { strategy_config: buildStrategy(), seeds: [1, 2, 3] };
    let attempts = 0;
    const stubRunner = async ({ apiConfig }) => {
        attempts += 1;
        if (apiConfig.seed === 2) {
            const e = new Error("boom");
            e.api_error = { stage: "roll" };
            throw e;
        }
        return {
            sim_result: { seed: apiConfig.seed, bankroll_start: 0, bankroll_end: 0, net: 0, rolls: 1, errors: [] },
            sim_journal: []
        };
    };

    let threw = false;
    try {
        await batchRunner.runBatch({
            msg,
            nodeConfig: { rolls: 1 },
            apiConfigNode: { base_url: "http://example.com" },
            node: createNodeStub(),
            strategyRunner: stubRunner
        });
    } catch (err) {
        threw = true;
        assert.strictEqual(msg.batch_error.seed, 2);
        assert.strictEqual(msg.batch_error.stage, "roll");
    }
    assert(threw, "expected fatal error to halt batch");
    assert.strictEqual(attempts, 2);
    console.log("batch-runner fatal stop test passed");
}

(async () => {
    try {
        await testSeedListBatch();
        await testGeneratedSeeds();
        await testMissingSeedsError();
        await testFatalRunStopsBatch();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
})();
