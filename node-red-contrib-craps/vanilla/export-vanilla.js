module.exports = function(RED) {
    // Pull table-scaling + legalization helpers
    const {
        getVarTable,
        dollarsFromUnitsOrLiteral,
        legalizeBetByType
    } = require("./legalizer.js");
    const { getBetDefinition, isSupported, allowedNumbers } = require("../lib/bet_surface");

    function ExportVanillaNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        function clone(x) { return JSON.parse(JSON.stringify(x)); }

        function canonicalizeBet(kind, number) {
            const num = number != null ? Number(number) : undefined;
            const def = getBetDefinition(kind);
            if (def) return { def, number: num ?? def.number };

            const k = (kind || "").toString().toLowerCase();
            const allowed = allowedNumbers.has(num);
            switch (k) {
                case "pass": return { def: getBetDefinition("pass_line"), number: num };
                case "dontpass":
                case "don'tpass":
                case "dont_pass": return { def: getBetDefinition("dont_pass"), number: num };
                case "come": return { def: getBetDefinition("come"), number: num };
                case "dontcome":
                case "don'tcome":
                case "dont_come": return { def: getBetDefinition("dont_come"), number: num };
                case "field": return { def: getBetDefinition("field"), number: num };
                case "place": return allowed ? { def: getBetDefinition(`place_${num}`), number: num } : { def: null, number: num };
                case "lay": return allowed ? { def: getBetDefinition(`lay_${num}`), number: num } : { def: null, number: num };
                case "hardway": return [4, 6, 8, 10].includes(Number(num)) ? { def: getBetDefinition(`hardway_${num}`), number: num } : { def: null, number: num };
                case "prop": return { def: getBetDefinition("prop_other"), number: num };
                case "odds": return { def: getBetDefinition("odds_pass_line"), number: num };
                default: return { def: null, number: num };
            }
        }

        function lineCtor(key) {
            switch (key) {
                case "pass_line": return "BetPassLine";
                case "dont_pass": return "BetDontPass";
                case "come": return "BetCome";
                case "dont_come": return "BetDontCome";
                default: return null;
            }
        }

        // Expand loop blocks in msg.recipe.steps
        function unroll(steps) {
            const out = [], stack = [];
            for (const s0 of steps || []) {
                const s = clone(s0);
                if (s.type === "loop" && s.action === "begin") {
                    stack.push({ idx: out.length, count: Number(s.count) || 1 });
                    continue;
                }
                if (s.type === "loop" && s.action === "end") {
                    const fr = stack.pop(); if (!fr) throw new Error("Loop end without begin");
                    const block = out.slice(fr.idx);
                    for (let k = 1; k < fr.count; k++) out.push(...clone(block));
                    continue;
                }
                out.push(s);
            }
            if (stack.length) throw new Error("Unclosed loop block");
            return out;
        }

        // Phase → StrategyMode enum name
        function modeForPhase(phase) {
            if (phase === "comeout") return "BET_IF_POINT_OFF";
            if (phase === "maingame") return "BET_IF_POINT_ON";
            return null; // endgame: usually cleanup/no-op
        }

        node.on("input", function(msg, send, done) {
            try {
                const stepsIn = (msg.recipe && Array.isArray(msg.recipe.steps)) ? msg.recipe.steps : [];
                const flat = unroll(stepsIn).filter(Boolean);

                // Table rules via var-table (bubble vs non-bubble, increments, etc.)
                const flow = node.context().flow;
                const vt = getVarTable(flow, msg);

                // Partition by phase
                let phase = null;
                const comp = {
                    comeout: { line: [], place: {}, lay: {}, field: [], hard: [] },
                    maingame:{ line: [], place: {}, lay: {}, field: [], hard: [] },
                    endgame: { line: [], place: {}, lay: {}, field: [], hard: [] }
                };
                function currentBucket() { return comp[phase || "maingame"]; }

                for (const s0 of flat) {
                    const s = s0 || {};
                    if (s.evo) delete s.evo;

                    if (s.type === "section") {
                        if (s.action === "begin") phase = s.phase || phase;
                        if (s.action === "end")   phase = null;
                        continue;
                    }
                    if (s.type === "roll") {
                        // CrapsSim handles rolling internally; ignore in export
                        continue;
                    }

                    const kind = s.type;
                    const numInput  = (s.number !== undefined) ? Number(s.number) : undefined;
                    const { def, number: resolvedNumber } = canonicalizeBet(kind, numInput);
                    if (!def) { node.warn(`export: skipping unknown bet type '${kind}'`); continue; }

                    const family = def.family;
                    const num = resolvedNumber;
                    if (["place", "lay", "hardway"].includes(family) && !allowedNumbers.has(Number(num))) {
                        node.warn(`export: skipping ${def.key} with invalid point ${String(num)}`);
                        continue;
                    }

                    // Normalize amount via legalizer: handle {units|dollars} and enforce increments
                    const value = s.amount;
                    let preDollars;
                    if (typeof value === "object" && value !== null && ("units" in value || "dollars" in value)) {
                        preDollars = dollarsFromUnitsOrLiteral(value, vt);
                    } else {
                        preDollars = Number(value);
                    }
                    if (!(preDollars > 0)) continue;

                    const legalized = legalizeBetByType({ type: def.key, point: num }, preDollars, undefined, vt);

                    if (!isSupported(def.key)) {
                        node.warn(`export: bet type '${def.key}' is currently unsupported and may be ignored by the engine.`);
                    }

                    const bkt = currentBucket();
                    switch (family) {
                        case "line":
                            bkt.line.push({ key: def.key, amount: legalized });
                            break;
                        case "place":
                            if ([4,5,6,8,9,10].includes(num)) {
                                bkt.place[num] = (bkt.place[num] || 0) + legalized;
                            }
                            break;
                        case "lay":
                            if ([4,5,6,8,9,10].includes(num)) {
                                bkt.lay[num] = (bkt.lay[num] || 0) + legalized;
                            }
                            break;
                        case "field":
                            bkt.field.push({ amount: legalized });
                            break;
                        case "hardway":
                            if ([4,6,8,10].includes(num)) {
                                bkt.hard.push({ number: num, amount: legalized });
                            }
                            break;
                        default:
                            break;
                    }
                }

                const strategyName = (config.strategyName || "MyStrategy").replace(/[^A-Za-z0-9_]/g, "_");
                const author = (config.author || "").trim();
                const notes  = (config.notes  || "").trim();

                // Determine required imports
                let needBetPass=false, needBetDP=false, needBetCome=false, needBetDC=false;
                let needPlace=false, needLay=false, needField=false, needHard=false, needMode=false;

                function hasAny(obj) { return obj && Object.keys(obj).length > 0; }

                for (const ph of ["comeout","maingame","endgame"]) {
                    const b = comp[ph];
                    if (b.line.some(x => x.key === "pass_line")) needBetPass = true;
                    if (b.line.some(x => x.key === "dont_pass")) needBetDP = true;
                    if (b.line.some(x => x.key === "come")) needBetCome = true;
                    if (b.line.some(x => x.key === "dont_come")) needBetDC = true;
                    if (hasAny(b.place)) { needPlace = true; needMode = true; }
                    if (hasAny(b.lay))   { needLay   = true; needMode = true; }
                    if (b.field.length)  { needField = true; needMode = true; }
                    if (b.hard.length)   { needHard  = true; needMode = true; }
                }

                const lines = [];
                lines.push(`# Auto-generated vanilla CrapsSim strategy`);
                if (author) lines.push(`# Author: ${author}`);
                if (notes)  lines.push(`# Notes: ${notes}`);
                lines.push("");
                lines.push("import crapssim as craps");

                const coreImports = ["AggregateStrategy"];
                if (needBetDP)   coreImports.push("BetDontPass");
                if (needBetPass) coreImports.push("BetPassLine");
                if (needBetCome) coreImports.push("BetCome");
                if (needBetDC)   coreImports.push("BetDontCome");
                if (needPlace)   coreImports.push("BetPlace");
                if (needLay)     coreImports.push("BetLay");
                lines.push(`from crapssim.strategy import ${coreImports.join(", ")}`);

                const sb = [];
                if (needField) sb.push("BetField");
                if (needHard)  sb.push("BetHardway");
                if (needMode)  sb.push("StrategyMode");
                if (sb.length) lines.push(`from crapssim.strategy.single_bet import ${sb.join(", ")}`);
                lines.push("");
                lines.push("def build_strategy():");
                lines.push("    comps = []");
                lines.push("");

                function pyModeFor(ph) {
                    const enumName = modeForPhase(ph);
                    return enumName ? `mode=StrategyMode.${enumName}` : null;
                }

                function emitLine(ph, arr) {
                    for (const it of arr) {
                        const args = [`bet_amount=${it.amount}`];
                        const modeArg = pyModeFor(ph);
                        if (modeArg && (it.key !== "pass_line" && it.key !== "dont_pass")) args.push(modeArg);
                        const ctor = lineCtor(it.key);
                        if (ctor) lines.push(`    comps.append(${ctor}(${args.join(", ")}))`);
                    }
                }

                function emitPlace(ph, dict) {
                    if (!hasAny(dict)) return;
                    const kv = Object.keys(dict).sort((a,b)=>Number(a)-Number(b)).map(k => `${k}: ${dict[k]}`).join(", ");
                    const args = [`place_bet_amounts={${kv}}`, "skip_point=True"];
                    const modeArg = pyModeFor(ph);
                    if (modeArg) args.push(modeArg);
                    lines.push(`    comps.append(BetPlace(${args.join(", ")}))`);
                }

                function emitLay(ph, dict) {
                    if (!hasAny(dict)) return;
                    const kv = Object.keys(dict).sort((a,b)=>Number(a)-Number(b)).map(k => `${k}: ${dict[k]}`).join(", ");
                    const args = [`lay_bet_amounts={${kv}}`];
                    const modeArg = pyModeFor(ph);
                    if (modeArg) args.push(modeArg);
                    lines.push(`    comps.append(BetLay(${args.join(", ")}))`);
                }

                function emitField(ph, arr) {
                    for (const it of arr) {
                        const args = [`bet_amount=${it.amount}`];
                        const modeArg = pyModeFor(ph);
                        if (modeArg) args.push(modeArg);
                        lines.push(`    comps.append(BetField(${args.join(", ")}))`);
                    }
                }

                function emitHard(ph, arr) {
                    for (const it of arr) {
                        const args = [`number=${it.number}`, `bet_amount=${it.amount}`];
                        const modeArg = pyModeFor(ph);
                        if (modeArg) args.push(modeArg);
                        lines.push(`    comps.append(BetHardway(${args.join(", ")}))`);
                    }
                }

                for (const ph of ["comeout","maingame","endgame"]) {
                    const b = comp[ph];
                    lines.push(`    # --- ${ph} ---`);
                    emitLine(ph, b.line);
                    emitPlace(ph, b.place);
                    emitLay(ph, b.lay);
                    emitField(ph, b.field);
                    emitHard(ph, b.hard);
                    lines.push("");
                }

                lines.push("    return AggregateStrategy(*comps)");
                lines.push("");

                // Vars from msg.sim (var-* nodes should set these)
                const sim = msg.sim || {};
                const bankroll = (typeof sim.bankroll === "number" && sim.bankroll > 0) ? sim.bankroll : 300;

                let maxRollsPy = `float("inf")`;
                if (typeof sim.max_rolls === "number" && sim.max_rolls > 0) {
                    maxRollsPy = String(sim.max_rolls);
                } else if (sim.max_rolls === "inf" || sim.max_rolls === Infinity) {
                    maxRollsPy = `float("inf")`;
                }

                let maxShooterPy = `float("inf")`;
                if (typeof sim.max_shooter === "number" && sim.max_shooter > 0) {
                    maxShooterPy = String(sim.max_shooter);
                } else if (sim.max_shooter === "inf" || sim.max_shooter === Infinity) {
                    maxShooterPy = `float("inf")`;
                }

                const seed = (sim.seed !== undefined && sim.seed !== null) ? sim.seed : null;

                lines.push(`if __name__ == "__main__":`);
                if (seed === null) {
                    lines.push(`    table = craps.Table()`);
                } else {
                    const seedLit = (typeof seed === "number") ? String(seed) : JSON.stringify(String(seed));
                    lines.push(`    table = craps.Table(seed=${seedLit})`);
                }
                lines.push(`    table.add_player(strategy=build_strategy(), bankroll=${bankroll}, name="${strategyName}")`);
                lines.push(`    table.run(max_shooter=${maxShooterPy}, max_rolls=${maxRollsPy}, verbose=True)`);
                lines.push("");

                const py = lines.join("\n");

                // filename
                let fname = (config.filename || "/data/exports/strategy_vanilla.py").trim();
                if (!fname.startsWith("/")) fname = "/data/exports/" + fname;

                msg.payload = py;
                msg.filename = fname;

                node.status({ fill: "green", shape: "dot", text: `ready: ${fname.split("/").pop()}` });
                send(msg);
                done();
            } catch (e) {
                node.error(e);
                done(e);
            }
        });
    }

    RED.nodes.registerType("export", ExportVanillaNode);
};
