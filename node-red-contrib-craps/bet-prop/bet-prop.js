const { getBetDefinition, isSupported, allowedNumbers } = require("../lib/bet_surface");

const hardwayNumbers = new Set([4, 6, 8, 10]);

module.exports = function(RED) {
    function resolveCanonical(kind, number) {
        const k = String(kind || "").toLowerCase();
        const n = Number(number);
        const hasHardwayPoint = hardwayNumbers.has(n) || allowedNumbers.has(n);
        switch (k) {
            case "hardway": return hasHardwayPoint ? `hardway_${n}` : null;
            case "any7": return "prop_any7";
            case "anycraps": return "prop_any_craps";
            case "yo11": return "prop_yo11";
            case "aces": return "prop_aces";
            case "boxcars": return "prop_boxcars";
            case "acedeuce": return "prop_ace_deuce";
            case "horn": return "prop_horn";
            case "hornhigh": return "prop_horn_high";
            case "hop": return "prop_hop_generic";
            case "prop": return "prop_other";
            default: return null;
        }
    }

    function BetPropNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        function pullFeed(msg, betId) {
            if (msg && typeof msg === "object") {
                if (msg.var && typeof msg.var === "object" && typeof msg.var.value === "number") {
                    return { amount: msg.var.value, unitType: msg.var.unitType || "units" };
                }
                if (betId && msg.vars && typeof msg.vars === "object" && msg.vars[betId]) {
                    const v = msg.vars[betId];
                    if (typeof v.value === "number") {
                        return { amount: v.value, unitType: v.unitType || "units" };
                    }
                }
                if (typeof msg.amount === "number") {
                    return { amount: msg.amount, unitType: msg.unitType || "units" };
                }
            }
            return null;
        }

        node.on("input", function(msg, send, done) {
            try {
                const kind   = config.propKind || "Hardway";
                const numberRaw = (kind === "Hardway" && config.number !== "" && config.number !== null)
                ? Number(config.number) : undefined;
                const betId  = (config.betId || "").trim();
                const note   = (config.note || "").trim();

                let amount, unitType;
                if (config.valueSource === "fixed") {
                    amount   = Number(config.amount || 0);
                    unitType = config.unitType || "units";
                } else {
                    const fed = pullFeed(msg, betId);
                    if (!fed) { node.warn("bet-prop: no amount (set fixed or send feed)"); return done(); }
                    amount   = Number(fed.amount);
                    unitType = fed.unitType || "units";
                }

                const canonical = resolveCanonical(kind, numberRaw);
                if (!canonical) { node.error(`bet-prop: unknown prop kind '${kind}' or missing number`); return done(); }
                const def = getBetDefinition(canonical);
                if (!def) { node.error(`bet-prop: bet type '${canonical}' not found in catalog`); return done(); }

                const number = Number.isFinite(numberRaw) ? numberRaw : (def.number !== undefined ? def.number : undefined);
                if (def.family === "hardway" && !hardwayNumbers.has(Number(number))) {
                    node.error(`bet-prop: number required for hardway bet '${canonical}'`);
                    return done();
                }

                if (!isSupported(canonical)) {
                    node.warn(`Bet type '${canonical}' is currently unsupported and may be ignored by the exporter.`);
                }

                msg.recipe = msg.recipe || { steps: [] };
                const step = { type: canonical, amount, unitType };
                if (number !== undefined && !Number.isNaN(number)) step.number = Number(number);
                if (betId) step.betId = betId;
                if (note)  step.note  = note;

                msg.recipe.steps.push(step);
                const label = def.friendly_name || canonical;
                node.status({fill:"green", shape:"dot", text:`${label}${step.number? " "+step.number:""}: ${amount} ${unitType}`});
                send(msg); done();
            } catch (err) { done(err); }
        });
    }
    RED.nodes.registerType("bet-prop", BetPropNode);
}
