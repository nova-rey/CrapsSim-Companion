// Unified numeric value node with mode = "dollars" | "units"
// Also used by the legacy wrappers (type-dollars / type-units).
module.exports = function registerIntType(RED, opts = {}) {
    // opts.alias    -> optional string to register under a different node type (wrappers)
    // opts.fixedMode-> optional "dollars"|"units" to lock the mode (wrappers)
    const nodeType = opts.alias || "int-type";
    const fixedMode = opts.fixedMode || null;

    function IntTypeNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        // Resolve mode: fixed by wrapper or from config
        function resolveMode(msg) {
            if (fixedMode) return fixedMode;
            // Optional incoming override for power-users: msg.mode = "dollars"|"units"
            const m = (msg && typeof msg.mode === "string") ? msg.mode.toLowerCase() : null;
            const fromMsg = (m === "dollars" || m === "units") ? m : null;
            const fromCfg = (config.mode === "dollars" || config.mode === "units") ? config.mode : "dollars";
            return fromMsg || fromCfg;
        }

        // Resolve integer value (>=0). Prefer config.value, allow msg.valueNumber override if desired.
        function resolveValue(msg) {
            // If user passes a number in msg.valueNumber, use it
            if (typeof msg?.valueNumber === "number") {
                return Math.max(0, Math.round(msg.valueNumber));
            }
            // If user passes { dollars|units } object, be nice and extract it
            if (msg && typeof msg.value === "object" && msg.value) {
                if (typeof msg.value.dollars === "number") return Math.max(0, Math.round(msg.value.dollars));
                if (typeof msg.value.units === "number")   return Math.max(0, Math.round(msg.value.units));
            }
            // Fall back to config
            return Math.max(0, Math.round(Number(config.value) || 0));
        }

        node.on("input", function(msg, send, done) {
            try {
                const mode = resolveMode(msg); // "dollars" | "units"
                const val  = resolveValue(msg);

                // Emit unified shape (backed by legalizer downstream):
                // msg.value = { dollars: n } or { units: n }
                msg.value = (mode === "dollars") ? { dollars: val } : { units: val };
                msg.valueType = mode;

                // Legacy niceties for earlier function nodes (harmless if unused)
                msg.amount = val;        // plain integer
                msg.amountMode = mode;   // "dollars"|"units"

                send(msg);
                done && done();
            } catch (e) {
                node.error(e, msg);
                done && done(e);
            }
        });
    }

    RED.nodes.registerType(nodeType, IntTypeNode);
};
