const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const account = process.argv[2] || 'akun_1';
    const profilePath = path.join(__dirname, 'profiles', account);
    
    console.log(`[🚀] Buka custom recorder ANTI-LAG untuk akun: ${account}...`);
    console.log(`-------------------------------------------------------------`);
    console.log(`CARA PAKAI:`);
    console.log(`1. Tahan tombol ALT di keyboard (nanti elemen bakal di-highlight pink).`);
    console.log(`2. Klik elemen yang mau diambil kodenya.`);
    console.log(`3. Kode Playwright (getByRole / aria-label) bakal muncul di terminal ini.`);
    console.log(`4. Lepas tombol ALT buat klik normal/browsing biasa.`);
    console.log(`-------------------------------------------------------------\n`);

    const context = await chromium.launchPersistentContext(profilePath, {
        headless: false,
        viewport: null, // Fullscreen
        args: ['--start-maximized']
    });

    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

    // Fungsi kirim data dari browser ke terminal kita
    await page.exposeFunction('logLocator', (data) => {
        let locatorStr = '';
        if (data.role && data.name) {
            // Escape special regex chars
            let safeName = data.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            locatorStr = `page.getByRole('${data.role.toLowerCase()}', { name: /${safeName}/i })`;
        } else if (data.role) {
            locatorStr = `page.getByRole('${data.role.toLowerCase()}')`;
        } else if (data.name) {
            let safeName = data.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            locatorStr = `page.getByText(/${safeName}/i)`;
        } else {
            locatorStr = `page.locator('${data.tag}')`;
        }
        finalSelector = locatorStr;
        let target = data.targetInfo;

						console.log('\n🎯 KLIK TERDETEKSI:');
						console.log('   KODE COPY     : ' + finalSelector);
						
						if (data.hierarchy) {
							console.log('\n   [DOM HIERARCHY DUMP]');
							console.log('   ' + data.hierarchy.trim().replace(/\n/g, '\n   '));
						}
						console.log('--------------------------------------------------');
    });

    // Suntik script ke setiap halaman FB yang dibuka
    await page.addInitScript(() => {
        let activeEl = null;
        let inspectMode = false;

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Alt') {
                inspectMode = true;
                if (!document.getElementById('pw-inspect-style')) {
                    const style = document.createElement('style');
                    style.id = 'pw-inspect-style';
                    style.innerHTML = `
                        .pw-hover-highlight {
                            outline: 3px solid #ff00ff !important;
                            background-color: rgba(255, 0, 255, 0.2) !important;
                            cursor: crosshair !important;
                            transition: all 0.1s !important;
                        }
                    `;
                    if (document.documentElement) document.documentElement.appendChild(style);
                }
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.key === 'Alt') {
                inspectMode = false;
                if (activeEl) {
                    activeEl.classList.remove('pw-hover-highlight');
                    activeEl = null;
                }
            }
        });

        document.addEventListener('mouseover', (e) => {
            if (!inspectMode) return;
            if (activeEl) activeEl.classList.remove('pw-hover-highlight');
            activeEl = e.target;
            activeEl.classList.add('pw-hover-highlight');
        });

        document.addEventListener('click', (e) => {
            if (!inspectMode) return;
            
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            const el = e.target;
            
            // Coba naik ke atas cari elemen yang punya role/aria-label (max 4 level ke atas)
            let curr = el;
            let role = '';
            let name = '';
            let tag = '';
            
            for (let i = 0; i < 4; i++) {
                if (!curr) break;
                
                if (!role) role = curr.getAttribute('role');
                if (!name) name = curr.getAttribute('aria-label');
                tag = curr.tagName.toLowerCase();

                if (role || name) break; // Ketemu role atau aria-label, setop naik
                curr = curr.parentElement;
            }

            if (!curr) curr = el; // kalau gak nemu apa-apa, pakai elemen yg diklik aja
            
            // Fallback Role dari tag HTML standar
            if (!role) {
                const tagMap = {
                    'button': 'button',
                    'a': 'link',
                    'input': 'textbox',
                    'img': 'img',
                    'h1': 'heading', 'h2': 'heading', 'h3': 'heading',
                    'svg': 'img'
                };
                role = tagMap[curr.tagName.toLowerCase()] || '';
            }

            // Fallback Nama dari Teks
            if (!name) {
                const text = (curr.innerText || "").trim().split('\\n')[0];
                if (text && text.length < 50) name = text;
                else name = curr.placeholder || curr.value || '';
            }

            // Serialisasi DOM hierarchy
            let domDump = "";
            let ptr = curr;
            for(let i=0; i<4; i++) {
                if(!ptr) break;
                let tagStr = "<" + ptr.tagName.toLowerCase();
                for(let j=0; j<ptr.attributes.length; j++) {
                    let attr = ptr.attributes[j];
                    if(attr.name !== 'style' && attr.name !== 'class' || attr.name === 'class') {
                        tagStr += ` ${attr.name}="${attr.value}"`;
                    }
                }
                tagStr += ">";
                domDump = "L" + i + ": " + tagStr + "\\n" + domDump;
                ptr = ptr.parentElement;
            }

            window.logLocator({
                tag: curr.tagName.toLowerCase(),
                role: role,
                name: name,
                hierarchy: domDump
            });
            
        }, { capture: true });
    });

    await page.goto('https://www.facebook.com');
})();
