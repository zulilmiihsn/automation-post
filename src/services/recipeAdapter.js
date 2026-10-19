function toListingVars(listing = {}) {
	return {
		judul: listing.title || "",
		harga: String(listing.price ?? ""),
		deskripsi: listing.description || "",
		lokasi: listing.location || "",
		kategori: listing.category || "",
		kondisi: listing.condition || "",
		targetGrup: listing.targetGroup || listing.targetGroups || "",
		foto1: (listing.photos || [])[0] || "",
	};
}

function applyVarsToValue(value, vars = {}) {
	if (typeof value !== "string") return value;
	return value.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{{${k}}}`));
}

function applyVarsToRecipe(recipe, vars = {}) {
	const steps = (Array.isArray(recipe) ? recipe : recipe.steps || []).map((s) => ({
		...s,
		value: applyVarsToValue(s.value, vars),
		url: applyVarsToValue(s.url || "", vars),
	}));
	return Array.isArray(recipe) ? steps : { ...recipe, steps };
}

function filterByFeature(recipe, feature) {
	const steps = Array.isArray(recipe) ? recipe : recipe.steps || [];
	const out = steps.filter((s) => !s.feature || s.feature === feature || feature === "all");
	return Array.isArray(recipe) ? out : { ...recipe, steps: out };
}

function missingVars(recipe, vars = {}) {
	const need = new Set();
	const steps = Array.isArray(recipe) ? recipe : recipe.steps || [];
	for (const s of steps) {
		for (const f of [s.value, s.url]) {
			if (typeof f !== "string") continue;
			for (const m of f.matchAll(/\{\{(\w+)\}\}/g)) {
				if (vars[m[1]] === undefined) need.add(m[1]);
			}
		}
	}
	return Array.from(need);
}

module.exports = { toListingVars, applyVarsToValue, applyVarsToRecipe, filterByFeature, missingVars };
