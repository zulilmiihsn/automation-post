const translations = require("./translations");
const selectors = require("./selectors");
const fields = require("./fields");

module.exports = {
	...translations,
	...selectors,
	...fields,
};
