const { compileStrategyConfig, normalizeStrategyName } = require("../lib/strategy_compiler");
const { getVarTable } = require("../vanilla/legalizer");

module.exports = function(RED) {
    function StrategyCompilerNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.on("input", function(msg, send, done) {
            try {
                const flow = node.context().flow;
                const steps = (msg.recipe && Array.isArray(msg.recipe.steps)) ? msg.recipe.steps : [];

                const strategyName = msg.strategy_name || config.strategyName || "MyStrategy";
                const notes = msg.strategy_notes || config.notes || "";

                const { config: assembled, errors, warnings } = compileStrategyConfig({
                    steps,
                    strategyName,
                    table: msg.varTable,
                    metadata: { notes },
                    flow,
                    msg,
                    logger: node,
                    fallbackGetVarTable: getVarTable
                });

                if (warnings && warnings.length) {
                    for (const w of warnings) node.warn(w);
                }

                if (errors && errors.length) {
                    node.error(errors.join("; "));
                    return done();
                }

                if (!assembled || !assembled.bets || !assembled.bets.length) {
                    node.error("strategy-compiler: no bets to compile");
                    return done();
                }

                msg.strategy_config = assembled;
                msg.payload = assembled;
                node.status({ fill: "green", shape: "dot", text: `${normalizeStrategyName(strategyName)} (${assembled.bets.length} bets)` });
                send(msg);
                done();
            } catch (err) {
                node.error(err);
                done(err);
            }
        });
    }

    RED.nodes.registerType("strategy-compiler", StrategyCompilerNode);
};
