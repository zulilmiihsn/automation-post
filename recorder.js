const { execSync } = require('child_process');
const path = require('path');

// Secara default pakai akun_1, bisa diganti saat run: node recorder.js akun_2
const account = process.argv[2] || 'akun_1';
const profilePath = path.join(__dirname, 'profiles', account);
const url = 'https://www.facebook.com';

console.log(`Menjalankan Playwright Inspector (Recorder) pakai profil: ${account}...`);
console.log(`Buka browser dan lakukan aksi. Locator terbaik (getByRole, getByLabel) otomatis dicatat di jendela inspector.`);
console.log(`Tutup browser kalau sudah selesai.\n`);

try {
    execSync(`npx playwright codegen --user-data-dir="${profilePath}" "${url}"`, { stdio: 'inherit' });
} catch (error) {
    console.error("Gagal menjalankan recorder", error);
}
