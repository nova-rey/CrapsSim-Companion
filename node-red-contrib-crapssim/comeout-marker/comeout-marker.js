module.exports = function(RED) {
    const PHASE = "comeout";
    function MarkerNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        node.on("input", function(msg, send, done) {
            try {
                const action = (config.action || "begin");
                const title  = (config.title || "").trim();
                const note   = (config.note  || "").trim();

                msg.recipe = msg.recipe || { steps: [] };
                const step = { type: "section", phase: PHASE, action };
                if (title) step.title = title;
                if (note)  step.note  = note;
                msg.recipe.steps.push(step);

                // optional breadcrumb; sim can ignore
                msg.phase = { current: PHASE, lastAction: action };

                node.status({fill:"green", shape:"dot", text:`Come-Out: ${action}`});
                send(msg); done();
            } catch (e) { done(e); }
        });
    }
    RED.nodes.registerType("comeout-marker", MarkerNode);
}
