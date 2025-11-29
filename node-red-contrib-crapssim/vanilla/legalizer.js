const { getBetDefinition } = require("../lib/bet_surface");

const clampInt = n => Math.max(0, Math.round(Number(n) || 0));
const roundUpTo = (n, inc) => inc > 0 ? Math.ceil(n / inc) * inc : clampInt(n);

function getVarTable(flow, msg) {
    return (msg && msg.varTable) || flow.get("varTable") || {
        mode:"10", multiplier:10, bubble:false, place68Increment:6,
        rules:{
            tableMinMultiple:10,
            placeIncrements:{4:5,5:5,6:6,8:6,9:5,10:5},
            layIncrement:5, propIncrement:10, flatIncrement:10,
            oddsPolicy:{enabled:true,maxMultiple:{4:3,5:4,6:5,8:5,9:4,10:3}}
        }
    };
}

function dollarsFromUnitsOrLiteral(value, vt) {
    if (!value) return 0;
    if (typeof value.dollars === "number") return clampInt(value.dollars);
    if (typeof value.units === "number") return clampInt(value.units * (vt.multiplier || 1));
    return 0;
}

function legalizeFlat(dollars, vt) {
    return vt.bubble ? clampInt(dollars) : roundUpTo(dollars, vt.rules.flatIncrement);
}

function legalizePlace(point, dollars, vt) {
    if (vt.bubble) return clampInt(dollars);
    const inc = vt.rules.placeIncrements[String(point)] || vt.rules.placeIncrements[point] || vt.rules.flatIncrement;
    return roundUpTo(Math.max(dollars, inc), inc);
}

function legalizeLay(point, dollars, vt) {
    if (vt.bubble) return clampInt(dollars);
    return roundUpTo(Math.max(dollars, vt.rules.layIncrement), vt.rules.layIncrement);
}

function legalizeProp(dollars, vt) {
    if (vt.bubble) return clampInt(dollars);
    return roundUpTo(Math.max(dollars, vt.rules.propIncrement), vt.rules.propIncrement);
}

function capOddsToPolicy(point, baseFlat, oddsDollars, vt) {
    if (vt.bubble || !vt.rules.oddsPolicy?.enabled) return clampInt(oddsDollars);
    const mult = vt.rules.oddsPolicy.maxMultiple[String(point)] ?? vt.rules.oddsPolicy.maxMultiple[point];
    if (!mult) return clampInt(oddsDollars);
    const maxAllowed = clampInt(baseFlat * mult);
    return Math.min(clampInt(oddsDollars), maxAllowed);
}

function legalizeBetByType(bet, dollars, context, vt) {
    const typeKey = (bet.type || "").toString();
    const def = getBetDefinition(typeKey);
    const family = def ? def.family : typeKey.toLowerCase();
    const point = bet.point != null ? bet.point : (bet.number != null ? bet.number : def?.number);

    switch (family) {
        case "line":
        case "field":
            return legalizeFlat(dollars, vt);
        case "place":
            return legalizePlace(point, dollars, vt);
        case "lay":
            return legalizeLay(point, dollars, vt);
        case "hardway":
        case "prop":
        case "proposition":
            return legalizeProp(dollars, vt);
        case "odds": {
            const baseFlat = clampInt(context?.baseFlat || 0);
            return capOddsToPolicy(point, baseFlat, dollars, vt);
        }
        default:
            return legalizeFlat(dollars, vt);
    }
}

module.exports = {
    clampInt,
    roundUpTo,
    getVarTable,
    dollarsFromUnitsOrLiteral,
    legalizeFlat,
    legalizePlace,
    legalizeLay,
    legalizeProp,
    capOddsToPolicy,
    legalizeBetByType
};
