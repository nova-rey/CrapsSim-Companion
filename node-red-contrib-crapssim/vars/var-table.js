module.exports = function(RED) {
    function VarTableNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        function toConfig(mode) {
            const bubble = mode === "bubble";
            const multiplier = bubble ? 1 : Number(mode); // table min dollars per "unit"

            return {
                mode,
                multiplier,
                bubble,
                place68Increment: bubble ? 1 : 6,
                rules: {
                    tableMinMultiple: bubble ? 1 : multiplier,
                    placeIncrements: bubble
                    ? {4:1,5:1,6:1,8:1,9:1,10:1}
                    : {4:5,5:5,6:6,8:6,9:5,10:5},
                    layIncrement: bubble ? 1 : 5,
                    propIncrement: bubble ? 1 : multiplier,
                    flatIncrement: bubble ? 1 : multiplier,
                    oddsPolicy: {
                        enabled: !bubble,
                        maxMultiple: {4:3,5:4,6:5,8:5,9:4,10:3}
                    }
                }
            };
        }

        // Cache to flow on deploy/init
        const initial = toConfig(config.mode || "10");
        node.context().flow.set("varTable", initial);

        node.on('input', function(msg, send, done) {
            const mode =
            (typeof msg.mode === "string" && msg.mode.length) ? msg.mode :
            (config.mode || "10");

            const vt = toConfig(mode);
            msg.varTable = vt;
            node.context().flow.set("varTable", vt);
            send(msg);
            done && done();
        });
    }

    RED.nodes.registerType("var-table", VarTableNode);
};
