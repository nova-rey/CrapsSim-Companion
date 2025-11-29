module.exports = function(RED){
    function VarBankrollNode(config){
        RED.nodes.createNode(this, config);
        const node = this;
        node.on("input", function(msg, send, done){
            try{
                const amt = Number(config.amount || 0);
                msg.sim = msg.sim || {};
                msg.sim.bankroll = (amt > 0) ? amt : 300;
                node.status({fill:"green", shape:"dot", text:`bankroll=$${msg.sim.bankroll}`});
                send(msg); done();
            }catch(e){ done(e); }
        });
    }
    RED.nodes.registerType("var-bankroll", VarBankrollNode);
}
