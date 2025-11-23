const assert = require("assert");
const nock = require("nock");

const apiRunner = require("../api-runner/api-runner.js");
const { runSimulation } = apiRunner._test;

function createNodeStub() {
    return {
        warnings: [],
        errors: [],
        warn(msg) { this.warnings.push(msg); },
        error(msg) { this.errors.push(msg); },
        context() { return { flow: { get: () => undefined } }; }
    };
}

function defaultMsg() {
    return {
        strategy_config: {
            strategy_name: "TestStrat",
            table: null,
            bets: [
                { key: "pass_line", base_amount: 10, unit_type: "units" },
                { key: "place_6", base_amount: 12, unit_type: "dollars", number: 6 }
            ]
        }
    };
}

async function testHappyPath() {
    const node = createNodeStub();
    const apiConfig = { base_url: "http://127.0.0.1:8000", profile_id: "default", default_seed_mode: "fixed", seed: 42 };
    const msg = defaultMsg();

    nock(apiConfig.base_url).post("/session/start").reply(200, { session_id: "abc", bankroll: 300 });
    const expectedVerbs = ["pass_line", "place"];
    nock(apiConfig.base_url).post("/session/apply_action", (body) => {
        const next = expectedVerbs.shift();
        assert(next, "More apply_action calls than expected");
        assert.strictEqual(body.verb, next, "Verb should come from mapping helper");
        assert(body.args && body.args.amount > 0, "Amount should be positive");
        if (body.verb === "place") {
            assert.strictEqual(body.args.number, 6, "Place bet should include number");
        }
        return true;
    }).twice().reply(200, { ok: true });
    nock(apiConfig.base_url).post("/session/roll").reply(200, { roll: 7, bankroll: 310 });
    nock(apiConfig.base_url).post("/session/roll").reply(200, { roll: 6, bankroll: 320 });
    nock(apiConfig.base_url).post("/session/roll").reply(200, { roll: 8, bankroll: 330 });
    nock(apiConfig.base_url).post("/end_session").reply(200, { bankroll: 330 });

    const out = await runSimulation({
        msg,
        nodeConfig: { rolls: 3, strict_mode: false, prepare_file_output: true },
        apiConfigNode: apiConfig,
        node,
        httpClient: require("axios")
    });

    assert.strictEqual(expectedVerbs.length, 0, "All expected verbs should be exercised");

    assert(out.sim_result);
    assert.strictEqual(out.sim_result.strategy_name, "TestStrat");
    assert.strictEqual(out.sim_result.rolls, 3);
    assert.strictEqual(out.sim_journal.length, 3);
    assert.strictEqual(out.sim_result.bankroll_start, 300);
    assert.strictEqual(out.sim_result.bankroll_end, 330);
    assert.strictEqual(out.sim_result.net, 30);
    assert(out.sim_result.ev_per_roll > 0 && out.sim_result.ev_per_roll <= 20);
    assert.deepStrictEqual(out.sim_result.errors, []);
    assert(out.file_output);
    assert(out.filename && out.filename.endsWith("journal.ndjson"));

    console.log("api-runner happy path passed");
}

async function testAggregatedErrors() {
    const node = createNodeStub();
    const apiConfig = { base_url: "http://127.0.0.1:8000", default_seed_mode: "random" };
    const msg = defaultMsg();

    nock(apiConfig.base_url).post("/session/start").reply(200, { session_id: "abc", bankroll: 100 });
    nock(apiConfig.base_url).post("/session/apply_action").reply(200, { errors: [{ code: "ILLEGAL_BET" }] });
    nock(apiConfig.base_url).post("/session/apply_action").reply(200, {});
    nock(apiConfig.base_url).post("/session/roll").once().reply(200, { bankroll: 110, errors: [{ code: "WARN" }] });
    nock(apiConfig.base_url).post("/end_session").reply(200, {});

    const out = await runSimulation({
        msg,
        nodeConfig: { rolls: 1, strict_mode: false, prepare_file_output: false },
        apiConfigNode: apiConfig,
        node,
        httpClient: require("axios")
    });

    assert.strictEqual(out.sim_result.rolls, 1);
    assert.strictEqual(out.sim_result.errors.length, 2);
    console.log("api-runner aggregation path passed");
}

async function testStrictModeAbort() {
    const node = createNodeStub();
    const apiConfig = { base_url: "http://127.0.0.1:8000", default_seed_mode: "random" };
    const msg = defaultMsg();

    nock(apiConfig.base_url).post("/session/start").reply(200, { session_id: "abc", bankroll: 100 });
    nock(apiConfig.base_url).post("/session/apply_action").reply(200, { errors: [{ code: "BAD" }] });
    nock(apiConfig.base_url).post("/end_session").reply(200, {});

    const out = await runSimulation({
        msg,
        nodeConfig: { rolls: 2, strict_mode: true, prepare_file_output: false },
        apiConfigNode: apiConfig,
        node,
        httpClient: require("axios")
    });

    assert.strictEqual(out.sim_result.rolls, 0);
    assert.strictEqual(out.sim_result.errors.length, 1);
    console.log("api-runner strict mode abort path passed");
}

