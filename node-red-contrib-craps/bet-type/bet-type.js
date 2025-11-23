const { getBetDefinition, isSupported, allowedNumbers } = require("../lib/bet_surface");

module.exports = function(RED) {
    function resolveCanonical(kind, number) {
        const k = String(kind || "").toLowerCase();
        const n = Number(number);
        const hasPoint = allowedNumbers.has(n);
        switch (k) {
            case "pass": return "pass_line";
            case "dontpass":
            case "don'tpass":
            case "dont_pass": return "dont_pass";
            case "come": return "come";
            case "dontcome":
            case "don'tcome":
            case "dont_come": return "dont_come";
            case "field": return "field";
            case "place": return hasPoint ? `place_${n}` : null;
            case "lay": return hasPoint ? `lay_${n}` : null;
            case "passodds": return "odds_pass_line";
            case "dontpassodds": return "odds_dont_pass";
            case "comeodds": return "odds_come";
            case "dontcomeodds": return "odds_dont_come";
            default: return null;
        }
    }

    function BetTypeNode(config) {
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
                const kind   = config.kind || "Pass";
                const numberRaw = (config.number !== "" && config.number !== null) ? Number(config.number) : undefined;
                const betId  = (config.betId || "").trim();
                const note   = (config.note || "").trim();

                let amount, unitType;
                if (config.valueSource === "fixed") {
                    amount   = Number(config.amount || 0);
                    unitType = config.unitType || "units";
                } else {
                    const fed = pullFeed(msg, betId);
                    if (!fed) { node.warn("bet-type: no amount (set fixed or send feed)"); return done(); }
                    amount   = Number(fed.amount);
                    unitType = fed.unitType || "units";
                }

                const canonical = resolveCanonical(kind, numberRaw);
                if (!canonical) { node.error(`bet-type: unknown bet kind '${kind}' or missing number`); return done(); }
                const def = getBetDefinition(canonical);
                if (!def) { node.error(`bet-type: bet type '${canonical}' not found in catalog`); return done(); }

                const number = Number.isFinite(numberRaw) ? numberRaw : (def.number !== undefined ? def.number : undefined);
                if (def.family && ["place", "lay", "hardway", "odds"].includes(def.family) && def.dynamic_point !== true) {
                    if (!allowedNumbers.has(Number(number))) {
                        node.error(`bet-type: number required for ${def.family} bet '${canonical}'`);
                        return done();
                    }
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
    RED.nodes.registerType("bet-type", BetTypeNode);
}
