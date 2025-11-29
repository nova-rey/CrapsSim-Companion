module.exports = function(RED){
    function VarMaxRollsNode(config){
        RED.nodes.createNode(this, config);
        const node = this;
        node.on("input", function(msg, send, done){
            try{
                const mode = config.mode || "infinite";
                const fixed = Number(config.value || 0);
                msg.sim = msg.sim || {};
                if(mode === "fixed" && fixed > 0){
                    msg.sim.max_rolls = fixed;
                    node.status({fill:"green", shape:"dot", text:`max_rolls=${fixed}`});
                } else {
                    msg.sim.max_rolls = "inf"; // exporter will convert to float("inf")
        node.status({fill:"green", shape:"ring", text:"max_rolls=∞"});
                }
                send(msg); done();
            }catch(e){ done(e); }
        });
    }
    RED.nodes.registerType("var-max-rolls", VarMaxRollsNode);
}
