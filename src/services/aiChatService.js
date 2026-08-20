require("dotenv").config();
const axios = require("axios");
const Logger = require("../utils/logger");

/**
 * AI Chat Service - Generates contextual replies for marketplace buyer conversations.
 * Replaces hardcoded template replies with AI-generated natural responses.
 */
class AIChatService {
	constructor() {
		this.apiKey = process.env.GROQ_API_KEY;
		this.model = process.env.GROQ_MODEL_LIGHT || "llama-3.3-70b-versatile";
		this.logger = new Logger("AI-CHAT-SERVICE");
		this._timeout = 5000; // 5s max, fallback to template if slower
	}

	/**
	 * Generate a contextual reply for a marketplace buyer message.
	 * @param {string} buyerMessage - The buyer's message
	 * @param {object} listingContext - Optional listing info for context
	 * @returns {string|null} Generated reply or null if failed
	 */
	async generateReply(buyerMessage, listingContext = {}) {
		if (!this.apiKey) return null;

		const listingInfo = listingContext.title
			? `\nKonteks Produk: ${listingContext.title}, Harga: Rp${listingContext.price || "?"}, Kondisi: ${listingContext.condition || "?"}`
			: "";

		const prompt = `Kamu adalah penjual motor bekas ramah & terpercaya di Facebook Marketplace Berau/Kalimantan Timur.
Tujuan utamamu BUKAN berdebat harga atau mengobrol panjang, melainkan mengajak calon pembeli datang CEK UNIT dan TEST RIDE secara langsung.

Konteks Motor: ${listingInfo || "Motor Bekas Berkualitas"}
Pesan Pembeli: "${buyerMessage}"

Aturan Menjawab:
1. Sangat singkat, natural, santai khas penjual motor lokal (maksimal 20 kata).
2. JANGAN gunakan emoji, hashtag, atau tanda seru berlebihan.
3. JANGAN berikan nomor HP/WA kecuali pembeli meminta secara jelas untuk janjian.
4. Pola Jawaban berdasarkan jenis pertanyaan:
   - Tanya ketersediaan ("Masih ada?"): Jawab masih ada dan langsung tawarkan jadwal cek (Contoh: "Masih ada bosku. Motor siap dites, mau cek hari ini atau besok?").
   - Tanya harga pas/nett/bisa nego: Jawab bahwa harga nego tipis di tempat setelah cek fisik (Contoh: "Harga postingan nego tipis setelah cek unit langsung bos. Mau cek kapan?").
   - Nego sadis / lowball: Tolak sopan dan arahkan cek fisik (Contoh: "Belum dapat bosku. Surat & mesin aman, silakan cek unit dulu nanti diobrolkan tipis di lokasi.").
   - Tanya lokasi / mau cek: Berikan respon ramah dan ajak tentukan waktu pantau unit.
5. JANGAN pernah memberikan harga terendah (floor price) lewat chat.

Balasan (teks murni saja):`;

		try {
			const response = await Promise.race([
				axios.post(
					"https://api.groq.com/openai/v1/chat/completions",
					{
						model: this.model,
						messages: [
							{
								role: "system",
								content: "Kamu adalah penjual motor bekas yang ramah dan profesional. Balas singkat dan natural.",
							},
							{ role: "user", content: prompt },
						],
						temperature: 0.7,
						max_tokens: 100,
					},
					{
						headers: {
							Authorization: `Bearer ${this.apiKey}`,
							"Content-Type": "application/json",
						},
						timeout: this._timeout,
					},
				),
				new Promise((_, reject) =>
					setTimeout(() => reject(new Error("AI timeout")), this._timeout),
				),
			]);

			const reply = response.data.choices[0]?.message?.content?.trim();
			if (reply && reply.length > 0 && reply.length < 200) {
				this.logger.info(`AI Reply generated: "${reply.substring(0, 50)}..."`);
				return reply;
			}
			return null;
		} catch (err) {
			this.logger.warn(`AI reply generation failed: ${err.message}. Using template fallback.`);
			return null;
		}
	}
}

module.exports = new AIChatService();
