module.exports = function(RED) {
    function ValIntNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.on("input", function(msg, send, done) {
            try {
                const value   = Number(config.value || 0);
                const nameKey = (config.nameKey || "").trim();
                const evoMode = Number(config.evoMode || 0);

                msg.value = value;
                msg.var = { name: nameKey || undefined, type: "int", value, unitType: "units", evo: { mode: evoMode } };

                if (nameKey) {
                    msg.vars = msg.vars || {};
                    msg.vars[nameKey] = { value, unitType: "units", evo: { mode: evoMode } };
                }

                node.status({fill:"green", shape:"dot", text:`int=${value}${nameKey? " ["+nameKey+"]":""}`});
                send(msg); done();
            } catch (err) { done(err); }
        });
    }
    RED.nodes.registerType("val-int", ValIntNode);
}
