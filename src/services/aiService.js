require("dotenv").config();
const axios = require("axios");
const { CATEGORY_TRANSLATIONS, FIELD_MAP, FIELD_CONFIG } = require("../core/constants");
const Logger = require("../utils/logger");

class AIService {
	constructor() {
		this.apiKey = process.env.GROQ_API_KEY;
		this.model = process.env.GROQ_MODEL_HEAVY || "openai/gpt-oss-120b";
		this.categories = Object.keys(CATEGORY_TRANSLATIONS);
		this.logger = new Logger("AI-SERVICE");
	}

	normalizePrice(price, category = "Kendaraan") {
		if (!price && price !== 0) return "";
		let str = String(price).trim().toLowerCase();
		
		// Hapus simbol Rp dan spasi
		str = str.replace(/rp\.?/g, "").trim();
		
		// Format desimal koma jadi titik: misal "18,5" -> "18.5"
		str = str.replace(/(\d+),(\d+)/g, "$1.$2");
		
		// Jika mengandung kata "jt" atau "juta"
		if (str.includes("jt") || str.includes("juta")) {
			const match = str.match(/([\d.]+)\s*(jt|juta)/);
			if (match) {
				const num = parseFloat(match[1]);
				if (!isNaN(num)) return String(Math.round(num * 1000000));
			}
		}

		// Jika format desimal "18.5" atau "7.8"
		if (/^\d+\.\d+$/.test(str)) {
			const num = parseFloat(str);
			if (!isNaN(num) && num < 1000) {
				return String(Math.round(num * 1000000));
			}
		}

		// Angka bersih tanpa titik/koma ribuan
		const digitsOnly = str.replace(/[^0-9]/g, "");
		const numVal = parseInt(digitsOnly, 10);
		if (isNaN(numVal) || numVal === 0) return "";

		// Logika cerdas untuk harga motor/kendaraan (motor tidak ada seharga ratusan perak)
		if (category === "Kendaraan" || !category) {
			if (numVal < 100) {
				// Misal: 18 -> 18.000.000, 7 -> 7.000.000
				return String(numVal * 1000000);
			} else if (numVal < 1000) {
				// Misal: 185 (dari 18.5jt) -> 18.500.000, 169 (dari 16.9jt) -> 16.900.000, 78 -> 7.800.000
				return String(numVal * 100000);
			} else if (numVal < 10000) {
				// Misal: 1850 -> 18.500.000
				return String(numVal * 10000);
			}
		}

		return String(numVal);
	}

	formatPriceNatural(price) {
		if (!price && price !== 0) return "";
		const str = String(price).trim();
		const digits = str.replace(/[^0-9]/g, "");
		const num = parseInt(digits, 10);
		if (isNaN(num) || num === 0) return price;

		if (num >= 1000000) {
			const jt = num / 1000000;
			const formatted = jt.toLocaleString("id-ID", { maximumFractionDigits: 2 });
			return `${formatted} jt`;
		}
		
		return `Rp ${num.toLocaleString("id-ID")}`;
	}

	sanitizeDescription(description) {
		if (!description) return "";
		let desc = String(description);
		// Ganti format angka kaku "Harga 16900000" atau "Harga Rp 16900000" jadi "Harga 16,9 jt"
		desc = desc.replace(/Harga\s+(?:Rp\.?\s*)?(\d{6,9})/gi, (match, digits) => {
			return `Harga ${this.formatPriceNatural(digits)}`;
		});
		return desc;
	}

	formatAIError(error, defaultMsg = "Gagal memproses AI") {
		const rawMsg = error.response?.data?.error?.message || error.message || "";
		const status = error.response?.status;

		if (status === 429 || rawMsg.includes("Rate limit") || rawMsg.includes("TPM") || rawMsg.includes("rate_limit_exceeded")) {
			const waitMatch = rawMsg.match(/try again in ([\d.]+)s/i);
			const seconds = waitMatch ? Math.ceil(parseFloat(waitMatch[1])) : 20;
			return `Kuota AI per menit tercapai (Rate Limit). Silakan tunggu ~${seconds} detik lalu coba lagi.`;
		}

		if (rawMsg.includes("API key") || status === 401) {
			return "GROQ_API_KEY tidak valid atau belum diatur di file .env.";
		}

		if (error.code === "ECONNABORTED" || rawMsg.includes("timeout")) {
			return "Koneksi ke AI timeout (terlalu lama). Silakan coba beberapa saat lagi.";
		}

		return `${defaultMsg}: ${rawMsg}`;
	}

