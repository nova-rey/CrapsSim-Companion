module.exports = function(RED) {
    function CrapsApiConfigNode(config) {
        RED.nodes.createNode(this, config);
        this.base_url = config.base_url || "http://127.0.0.1:8000";
        this.profile_id = config.profile_id || "default";
        this.default_seed_mode = config.default_seed_mode || "random";
        this.seed = config.seed;
        this.timeout_ms = config.timeout_ms || 5000;
        this.retries = config.retries || 0;
        this.retry_backoff_ms = config.retry_backoff_ms || 0;
        this.auth_token = config.auth_token;
    }

    RED.nodes.registerType("api-config", CrapsApiConfigNode);
};
