// Compat wrapper — logic pindah ke src/services/marketplace/
// Tetap ada agar require("../services/marketplaceService") tidak jebol.
module.exports = require("./marketplace");
