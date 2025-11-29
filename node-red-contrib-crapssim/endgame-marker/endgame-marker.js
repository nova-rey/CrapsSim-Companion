module.exports = function(RED) {
    const PHASE = "endgame";
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

                msg.phase = { current: PHASE, lastAction: action };

                node.status({fill:"green", shape:"dot", text:`End Game: ${action}`});
                send(msg); done();
            } catch (e) { done(e); }
        });
    }
    RED.nodes.registerType("endgame-marker", MarkerNode);
}
