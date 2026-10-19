const IMAGE_TYPES = [
	{
		mime: "image/jpeg",
		extension: ".jpg",
		matches: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
	},
	{
		mime: "image/png",
		extension: ".png",
		matches: (buffer) => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
	},
	{
		mime: "image/gif",
		extension: ".gif",
		matches: (buffer) => /^GIF8[79]a$/.test(buffer.subarray(0, 6).toString("ascii")),
	},
	{
		mime: "image/webp",
		extension: ".webp",
		matches: (buffer) => buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP",
	},
];

const IMAGE_MIME_EXTENSIONS = Object.freeze(
	Object.fromEntries(IMAGE_TYPES.map(({ mime, extension }) => [mime, extension])),
);

function detectImageType(buffer) {
	if (!Buffer.isBuffer(buffer)) return null;
	return IMAGE_TYPES.find((type) => type.matches(buffer)) || null;
}

function isValidImageBuffer(buffer, mime) {
	const detected = detectImageType(buffer);
	return Boolean(detected && (!mime || detected.mime === mime));
}

module.exports = { IMAGE_MIME_EXTENSIONS, detectImageType, isValidImageBuffer };
