const { getBetDefinition, allowedNumbers } = require("../lib/bet_surface");

module.exports = function(RED) {
    function asInt(n) {
        const v = Number(n);
        return Number.isFinite(v) ? Math.round(v) : undefined;
    }

    function normalizeLegacyType(t, point) {
        const s = String(t || "").toLowerCase().replace(/\s+/g, "_");
        const num = asInt(point);
        if (s === "pass" || s === "betpassline" || s === "bet_pass" || s === "passline") return { key: "pass_line", number: num };
        if (s === "dontpass" || s === "dont_pass" || s === "don't_pass" || s === "betdontpass") return { key: "dont_pass", number: num };
        if (s === "come" || s === "betcome") return { key: "come", number: num };
        if (s === "dontcome" || s === "dont_come" || s === "don't_come" || s === "betdontcome") return { key: "dont_come", number: num };
        if (s === "field" || s === "betfield") return { key: "field", number: num };
        if (s === "place" || s === "betplace") return allowedNumbers.has(num) ? { key: `place_${num}`, number: num } : { family: "place", number: num };
        if (s === "lay" || s === "betlay") return allowedNumbers.has(num) ? { key: `lay_${num}`, number: num } : { family: "lay", number: num };
        if (s === "hardway" || s === "hard" || s === "bethardway") return [4, 6, 8, 10].includes(num) ? { key: `hardway_${num}`, number: num } : { family: "hardway", number: num };
        if (s === "prop" || s === "proposition") return { family: "prop", key: "prop_other", number: num };
        if (s === "odds") return { family: "odds", key: "odds_pass_line", number: num };
        return { key: null, number: num };
    }

    function expandTypes(typeTokens) {
        const keySet = new Set();
        const familySet = new Set();
        for (const t of typeTokens) {
            const raw = (t || "").toString();
            const def = getBetDefinition(raw);
            if (def) { keySet.add(def.key); continue; }
            const norm = normalizeLegacyType(raw);
            if (norm.key && getBetDefinition(norm.key)) { keySet.add(norm.key); continue; }
            if (norm.family) { familySet.add(norm.family); continue; }
            const s = raw.toLowerCase();
            if (["place", "lay", "hardway", "prop", "odds", "line", "field"].includes(s)) familySet.add(s === "line" ? "line" : s);
        }
        return { keySet, familySet };
    }

    function canonicalizeBet(bet) {
        if (!bet) return { key: null, def: null, number: undefined };
        const number = asInt(bet.number != null ? bet.number : bet.point);
        const direct = getBetDefinition(bet.type);
        if (direct) {
            const num = number !== undefined ? number : direct.number;
            return { key: direct.key, def: direct, number: num };
        }
        const fallback = normalizeLegacyType(bet.type, number);
        if (fallback.key) {
            const def = getBetDefinition(fallback.key);
            if (def) return { key: def.key, def, number: fallback.number !== undefined ? fallback.number : def.number };
        }
        return { key: null, def: null, number };
    }

    function makePredicate(cfg, runtimeClear) {
        const mode = (runtimeClear && runtimeClear.all) ? "all" : (cfg.mode || "all");

        if (mode === "all") {
            return () => true; // remove everything
        }

        const selTypesCfg = Array.isArray(cfg.types) ? cfg.types : (typeof cfg.types === "string" ? cfg.types.split(",") : []);
        const selPointsCfg = Array.isArray(cfg.points) ? cfg.points : (typeof cfg.points === "string" ? cfg.points.split(",") : []);
        const selTypesRun = Array.isArray(runtimeClear?.types) ? runtimeClear.types : [];
        const selPointsRun = Array.isArray(runtimeClear?.points) ? runtimeClear.points : [];

        const typeTokens = [...selTypesCfg, ...selTypesRun].filter(Boolean);
        const { keySet, familySet } = expandTypes(typeTokens);

        const pointSet = new Set([...selPointsCfg, ...selPointsRun].map(asInt).filter(v => allowedNumbers.has(v)));

        const hasTypeFilter = keySet.size > 0 || familySet.size > 0;
        const hasPointFilter = pointSet.size > 0;

        if (!hasTypeFilter && !hasPointFilter) {
            return () => false;
        }

        return (bet) => {
            const { key, def, number } = canonicalizeBet(bet);
            if (!key || !def) return false;

            const typeMatch = keySet.has(key) || familySet.has(def.family);
            const pointMatch = hasPointFilter ? pointSet.has(asInt(number)) : false;

            if (hasTypeFilter && hasPointFilter) return typeMatch && pointMatch;
            if (hasTypeFilter) return typeMatch;
            return pointMatch;
        };
    }

    function ClearNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.on("input", function(msg, send, done) {
            try {
                const bets = Array.isArray(msg.bets) ? msg.bets : [];
                const runtimeClear = msg.clear && typeof msg.clear === "object" ? msg.clear : (msg.clear === "all" ? { all:true } : null);
                const shouldRemove = makePredicate(config, runtimeClear);

                if (!bets.length) { send(msg); return done && done(); }

                const kept = bets.filter(b => !shouldRemove(b));

                msg.bets = kept;
                msg.cleared = bets.length - kept.length;

                send(msg);
                done && done();
            } catch (err) {
                node.error(err, msg);
                done && done(err);
            }
        });
    }

    RED.nodes.registerType("clear", ClearNode);
};
