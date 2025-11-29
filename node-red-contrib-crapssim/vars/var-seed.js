module.exports = function(RED){
    function VarSeedNode(config){
        RED.nodes.createNode(this, config);
        const node = this;

        function parseMaybeNumber(s){
            if (s === undefined || s === null) return null;
            const n = Number(s);
            return Number.isFinite(n) && String(n) === String(s).trim() ? n : String(s);
        }

        node.on("input", function(msg, send, done){
            try{
                const mode = config.mode || "none";
                msg.sim = msg.sim || {};

                if (mode === "none") {
                    delete msg.sim.seed;
                    node.status({fill:"grey", shape:"ring", text:"seed: none"});
                } else if (mode === "fixed") {
                    const raw = (config.value ?? "").toString().trim();
                    if (!raw) {
                        // No value set; treat as none
                        delete msg.sim.seed;
                        node.status({fill:"yellow", shape:"ring", text:"seed: (empty) → none"});
                    } else {
                        msg.sim.seed = parseMaybeNumber(raw);
                        node.status({fill:"green", shape:"dot", text:`seed: ${msg.sim.seed}`});
                    }
                } else if (mode === "random") {
                    // 1..2^31-1
                    const rnd = Math.floor(Math.random() * 2147483647) + 1;
                    msg.sim.seed = rnd;
                    node.status({fill:"green", shape:"dot", text:`seed: ${rnd}`});
                } else {
                    // Fallback to none
                    delete msg.sim.seed;
                    node.status({fill:"grey", shape:"ring", text:"seed: none"});
                }

                send(msg); done();
            } catch (e) { done(e); }
        });
    }
    RED.nodes.registerType("var-seed", VarSeedNode);
}
