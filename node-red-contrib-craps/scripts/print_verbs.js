const { loadVerbRegistry } = require("../lib/verb_registry");

function formatVerb(entry) {
    const required = entry.args_schema?.required || [];
    const family = entry.family || "";
    const engine = entry.engine_verb || "";
    const requiredList = `[${required.join(",")}]`;
    return `${entry.verb.padEnd(12)} family=${family.padEnd(12)} engine=${engine.padEnd(12)} required=${requiredList}`;
}

function main() {
    const registry = loadVerbRegistry();
    const lines = Array.from(registry.values())
        .sort((a, b) => a.verb.localeCompare(b.verb))
        .map(formatVerb);
    console.log(lines.join("\n"));
}

if (require.main === module) {
    main();
}
