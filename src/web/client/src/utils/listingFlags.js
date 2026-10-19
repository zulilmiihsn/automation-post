export function normalizeTitle(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
}

function titleWords(s) {
  return new Set(
    normalizeTitle(s)
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

export function jaccard(a, b) {
  const wa = titleWords(a);
  const wb = titleWords(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  const union = new Set([...wa, ...wb]).size;
  return union === 0 ? 0 : inter / union;
}

export function findDuplicateMap(listings, threshold = 0.7) {
  const map = new Map();
  const arr = Array.isArray(listings) ? listings : [];
  for (let i = 0; i < arr.length; i++) {
    const a = arr[i];
    if (!a || !a.title) continue;
    for (let j = i + 1; j < arr.length; j++) {
      const b = arr[j];
      if (!b || !b.title) continue;
      const priceA = String(a.price || "").replace(/[^0-9]/g, "");
      const priceB = String(b.price || "").replace(/[^0-9]/g, "");
      const sim = jaccard(a.title, b.title);
      const samePrice = priceA && priceB && priceA === priceB;
      if (sim >= threshold || (sim >= 0.55 && samePrice)) {
        if (!map.has(a.id)) map.set(a.id, []);
        if (!map.has(b.id)) map.set(b.id, []);
        map.get(a.id).push({ id: b.id, title: b.title, similarity: Math.round(sim * 100) });
        map.get(b.id).push({ id: a.id, title: a.title, similarity: Math.round(sim * 100) });
      }
    }
  }
  return map;
}
