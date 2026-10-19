const VEHICLE_PARTS_PATTERN = /\b(spare\s?part|suku cadang|onderdil|komponen|aksesoris|aksesori)\b/i;
const MOTOR_PATTERN = /\b(motor|sepeda motor|scooter|motorcycle|matic|matik)\b/i;
const ROAD_VEHICLE_PATTERN = /\b(mobil|truk|kendaraan|car|truck|vehicle)\b/i;
const BICYCLE_PATTERN = /\b(sepeda|bicycle|bike)\b/i;

function inferListingCategory(description) {
	const text = String(description || "").trim();
	if (!text) return null;

	if (VEHICLE_PARTS_PATTERN.test(text) && /\b(motor|mobil|truk|kendaraan|car|truck)\b/i.test(text)) {
		return "Komponen otomotif";
	}
	if (MOTOR_PATTERN.test(text) || ROAD_VEHICLE_PATTERN.test(text)) return "Kendaraan";
	if (BICYCLE_PATTERN.test(text)) return "Sepeda";

	return null;
}

module.exports = { inferListingCategory };
