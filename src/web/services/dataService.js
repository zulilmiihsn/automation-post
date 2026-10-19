const ListingDataService = require("./listingDataService");

// Compatibility facade while callers migrate to domain repositories.
Object.assign(
	ListingDataService,
	require("./accountDataService"),
	require("./agentDataService"),
	require("./chatStore"),
	require("./notificationDataService"),
	require("./operationDataService"),
	require("./reportDataService"),
	require("./runtimeDataService"),
	require("./workspaceDataService"),
);

module.exports = ListingDataService;
