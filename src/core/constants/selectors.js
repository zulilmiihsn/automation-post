module.exports = {
	SELECTORS: {
		TITLE: [
			'label:has-text("Judul") input',
			'label:has-text("Title") input',
		],
		PRICE: [
			'label:has-text("Harga") input',
			'label:has-text("Price") input',
		],
		NEXT_BTN: [
			'[aria-label="Selanjutnya"]',
			'[aria-label="Next"]',
		],
		PUBLISH_BTN: [
			'[role="button"]:has-text("Terbitkan")',
			'[role="button"]:has-text("Publish")',
		],
		DESCRIPTION: [
			'div[aria-label="Keterangan"]',
			'div[aria-label="Description"]',
		],
		SHARE_BTN: [
			'div[role="button"][aria-label*="Send this to friends" i]',
			'div[role="button"][aria-label*="Kirimkan ini ke teman" i]',
			'div[role="button"]:has-text("Share")',
			'div[role="button"]:has-text("Bagikan")',
			'[aria-label*="Share" i]',
			'[aria-label*="Bagikan" i]',
		],
		SHARE_TO_GROUP_BTN: [
			'div[role="button"]:has-text("Share to a group")',
			'div[role="button"]:has-text("Bagikan ke grup")',
			'div[role="menuitem"]:has-text("Share to a group")',
			'div[role="menuitem"]:has-text("Bagikan ke grup")',
			'span:has-text("Share to a group")',
			'span:has-text("Bagikan ke grup")',
		],
		GROUP_SEARCH_INPUT: [
			'input[type="text"]',
			'input[type="search"]',
		],
		RESTRICTION_INDICATORS: [
			// Monthly / Listing limit (EN & ID)
			"You have reached your monthly limit",
			"reached your monthly limit",
			"monthly limit of",
			"monthly listing limit",
			"create new listings on or after",
			"reached your limit of",
			"reached your limit",
			"listing limit",
			"Anda telah mencapai batas bulanan",
			"mencapai batas bulanan",
			"batas bulanan sebesar",
			"batas listing bulanan",
			"telah mencapai batas listing",
			"membuat listingan baru pada atau setelah",
			"mencapai batas listing",

			// General limit & restriction
			"Limit reached",
			"Batas tercapai",
			"You are not able to create new listings",
			"Anda tidak dapat membuat tawaran baru",
			"Too many listings",
			"Sering memposting",
			"You can't access Marketplace",
			"Anda tidak dapat mengakses Marketplace",
			"You can't buy or sell items on Facebook",
			"Anda tidak dapat membeli atau menjual item di Facebook",
			"can't buy or sell",
			"You can't use this feature right now",
			"Anda tidak bisa menggunakan fitur ini",
			"Tindakan Diblokir",
			"Action Blocked",
			"Kami membatasi seberapa sering",
			"We limit how often",
			"You're Temporarily Blocked",
			"Fitur Diblokir Sementara",
		],
		GROUP_SHARE_OPTION: ["Bagikan ke grup", "Share to a group"],
		FEED_COMPOSER_TRIGGER: [
			"What's on your mind",
			"Apa yang Anda pikirkan",
			"Create a post",
			"Buat postingan",
			"Write something",
			"Tulis sesuatu",
		],
		COPY_LINK_BTN: [
			"Copy link",
			"Salin tautan",
			"Salin link",
		],
		MODAL_CLOSE: [
			'[aria-label="Close"]',
			'[aria-label="Tutup"]',
			'[aria-label="Escape"]',
		],
	},

	DYNAMIC_SELECTORS: {
		CATEGORY_BOX: [
			'label[role="combobox"]:has-text("Kategori")',
			'label[role="combobox"]:has-text("Category")',
		],
		CONDITION_BOX: [
			'label[role="combobox"]:has-text("Kondisi")',
			'label[role="combobox"]:has-text("Condition")',
		],
	}
};
