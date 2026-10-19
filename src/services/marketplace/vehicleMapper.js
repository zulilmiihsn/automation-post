const {
	FIELD_MAP,
	CATEGORY_TRANSLATIONS,
	CONDITION_TRANSLATIONS,
	VALUE_TRANSLATIONS,
} = require("../../core/constants");

const CRITICAL_FIELDS = new Set([
	"Jenis kendaraan",
	"Tahun",
	"Merek",
	"Model",
	"Kategori",
	"Kondisi",
]);

const DUPLICATE_ALIASES = new Set([
	"Year",
	"Make",
	"Mileage",
	"Exterior colour",
	"Warna Eksterior",
	"Fuel type",
	"Transmission",
	"Vehicle type",
]);

function getCategoryForMap(category, attributes = {}) {
	if (category === "Kendaraan") {
		const jenis = attributes["Jenis kendaraan"] || attributes["Vehicle type"];
		if (jenis && FIELD_MAP[jenis]) return jenis;
	}
	return category;
}

function mapConditionToVehicle(condition) {
	if (!condition) return "Baik";
	if (condition.includes("Luar biasa")) return "Luar biasa baik";
	if (condition.includes("Sangat baik")) return "Sangat baik";
	if (condition.includes("Baik")) return "Baik";
	if (condition.includes("Cukup")) return "Cukup";
	if (condition.includes("Buruk")) return "Buruk";
	return "Baik";
}

function normalizeFieldValue(fieldName, listing, attributes = {}) {
	let value = attributes[fieldName];

	if (value === undefined || value === null || value === "") {
		if (fieldName === "Tahun") value = listing.year;
		else if (fieldName === "Merek") value = listing.make;
		else if (fieldName === "Model") value = listing.model;
		else if (fieldName === "Jarak Tempuh") value = listing.mileage;
		else if (fieldName === "Warna" || fieldName === "Warna eksterior")
			value = listing.color;
		else if (fieldName === "Jenis bahan bakar") value = listing.fuel;
		else if (fieldName === "Transmisi") value = listing.transmission;
		else if (fieldName === "Kondisi Kendaraan" && listing.condition) {
			value = mapConditionToVehicle(listing.condition);
		}
	}

	if (value === undefined || value === null || value === "") {
		if (fieldName === "Jenis kendaraan")
			value = attributes["Vehicle type"] || "Sepeda Motor";
		else if (fieldName === "Tahun") value = attributes["Year"];
		else if (fieldName === "Merek") value = attributes["Make"];
		else if (fieldName === "Jarak Tempuh") value = attributes["Mileage"];
		else if (fieldName === "Warna eksterior")
			value = attributes["Warna Eksterior"] || attributes["Exterior colour"];
		else if (fieldName === "Warna interior")
			value = attributes["Exterior colour"] || attributes["Warna dalam"];
		else if (fieldName === "Jenis bahan bakar") value = attributes["Fuel type"];
		else if (fieldName === "Transmisi") value = attributes["Transmission"];
	}

	if ((value === undefined || value === null || value === "") && fieldName === "Jarak Tempuh") {
		value = 300;
	}

	return value;
}

function resolveValueAliases(fieldName, value) {
	if (!value) return [];
	const normalized = String(fieldName).trim();
	if (normalized === "Kategori") {
		return CATEGORY_TRANSLATIONS[value] || [value];
	}
	if (normalized === "Kondisi") {
		return CONDITION_TRANSLATIONS[value] || [value];
	}
	const valAliases = VALUE_TRANSLATIONS[value]
		? [...VALUE_TRANSLATIONS[value], value]
		: [value];
	for (const [key, aliases] of Object.entries(VALUE_TRANSLATIONS)) {
		if (aliases.some((a) => a.toLowerCase() === String(value).toLowerCase())) {
			valAliases.push(key);
		}
	}
	return valAliases;
}

function isCriticalField(fieldName) {
	return CRITICAL_FIELDS.has(fieldName);
}

function isDuplicateAlias(fieldName) {
	return DUPLICATE_ALIASES.has(fieldName);
}

function getMappedFields(categoryForMap, category) {
	return FIELD_MAP[categoryForMap] || FIELD_MAP[category] || [];
}

module.exports = {
	CRITICAL_FIELDS,
	getCategoryForMap,
	mapConditionToVehicle,
	normalizeFieldValue,
	resolveValueAliases,
	isCriticalField,
	isDuplicateAlias,
	getMappedFields,
};
