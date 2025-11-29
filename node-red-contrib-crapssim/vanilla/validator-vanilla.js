module.exports = function(RED) {
    const {
        getVarTable,
        dollarsFromUnitsOrLiteral,
        legalizeBetByType
    } = require("./legalizer.js");
    const { getBetDefinition, isSupported, allowedNumbers } = require("../lib/bet_surface");

    function canonicalizeBet(type, point) {
        const raw = (type || "").toString();
        const num = point != null ? Number(point) : undefined;
        const def = getBetDefinition(raw);
        if (def) {
            return { def, point: num ?? def.number };
        }

        const s = raw.toLowerCase();
        const allowed = allowedNumbers.has(num);
        switch (s) {
            case "pass": return { def: getBetDefinition("pass_line"), point: num };
            case "dont_pass":
            case "don't_pass": return { def: getBetDefinition("dont_pass"), point: num };
            case "come": return { def: getBetDefinition("come"), point: num };
            case "dont_come":
            case "don't_come": return { def: getBetDefinition("dont_come"), point: num };
            case "field": return { def: getBetDefinition("field"), point: num };
            case "place": return allowed ? { def: getBetDefinition(`place_${num}`), point: num } : { def: null, point: num };
            case "lay": return allowed ? { def: getBetDefinition(`lay_${num}`), point: num } : { def: null, point: num };
            case "hardway": return [4, 6, 8, 10].includes(Number(num)) ? { def: getBetDefinition(`hardway_${num}`), point: num } : { def: null, point: num };
            case "prop":
            case "proposition": return { def: getBetDefinition("prop_other"), point: num };
            case "odds": return { def: getBetDefinition("odds_pass_line"), point: num };
            default: return { def: null, point: num };
        }
    }

    function ValidatorVanilla(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        const strict = !!config.strict;           // if true, any issue flips ok=false
        const dedupe = config.dedupe !== false;   // default true: combine duplicates

        node.on("input", function(msg, send, done) {
            try {
                const flow = node.context().flow;
                const vt = getVarTable(flow, msg); // includes bubble/non-bubble & increments
                const warnings = [];
                const errors = [];

                // 1) Get incoming bets list
                let betsIn = Array.isArray(msg.bets) ? msg.bets
                : (msg.strategyGraph && Array.isArray(msg.strategyGraph.bets)) ? msg.strategyGraph.bets
                : [];
                if (!Array.isArray(betsIn)) betsIn = [];

                // 2) Normalize & sanity check each bet
                const out = [];
                for (const raw of betsIn) {
                    const b = raw || {};

                    const t = (b.type || "").toString().trim();
                    if (!t) { warnings.push("Skipped bet with missing type."); continue; }

                    const name = (b.name || "").toString().trim();
                    const point = b.point != null ? Number(b.point) : undefined;

                    const { def, point: resolvedPoint } = canonicalizeBet(t, point);
                    if (!def) { warnings.push(`Skipped bet with unrecognized type '${t}'.`); continue; }
                    const family = def.family;
                    const needsPoint = ["place", "lay", "hardway", "odds"].includes(family) && def.dynamic_point !== true;
                    const finalPoint = resolvedPoint;
                    if (needsPoint && !allowedNumbers.has(Number(finalPoint))) {
                        warnings.push(`Skipped ${def.key} bet with invalid or missing point (${String(finalPoint)}).`);
                        continue;
                    }

                    // 2a) Resolve value → dollars (bubble-aware)
                    // Accept {units|dollars} or numeric. negative/NaN become 0 and get skipped w/ warning.
                    const value = (b.value !== undefined ? b.value : b.amount);
                    let pre = dollarsFromUnitsOrLiteral(value, vt);
                    if (!Number.isFinite(pre) || pre <= 0) {
                        warnings.push(`${def.key}${needsPoint ? ` ${finalPoint}` : ""}: non-positive amount; skipped.`);
                        continue;
                    }

                    // 2b) Light “legalization” pass:
                    //   - In bubble mode: leave $1 increments (no rounding), just floor to int >= 1.
                    //   - In non-bubble: use legalizer rules to round to table-legal increments/mins.
                    let dollars = pre;
                    const before = pre;
                    try {
                        dollars = legalizeBetByType({ type: def.key, point: finalPoint, name }, pre, undefined, vt);
                    } catch (e) {
                        dollars = pre;
                        warnings.push(`${def.key}${needsPoint ? ` ${finalPoint}` : ""}: could not validate amount (${String(e.message || e)}). Using original ${before}.`);
                    }

                    if (dollars !== before) {
                        warnings.push(`${def.key}${needsPoint ? ` ${finalPoint}` : ""}: adjusted ${before} → ${dollars}${vt?.bubble ? " (bubble allowed; non-bubble rounding illustrated)" : ""}.`);
                    }

                    if (!isSupported(def.key)) {
                        warnings.push(`Bet type ${def.key} is currently unsupported and may be ignored by the exporter.`);
                    }

                    // Assemble normalized bet record
                    const norm = { type: def.key, dollars };
                    if (needsPoint || def.dynamic_point) norm.point = Number(finalPoint);
                    if (name) norm.name = name;
                    out.push(norm);
                }

                // 3) Dedupe/aggregate duplicates (optional)
                // Combine same-type+point bets to a single dollars sum. Keep props separate by name.
                let finalBets = out;
                if (dedupe) {
                    const map = new Map();
                    for (const b of out) {
                        const def = getBetDefinition(b.type);
                        const family = def?.family || b.type;
                        const needsPoint = ["place", "lay", "hardway", "odds"].includes(family) && def?.dynamic_point !== true;
                        const key = needsPoint
                        ? `${b.type}:${b.point}:${b.name || ""}`
                        : (family === "prop")
                        ? `${b.type}:${(b.name || "").toLowerCase()}`
                        : `${b.type}`;
                        const prev = map.get(key);
                        if (prev) {
                            prev.dollars += b.dollars;
                        } else {
                            map.set(key, { ...b });
                        }
                    }
                    finalBets = [...map.values()];
                    if (finalBets.length < out.length) {
                        warnings.push("Combined duplicate bets of the same type/point.");
                    }
                }

                // 4) Simple structural sanity checks (non-fatal)
                // - Unknown type set (after we processed): warn once if any are outside the known set
                const unknownSeen = finalBets.some(b => !getBetDefinition(b.type));
                if (unknownSeen) {
                    warnings.push("Some bets have unrecognized types; exporter may fall back or ignore them.");
                }

                // 5) Prepare output and result
                msg.bets = finalBets;
                msg.validation = {
                    ok: !(strict ? (warnings.length || errors.length) : errors.length),
                    warnings,
                    errors,
                    table: {
                        ...(vt || {})
                    }
                };

                node.status({
                    fill: msg.validation.ok ? (warnings.length ? "yellow" : "green") : "red",
                            shape: msg.validation.ok ? (warnings.length ? "ring" : "dot") : "dot",
                            text: msg.validation.ok
                            ? (warnings.length ? `${warnings.length} warning(s)` : "ok")
                            : `errors: ${errors.length}`
                });

                send(msg);
                done && done();
            } catch (e) {
                node.error(e);
                done && done(e);
            }
        });
    }

    RED.nodes.registerType("validator", ValidatorVanilla);
};
