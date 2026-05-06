// Tom shim — brukes av metro.config.js for å erstatte node-only moduler
// på web (f.eks. @supabase/node-fetch). Nettleseren har innebygd fetch.
const fetchShim = (...args) => fetch(...args);
module.exports = fetchShim;
module.exports.default = fetchShim;
module.exports.Headers = typeof Headers !== "undefined" ? Headers : class {};
module.exports.Request = typeof Request !== "undefined" ? Request : class {};
module.exports.Response = typeof Response !== "undefined" ? Response : class {};