async function testParityModeHappy() {
    const node = createNodeStub();
    const apiConfig = { base_url: "http://127.0.0.1:8000", default_seed_mode: "fixed", seed: 7 };
    const msg = defaultMsg();
    msg.dice_script = [[3, 4], [1, 1]];
    msg.roll_mode = "script";

    nock(apiConfig.base_url).post("/session/start").reply(200, { session_id: "abc", bankroll: 200 });
    nock(apiConfig.base_url).post("/session/apply_action").twice().reply(200, {});
    const rollsSeen = [];
    nock(apiConfig.base_url).post("/session/roll", (body) => {
        rollsSeen.push(body.dice);
        return true;
    }).twice().reply(200, { bankroll: 210 });
    nock(apiConfig.base_url).post("/end_session").reply(200, {});

    const out = await runSimulation({
        msg,
        nodeConfig: { rolls: 2, strict_mode: false, prepare_file_output: false },
        apiConfigNode: apiConfig,
        node,
        httpClient: require("axios")
    });

    assert.deepStrictEqual(rollsSeen, msg.dice_script);
    assert.strictEqual(out.sim_result.rolls, 2);
    console.log("api-runner parity mode happy path passed");
}

async function testParityModeFlagOnly() {
    const node = createNodeStub();
    const apiConfig = { base_url: "http://127.0.0.1:8000", default_seed_mode: "fixed", seed: 9 };
    const msg = defaultMsg();
    msg.dice_script = [[5, 2]];
    msg.parity_mode = true;

    nock(apiConfig.base_url).post("/session/start").reply(200, { session_id: "abc", bankroll: 150 });
    nock(apiConfig.base_url).post("/session/apply_action").twice().reply(200, {});
    const seenDice = [];
    nock(apiConfig.base_url).post("/session/roll", body => { seenDice.push(body.dice); return true; }).reply(200, { bankroll: 155 });
    nock(apiConfig.base_url).post("/end_session").reply(200, {});

    const out = await runSimulation({
        msg,
        nodeConfig: { rolls: 1, strict_mode: false, prepare_file_output: false },
        apiConfigNode: apiConfig,
        node,
        httpClient: require("axios")
    });

    assert.deepStrictEqual(seenDice, msg.dice_script);
    assert.strictEqual(out.sim_result.seed, 9);
    console.log("api-runner parity flag-only path passed");
}

async function testParityExhaustion() {
    const node = createNodeStub();
    const apiConfig = { base_url: "http://127.0.0.1:8000", default_seed_mode: "fixed", seed: 7 };
    const msg = defaultMsg();
    msg.dice_script = [[3, 4]];
    msg.roll_mode = "script";

    nock(apiConfig.base_url).post("/session/start").reply(200, { session_id: "abc", bankroll: 200 });
    nock(apiConfig.base_url).post("/session/apply_action").twice().reply(200, {});

    let threw = false;
    try {
        await runSimulation({
            msg,
            nodeConfig: { rolls: 2, strict_mode: false, prepare_file_output: false },
            apiConfigNode: apiConfig,
            node,
            httpClient: require("axios")
        });
    } catch (err) {
        threw = true;
        assert(msg.api_error);
        assert.strictEqual(msg.api_error.stage, "roll");
    }
    assert(threw, "expected exhaustion to throw");
    console.log("api-runner parity exhaustion path passed");
}

async function testParityValidationFailure() {
    const node = createNodeStub();
    const apiConfig = { base_url: "http://127.0.0.1:8000", default_seed_mode: "fixed", seed: 7 };
    const msg = defaultMsg();
    msg.dice_script = ["bad_entry"];
    msg.roll_mode = "script";

    let threw = false;
    try {
        await runSimulation({
            msg,
            nodeConfig: { rolls: 1, strict_mode: false, prepare_file_output: false },
            apiConfigNode: apiConfig,
            node,
            httpClient: require("axios")
        });
    } catch (err) {
        threw = true;
        assert(msg.api_error);
        assert.strictEqual(msg.api_error.stage, "preflight");
    }
    assert(threw, "expected validation to throw");
    console.log("api-runner parity validation failure path passed");
}

async function testHttpFailure() {
    const node = createNodeStub();
    const apiConfig = { base_url: "http://127.0.0.1:8000" };
    const msg = defaultMsg();

    nock(apiConfig.base_url).post("/session/start").reply(500, { message: "boom" });

    let threw = false;
    try {
        await runSimulation({
            msg,
            nodeConfig: { rolls: 1, strict_mode: false, prepare_file_output: false },
            apiConfigNode: apiConfig,
            node,
            httpClient: require("axios")
        });
    } catch (err) {
        threw = true;
        assert(msg.api_error);
        assert.strictEqual(msg.api_error.stage, "start");
    }
    assert(threw, "expected to throw on start failure");
    console.log("api-runner HTTP failure path passed");
}

(async () => {
    try {
        await testHappyPath();
        nock.cleanAll();
        await testAggregatedErrors();
        nock.cleanAll();
        await testStrictModeAbort();
        nock.cleanAll();
        await testHttpFailure();
        nock.cleanAll();
        await testParityModeHappy();
        nock.cleanAll();
        await testParityModeFlagOnly();
        nock.cleanAll();
        await testParityExhaustion();
        nock.cleanAll();
        await testParityValidationFailure();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
})();
