module.exports = function(RED) {
    function BetInNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.on('input', function(msg, send, done) {
            try {
                const betId = (config.betId || "").trim();
                if (!betId) {
                    node.status({fill:"red",shape:"ring",text:"Bet ID required"});
                    return done();
                }
                const v = Number(msg.value);
                const ut = (msg.unitType || "").toLowerCase();
                if (!Number.isInteger(v)) {
                    node.status({fill:"red",shape:"ring",text:"msg.value integer required"});
                    node.warn("bet-in: msg.value must be an integer");
                    return done();
                }
                if (ut !== "unit" && ut !== "dollars") {
                    node.status({fill:"red",shape:"ring",text:"msg.unitType unit|dollars"});
                    node.warn("bet-in: msg.unitType must be 'unit' or 'dollars'");
                    return done();
                }
                const store = node.context().flow.get("__betFeed") || {};
                store[betId] = {
                    value: v,
                unitType: ut,
                var: (msg.var && typeof msg.var === "object") ? msg.var : undefined,
                ts: Date.now()
                };
                node.context().flow.set("__betFeed", store);
                node.status({fill:"green",shape:"dot",text:`${betId} = ${v} [${ut}]`});
                done();
            } catch (err) { done(err); }
        });
    }
    RED.nodes.registerType("bet-in", BetInNode);
}