	async processListing(rawCaption) {
		if (!this.apiKey) {
			this.logger.error("GROQ_API_KEY tidak ditemukan di .env");
			return null;
		}

		this.logger.info(`Mengoptimalkan data listing menggunakan ${this.model}...`);

		const prompt = `
        Tugas: Kamu adalah copywriter khusus penjualan motor di Facebook Marketplace.
        Tugasmu mengubah deskripsi mentah menjadi deskripsi yang singkat, natural, jujur, mudah dipindai, dan terasa seperti ditulis penjual motor lokal. Jangan menggunakan bahasa yang kaku atau terlalu formal.

        --- INPUT TEKS ASLI ---
        "${rawCaption}"

        --- FAKTA TETAP BISNIS ---
        1. Semua motor memiliki surat lengkap, yaitu STNK dan BPKB.
        2. Semua motor sudah diperiksa sebelum dijual.
        3. Mesin dan kelistrikan normal saat pengecekan.
        4. Harga hanya dapat dinegosiasikan tipis setelah pembeli mengecek unit.
        5. Pembeli diperbolehkan mengecek dan mencoba motor secara langsung.
        Fakta tetap tersebut boleh dicantumkan meskipun tidak terdapat dalam deskripsi mentah.

        --- ATURAN KEJUJURAN ---
        1. Gunakan hanya informasi dari deskripsi mentah dan fakta tetap bisnis.
        2. Tahun, tipe, harga, pajak, kondisi bodi, ban, odometer, aksesori, serta kekurangan motor harus mengikuti input.
        3. Jangan mengarang informasi yang tidak tersedia.
        4. Status pajak harus mengikuti input:
           - "Pajak off" atau "pajak mati": tulis "Pajak off".
           - "Pajak hidup" atau "pajak aktif": tulis "Pajak aktif".
           - Tidak disebutkan: jangan menuliskan status pajak.
        5. Setiap kekurangan yang terdapat dalam input wajib disampaikan secara jujur.
        6. Jangan mengklaim:
           - Tidak pernah turun mesin
           - Seluruhnya orisinal
           - Tidak ada kekurangan
           - Siap perjalanan jauh
           - Kondisi sangat terawat
           kecuali informasi tersebut memang terdapat dalam input.
        7. Jika input menyebutkan masalah mesin, kelistrikan, atau surat yang bertentangan dengan fakta tetap bisnis, jangan membuat deskripsi. Tulis: "PERLU REVIEW: [alasan singkat]"

        --- RIWAYAT KEPEMILIKAN ---
        1. Jangan membahas motor tangan pertama, kedua, ketiga, atau seterusnya.
        2. Jangan menggunakan kata "motor second", "motor bekas", "oper tangan", atau "pemilik sebelumnya".
        3. Jangan mengklaim atau memberikan kesan bahwa motor merupakan:
           - Tangan pertama
           - Pemakaian pribadi
           - Atas nama sendiri
           - Dimiliki dari baru
           - Jarang dipakai
        4. Fokuskan deskripsi pada kondisi motor sekarang, surat, pajak, harga, dan kesempatan mengecek unit.
        5. Jangan membuat pernyataan palsu mengenai riwayat kepemilikan.

        --- ATURAN NEGOSIASI ---
        1. Sebutkan negosiasi hanya satu kali, menyatu dengan bagian harga.
        2. Gunakan format: "Harga [harga], nego tipis setelah cek unit."
        3. Jangan menggunakan frasa: "Masih bisa nego", "Nego bebas", "Nego sampai deal", "Nego santai", "Nego sadis", "Harga bisa dibicarakan".
        4. Jangan menuliskan kata "nego" pada judul, pembuka, daftar kondisi, atau penutup.

        --- ATURAN GAYA BAHASA ---
        1. Gunakan bahasa penjual lokal yang santai, ringkas, tetapi tetap rapi.
        2. Jangan menulis kalimat kaku seperti: "Unit sudah melalui pemeriksaan mesin dan kelistrikan."
        3. Sampaikan informasi secara singkat:
           - Mesin normal
           - Kelistrikan normal
           - Surat lengkap STNK dan BPKB
        4. Jangan menggunakan kata: "Modifikasi", "Modif", "Modiv", "Custom", "Ganteng", "Cakep", "Keren", "Mantap", dan "Mulus banget".
        5. Jangan menggunakan frasa: "Siapa cepat dia dapat", "Butuh uang", "BU", "Promo", dan "Bonus".
        6. Jangan menggunakan CAPSLOCK, tanda seru berlebihan, atau emoji centang.
        7. Gunakan satu jenis bullet dalam setiap deskripsi, pilih antara strip (-) atau titik (•). Jangan mencampurkan keduanya.
        8. Variasikan susunan dan pilihan kata secara wajar agar setiap deskripsi tidak terlihat identik.
        9. Jangan mencantumkan nomor HP, WhatsApp, atau alamat lengkap.
        10. Angka harga singkat seperti "8,5" berarti Rp8,5 juta.
        11. Merek boleh dilengkapi jika hubungan tipe dan mereknya sudah pasti, misalnya Mio menjadi Yamaha Mio. Jika tidak yakin, jangan menebak.

        --- STRUKTUR DESKRIPSI ---
        1. Pembuka: "Bismillah, [merek, tipe, dan tahun]."
        2. Informasi utama:
           - Mesin normal
           - Kelistrikan normal
           - Surat lengkap STNK dan BPKB
           - Status pajak jika tersedia
           - Kondisi tambahan yang benar-benar terdapat dalam input
        3. Harga: Tuliskan harga dalam format rupiah yang natural dan santai (misal: "Harga 16,9 jt, nego tipis setelah cek unit" atau "Harga 8,5 jt, nego tipis setelah cek unit"). JANGAN PERNAH menulis angka mentah tanpa satuan seperti "Harga 16900000".
        4. Penutup, pilih salah satu secara natural:
           - "Boleh cek dan tes langsung. Minat silakan inbox, terima kasih."
           - "Silakan cek dan coba langsung. Jika berminat, bisa inbox."
           - "Unit boleh dicek langsung. Minat atau mau tanya-tanya, silakan inbox."

        --- FORMAT OUTPUT (WAJIB JSON MURNI) ---
        {
          "mapping": {
            "category": "Pilih salah satu dari: ${this.categories.join(", ")}",
            "title": "Format WAJIB: [Merek] [Model] [Varian] [Tahun] [Pembeda]. Contoh: 'Kawasaki Ninja 250 FI ABS 2017 Plat KT Berau', 'Yamaha Mio 2012 Surat Lengkap'. DILARANG pakai awalan [READY], Dijual, atau Bismillah",
            "price": "Angka saja",
            "tags": "Buat minimal 20 tags SEO relevan dipisah koma (tanpa kata 'Modif')",
            "condition": "Wajib salah satu dari: Baru, Bekas - Seperti Baru, Bekas - Baik, Bekas - Cukup (WAJIB isi salah satu ini, default ke 'Bekas - Seperti Baru' jika tidak yakin)",
            "attributes": { 
              "Jenis kendaraan": "Sepeda Motor", 
              "Merek": "Ekstrak merek", 
              "Model": "Ekstrak model (MURNI nama tipe)", 
              "Tahun": "Tahun (Angka saja)", 
              "Kondisi Kendaraan": "Bekas - Baik", 
              "Jarak Tempuh": "300",
              "Transmisi": "Otomatis/Manual",
              "Jenis bahan bakar": "Bensin",
              "Tipe bodi": "Lainnya"
            }
          },
          "copywriting": {
            "description": "Deskripsi baru yang sudah dioptimalkan sesuai instruksi di atas.",
            "analysis": "Kenapa ini aman",
            "missing_info": ["Info yg kurang"]
          }
        }`;

		try {
			const response = await axios.post(
				"https://api.groq.com/openai/v1/chat/completions",
				{
					model: this.model,
					messages: [
						{
							role: "system",
							content:
								"Kamu adalah sistem backend yang HANYA mengeluarkan JSON murni.",
						},
						{ role: "user", content: prompt },
					],
					temperature: 0.3,
					response_format: { type: "json_object" },
				},
				{
					headers: {
						Authorization: `Bearer ${this.apiKey}`,
						"Content-Type": "application/json",
					},
				},
			);

			const content = response.data.choices[0].message.content;
			const parsed = JSON.parse(content);

			// Sanitize title to ensure pure search keywords at front
			if (parsed?.mapping?.title) {
				parsed.mapping.title = parsed.mapping.title
					.replace(/^\[READY[^\]]*\]\s*/i, "")
					.replace(/^Bismillah(\.\.\.)?\s*/i, "")
					.replace(/^(Dijual|Jual)\s+/i, "")
					.trim();
			}

			// Normalize price to full rupiah
			if (parsed?.mapping?.price) {
				parsed.mapping.price = this.normalizePrice(parsed.mapping.price, parsed.mapping.category);
			}

			// Sanitize description natural price
			if (parsed?.copywriting?.description) {
				parsed.copywriting.description = this.sanitizeDescription(parsed.copywriting.description);
			}

			return parsed;
		} catch (error) {
			this.logger.error("Gagal optimasi AI", error.response?.data || error.message);
			return null;
		}
	}

	async generateTags({ title, location, category, condition }) {
		if (!this.apiKey) {
			this.logger.error("GROQ_API_KEY tidak ditemukan di .env");
			throw new Error("GROQ_API_KEY tidak ditemukan di .env");
		}

		this.logger.info(`Generating tags using AI for: "${title}"...`);

		const prompt = `
        Tugas: Buat tepat 20 tag/kata kunci/tagar SEO yang paling relevan untuk produk di Facebook Marketplace.
        
        --- INFORMASI PRODUK ---
        - Nama Produk: ${title}
        - Lokasi: ${location || "Tidak ditentukan"}
        - Kategori: ${category || "Lainnya"}
        - Kondisi: ${condition || "Bekas - Baik"}

        --- KRITERIA TAGS (PENTING) ---
        1. Hasilkan TEPAT 20 tag, tidak kurang tidak lebih.
        2. Pisahkan setiap tag dengan tanda koma (,), TANPA spasi setelah koma (contoh: tag1,tag2,tag3).
        3. Pikirkan aspek SEO: apa yang diketik orang di kolom pencarian.
        4. Targetkan audiens/manusia yang sedang iseng scrolling Facebook. Gunakan istilah populer, kata kunci lokal pencarian, dan tagar/kata kunci yang pasti menang persaingan algoritma di Facebook Marketplace.
        5. Buat variasi kombinasi nama produk, kategori, kondisi, dan lokasi.
        6. JANGAN gunakan emoji.
        7. JANGAN gunakan tanda pagar (#) di awal kata. Cukup kata/frasa murni.
        8. Format keluaran harus berupa string yang dipisahkan koma dalam format JSON yang valid.

        --- FORMAT OUTPUT (WAJIB JSON MURNI) ---
        {
          "tags": "tag1,tag2,tag3,tag4,tag5,tag6,tag7,tag8,tag9,tag10,tag11,tag12,tag13,tag14,tag15,tag16,tag17,tag18,tag19,tag20"
        }
        `;

		try {
			const response = await axios.post(
				"https://api.groq.com/openai/v1/chat/completions",
				{
					model: this.model,
					messages: [
						{
							role: "system",
							content: "Kamu adalah sistem backend yang HANYA mengeluarkan JSON murni.",
						},
						{ role: "user", content: prompt },
					],
					temperature: 0.6,
					response_format: { type: "json_object" },
				},
				{
					headers: {
						Authorization: `Bearer ${this.apiKey}`,
						"Content-Type": "application/json",
					},
				},
			);

			const content = response.data.choices[0].message.content;
			const parsed = JSON.parse(content);
			return parsed.tags || "";
		} catch (error) {
			const msg = this.formatAIError(error, "Gagal generate tags lewat AI");
			this.logger.error("Gagal generate tags lewat AI", msg);
			throw new Error(msg);
		}
	}
	async generateFieldsFromDescription({ description }) {
		if (!this.apiKey) {
			this.logger.error("GROQ_API_KEY tidak ditemukan di .env");
			throw new Error("GROQ_API_KEY tidak ditemukan di .env");
		}

		this.logger.info(`Detecting category for description...`);

		// 1. Detect Category first (tiny prompt to save tokens)
		let category = "Lain-lain";
		try {
			const catResponse = await axios.post(
				"https://api.groq.com/openai/v1/chat/completions",
				{
					model: this.model,
					messages: [
						{
							role: "system",
							content: "Kamu adalah sistem backend yang HANYA mengeluarkan JSON murni.",
						},
						{
							role: "user",
							content: `Pilih satu kategori produk yang paling cocok dari daftar berikut untuk deskripsi di bawah.

Deskripsi: "${description}"
Daftar Kategori: ${this.categories.join(", ")}

Format Output JSON:
{
  "category": "nama_kategori_terpilih"
}`,
						},
					],
					temperature: 0.1,
					response_format: { type: "json_object" },
				},
				{
					headers: {
						Authorization: `Bearer ${this.apiKey}`,
						"Content-Type": "application/json",
					},
				},
			);

			const catContent = JSON.parse(catResponse.data.choices[0].message.content);
			if (catContent && catContent.category) {
				if (this.categories.includes(catContent.category)) {
					category = catContent.category;
				} else {
					const found = this.categories.find(c => c.toLowerCase() === catContent.category.toLowerCase());
					if (found) category = found;
				}
			}
		} catch (catErr) {
			this.logger.warn("Gagal mendeteksi kategori lewat AI, fallback ke Lain-lain:", catErr.message);
		}

		this.logger.info(`Detected category: "${category}". Generating fields with filtered config...`);

		// 2. Filter FIELD_MAP and FIELD_CONFIG for only the detected category
		const relevantFields = FIELD_MAP[category] || [];
		const trimmedFieldConfig = {};
		for (const field of relevantFields) {
			if (FIELD_CONFIG[field]) {
				if (field === "Tahun") {
					// Ringkas pilihan tahun dari 1900-2026 agar hemat token
					trimmedFieldConfig[field] = {
						type: "select",
						options: ["2026", "2025", "2024", "2023", "2022", "2021", "2020", "... (atau tahun lain hingga 1900 jika sesuai)"]
					};
				} else {
					trimmedFieldConfig[field] = FIELD_CONFIG[field];
				}
			}
		}

		// 3. Request all field mapping and copywriting
		const prompt = `
        Tugas: Kamu adalah asisten AI dan copywriter khusus penjualan motor di Facebook Marketplace yang membantu mengisi form listing secara otomatis berdasarkan deskripsi produk, sekaligus mengubah deskripsi mentah menjadi deskripsi yang singkat, natural, jujur, mudah dipindai, dan terasa seperti ditulis penjual motor lokal. Jangan menggunakan bahasa yang kaku atau terlalu formal.
        
        Kategori Terpilih: ${category}
        
        --- DESKRIPSI PRODUK ASLI ---
        "${description}"

        --- KONFIGURASI ATRIBUT UNTUK KATEGORI INI ---
        Atribut yang wajib/bisa diisi untuk kategori "${category}":
        ${JSON.stringify(relevantFields, null, 2)}
        
        Konfigurasi dan Pilihan Opsi untuk Atribut:
        ${JSON.stringify(trimmedFieldConfig, null, 2)}

        --- FAKTA TETAP BISNIS ---
        1. Semua motor memiliki surat lengkap, yaitu STNK dan BPKB.
        2. Semua motor sudah diperiksa sebelum dijual.
        3. Mesin dan kelistrikan normal saat pengecekan.
        4. Harga hanya dapat dinegosiasikan tipis setelah pembeli mengecek unit.
        5. Pembeli diperbolehkan mengecek dan mencoba motor secara langsung.
        Fakta tetap tersebut boleh dicantumkan meskipun tidak terdapat dalam deskripsi mentah.

        --- ATURAN KEJUJURAN ---
        1. Gunakan hanya informasi dari deskripsi mentah dan fakta tetap bisnis.
        2. Tahun, tipe, harga, pajak, kondisi bodi, ban, odometer, aksesori, serta kekurangan motor harus mengikuti input.
        3. Jangan mengarang informasi yang tidak tersedia.
        4. Status pajak harus mengikuti input:
           - "Pajak off" atau "pajak mati": tulis "Pajak off".
           - "Pajak hidup" atau "pajak aktif": tulis "Pajak aktif".
           - Tidak disebutkan: jangan menuliskan status pajak.
        5. Setiap kekurangan yang terdapat dalam input wajib disampaikan secara jujur.
        6. Jangan mengklaim:
           - Tidak pernah turun mesin
           - Seluruhnya orisinal
           - Tidak ada kekurangan
           - Siap perjalanan jauh
           - Kondisi sangat terawat
           kecuali informasi tersebut memang terdapat dalam input.
        7. Jika input menyebutkan masalah mesin, kelistrikan, atau surat yang bertentangan dengan fakta tetap bisnis, jangan membuat deskripsi. Tulis: "PERLU REVIEW: [alasan singkat]"

        --- RIWAYAT KEPEMILIKAN ---
        1. Jangan membahas motor tangan pertama, kedua, ketiga, atau seterusnya.
        2. Jangan menggunakan kata "motor second", "motor bekas", "oper tangan", atau "pemilik sebelumnya".
        3. Jangan mengklaim atau memberikan kesan bahwa motor merupakan:
           - Tangan pertama
           - Pemakaian pribadi
           - Atas nama sendiri
           - Dimiliki dari baru
           - Jarang dipakai
        4. Fokuskan deskripsi pada kondisi motor sekarang, surat, pajak, harga, dan kesempatan mengecek unit.
        5. Jangan membuat pernyataan palsu mengenai riwayat kepemilikan.

        --- ATURAN NEGOSIASI ---
        1. Sebutkan negosiasi hanya satu kali, menyatu dengan bagian harga.
        2. Gunakan format: "Harga [harga], nego tipis setelah cek unit."
        3. Jangan menggunakan frasa: "Masih bisa nego", "Nego bebas", "Nego sampai deal", "Nego santai", "Nego sadis", "Harga bisa dibicarakan".
        4. Jangan menuliskan kata "nego" pada judul, pembuka, daftar kondisi, atau penutup.

        --- ATURAN GAYA BAHASA ---
        1. Gunakan bahasa penjual lokal yang santai, ringkas, tetapi tetap rapi.
        2. Jangan menulis kalimat kaku seperti: "Unit sudah melalui pemeriksaan mesin dan kelistrikan."
        3. Sampaikan informasi secara singkat:
           - Mesin normal
           - Kelistrikan normal
           - Surat lengkap STNK dan BPKB
        4. Jangan menggunakan kata: "Modifikasi", "Modif", "Modiv", "Custom", "Ganteng", "Cakep", "Keren", "Mantap", dan "Mulus banget".
        5. Jangan menggunakan frasa: "Siapa cepat dia dapat", "Butuh uang", "BU", "Promo", dan "Bonus".
        6. Jangan menggunakan CAPSLOCK, tanda seru berlebihan, atau emoji centang.
        7. Gunakan satu jenis bullet dalam setiap deskripsi, pilih antara strip (-) atau titik (•). Jangan mencampurkan keduanya.
        8. Variasikan susunan dan pilihan kata secara wajar agar setiap deskripsi tidak terlihat identik.
        9. Jangan mencantumkan nomor HP, WhatsApp, atau alamat lengkap.
        10. Angka harga singkat seperti "8,5" berarti Rp8,5 juta.
        11. Merek boleh dilengkapi jika hubungan tipe dan mereknya sudah pasti, misalnya Mio menjadi Yamaha Mio. Jika tidak yakin, jangan menebak.

        --- STRUKTUR DESKRIPSI ---
        1. Pembuka: "Bismillah, [merek, tipe, dan tahun]."
        2. Informasi utama:
           - Mesin normal
           - Kelistrikan normal
           - Surat lengkap STNK dan BPKB
           - Status pajak jika tersedia
           - Kondisi tambahan yang benar-benar terdapat dalam input
        3. Harga: Tuliskan harga dalam format rupiah yang natural dan santai (misal: "Harga 16,9 jt, nego tipis setelah cek unit" atau "Harga 8,5 jt, nego tipis setelah cek unit"). JANGAN PERNAH menulis angka mentah tanpa satuan seperti "Harga 16900000".
        4. Penutup, pilih salah satu secara natural:
           - "Boleh cek dan tes langsung. Minat silakan inbox, terima kasih."
           - "Silakan cek dan coba langsung. Jika berminat, bisa inbox."
           - "Unit boleh dicek langsung. Minat atau mau tanya-tanya, silakan inbox."

        --- INSTRUKSI PENGISIAN FORM ---
        1. Analisis deskripsi untuk menentukan:
           - title (Format WAJIB: [Merek] [Model] [Varian jika ada] [Tahun jika ada] [Pembeda Terpenting jika ada, misal: Surat Lengkap / Plat KT Berau]. Contoh: 'Kawasaki Ninja 250 FI ABS 2017 Plat KT Berau', 'Yamaha Mio 2012 Surat Lengkap'. DILARANG KERAS menggunakan kata awalan seperti '[READY BERAU]', '[READY]', 'Dijual', 'Promo', 'Bismillah', dll. Taruh merek dan tipe di awal judul demi algoritma search FB Marketplace!)
           - price (wajib angka penuh rupiah MURNI tanpa Rp/titik/koma. Logika motor: '18,5' atau '18.5' atau '18,5jt' = 18500000, '7,8' = 7800000, '15jt' = 15000000. DILARANG KERAS menghasilkan angka ratusan rupiah seperti 185 atau 78!)
           - condition (wajib pilih salah satu: Baru, Bekas - Seperti Baru, Bekas - Baik, Bekas - Cukup)
           - tags (tepat 20 tag SEO relevan dipisah koma, format: tag1,tag2,tag3)
           - description (Deskripsi hasil copywriting baru yang sudah dioptimalkan sesuai STRUKTUR & ATURAN DESKRIPSI di atas. Jika motor rusak berat/bermasalah mesin/surat bodong, tulis 'PERLU REVIEW: [alasan]')
        2. Isi nilai untuk atribut dinamis yang ada di "KONFIGURASI ATRIBUT UNTUK KATEGORI INI". Jika field ada di "Pilihan Opsi", nilainya WAJIB persis sama dengan salah satu opsi asli (jika opsi berupa tahun, isi angka tahun yang cocok).
        3. HANYA isi atribut yang tercantum dalam list relevan untuk kategori ini.
        4. Jika ada nilai atribut yang tidak ditemukan di deskripsi, tebak dengan nilai default yang paling masuk akal atau biarkan kosong (string kosong). KHUSUS untuk kategori "Kendaraan", jika atribut "Jarak Tempuh" tidak ditemukan maka wajib diisi default "300", dan jika "Jenis bahan bakar" tidak ditemukan maka wajib diisi default "Bensin".
        
        --- FORMAT OUTPUT (WAJIB JSON MURNI) ---
        {
          "title": "Kawasaki Ninja 250 FI ABS 2017 Plat KT Berau",
          "price": "18500000",
          "condition": "...",
          "category": "${category}",
          "tags": "...",
          "description": "Hasil optimasi deskripsi copywriting...",
          "attributes": {
            "nama_atribut_1": "nilai_1",
            "nama_atribut_2": "nilai_2"
          }
        }
        `;

		try {
			const response = await axios.post(
				"https://api.groq.com/openai/v1/chat/completions",
				{
					model: this.model,
					messages: [
						{
							role: "system",
							content: "Kamu adalah sistem backend yang HANYA mengeluarkan JSON murni.",
						},
						{ role: "user", content: prompt },
					],
					temperature: 0.3,
					response_format: { type: "json_object" },
				},
				{
					headers: {
						Authorization: `Bearer ${this.apiKey}`,
						"Content-Type": "application/json",
					},
				},
			);

			const content = response.data.choices[0].message.content;
			const parsed = JSON.parse(content);
			
			// Sanitize title to ensure pure search keywords at front
			if (parsed.title) {
				parsed.title = parsed.title
					.replace(/^\[READY[^\]]*\]\s*/i, "")
					.replace(/^Bismillah(\.\.\.)?\s*/i, "")
					.replace(/^(Dijual|Jual)\s+/i, "")
					.trim();
			}

			// Normalize price to full rupiah
			if (parsed.price) {
				parsed.price = this.normalizePrice(parsed.price, parsed.category);
			}

			// Sanitize description natural price
			if (parsed.description) {
				parsed.description = this.sanitizeDescription(parsed.description);
			}

			// Programmatic fallback for Kendaraan category defaults
			if (parsed.category === "Kendaraan") {
				if (!parsed.attributes) parsed.attributes = {};
				if (!parsed.attributes["Jarak Tempuh"]) {
					parsed.attributes["Jarak Tempuh"] = "300";
				}
				if (!parsed.attributes["Jenis bahan bakar"]) {
					parsed.attributes["Jenis bahan bakar"] = "Bensin";
				}
			}
			
			return parsed;
		} catch (error) {
			const msg = this.formatAIError(error, "Gagal generate fields lewat AI");
			this.logger.error("Gagal generate fields lewat AI", msg);
			throw new Error(msg);
		}
	}

	/**
	 * Suggest a competitive price based on listing context.
	 */
	async suggestPrice({ title, category, condition, attributes }) {
		if (!this.apiKey) {
			throw new Error("GROQ_API_KEY tidak ditemukan di .env");
		}

		this.logger.info(`Suggesting price for: "${title}"...`);

		const prompt = `Kamu adalah ahli pasar motor bekas di Kalimantan Timur.

Produk: ${title}
Kategori: ${category || "Lainnya"}
Kondisi: ${condition || "Bekas - Baik"}
Atribut: ${JSON.stringify(attributes || {})}

Tugas: Sarankan harga jual yang kompetitif dan realistis untuk produk ini di Facebook Marketplace.
Berikan range harga (minimum, ideal, maximum) dalam angka saja tanpa Rp atau titik.

Format Output JSON:
{
  "min_price": "angka minimum",
  "ideal_price": "angka ideal/rekomendasi",
  "max_price": "angka maximum",
  "reasoning": "alasan singkat kenapa range ini"
}`;

		try {
			const response = await axios.post(
				"https://api.groq.com/openai/v1/chat/completions",
				{
					model: this.model,
					messages: [
						{ role: "system", content: "Kamu adalah sistem backend yang HANYA mengeluarkan JSON murni." },
						{ role: "user", content: prompt },
					],
					temperature: 0.3,
					response_format: { type: "json_object" },
				},
				{
					headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
				},
			);

			return JSON.parse(response.data.choices[0].message.content);
		} catch (error) {
			const msg = this.formatAIError(error, "Gagal suggest price");
			this.logger.error("Gagal suggest price", msg);
			throw new Error(msg);
		}
	}

	/**
	 * Detect potential duplicate listings using title similarity.
	 * Returns array of similar listings with similarity score.
	 */
	detectDuplicates(newTitle, existingListings) {
		if (!newTitle || !existingListings?.length) return [];

		const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
		const newNorm = normalize(newTitle);
		const newWords = new Set(newNorm.split(/\s+/).filter(w => w.length > 2));

		const duplicates = [];
		for (const existing of existingListings) {
			if (!existing.title) continue;
			const existNorm = normalize(existing.title);
			const existWords = new Set(existNorm.split(/\s+/).filter(w => w.length > 2));

			// Jaccard similarity
			const intersection = [...newWords].filter(w => existWords.has(w));
			const union = new Set([...newWords, ...existWords]);
			const similarity = union.size > 0 ? intersection.length / union.size : 0;

			if (similarity >= 0.7) {
				duplicates.push({
					id: existing.id,
					title: existing.title,
					similarity: Math.round(similarity * 100),
				});
			}
		}

		return duplicates.sort((a, b) => b.similarity - a.similarity);
	}
}

module.exports = new AIService();
