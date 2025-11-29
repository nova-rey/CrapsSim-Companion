module.exports = function(RED) {
    function RollMarkerNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.on("input", function(msg, send, done) {
            try {
                const title = (config.title || "").trim();
                const note  = (config.note  || "").trim();

                // append to recipe
                msg.recipe = msg.recipe || { steps: [] };
                const step = { type: "roll" };
                if (title) step.title = title;
                if (note)  step.note  = note;
                msg.recipe.steps.push(step);

                node.status({fill:"green", shape:"dot", text: title ? `Roll: ${title}` : "Roll"});
                send(msg);
                done();
            } catch (err) {
                done(err);
            }
        });
    }

    RED.nodes.registerType("roll-marker", RollMarkerNode);
}
