// server.mjs
import puppeteer from 'puppeteer';
import fs from 'fs';
import pLimit from 'p-limit';

const QUERY = 'site:instagram.com "clínica" "facial" "profissional" "@gmail.com"';
const CONC = 3;                  // Menos concorrência para o Instagram não te banir
const OUT_FILE = 'leads_emails.txt';
const LIMIT = 50;                // Comece com menos para testar

const limit = pLimit(CONC);
const seen = new Set(
    fs.existsSync(OUT_FILE) 
        ? fs.readFileSync(OUT_FILE, 'utf8').split(/\r?\n/).filter(Boolean)
        : []
);
let saved = 0;

function appendEmail(email) {
    const e = email.toLowerCase();
    if (seen.has(e)) return; 
    seen.add(e);
    fs.appendFileSync(OUT_FILE, e + '\n');
    saved++;
    console.log(`[+] ${e} (total ${saved})`);
}

function extractEmails(text) {
    if (!text) return [];
    const mails = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi) || [];
    return [...new Set(mails.map(m => m.toLowerCase()))];
}

async function minePage(browser) {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log('⏳ Acessando Google...');
    await page.goto('https://www.google.com/search?q=' + encodeURIComponent(QUERY), { waitUntil: 'networkidle2' });

    const links = new Set();

    while (links.size < LIMIT) {
        console.log('🔎 Verificando resultados... (Se houver CAPTCHA, resolva-o agora)');

        // ESPERA INFINITA pelo seletor de busca (dá tempo de resolver o captcha)
        try {
            await page.waitForSelector('#search', { timeout: 0 });
        } catch (e) {
            console.log('Refazendo busca...');
            await page.reload({ waitUntil: 'networkidle2' });
            continue;
        }

        // Extrai os links
        const batch = await page.$$eval('#search a', as =>
            as.map(a => a.href)
                .filter(h => h && h.includes('instagram.com/') && !h.includes('google.com'))
        );

        batch.forEach(l => links.add(l));
        console.log(`[i] Total de links coletados: ${links.size}`);

        if (links.size >= LIMIT) break;

        const next = await page.$('#pnnext');
        if (!next) {
            console.log("[-] Fim dos resultados ou nova verificação necessária.");
            break;
        }

        console.log('➡️ Indo para próxima página...');
        await Promise.all([
            page.click('#pnnext'),
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 })
        ]).catch(() => console.log("Aviso: Lentidão na transição de página."));
    }

    await page.close();
    return Array.from(links).slice(0, LIMIT);
}

async function scrapeInstagram(browser, url) {
    return limit(async () => {
        const page = await browser.newPage();
        try {
            // Instagram é pesado, vamos desativar imagens para ser mais rápido
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                if (['image', 'stylesheet', 'font'].includes(req.resourceType())) req.abort();
                else req.continue();
            });

            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

            // Extrai o texto visível e o HTML
            const content = await page.content();
            const emails = extractEmails(content);
            emails.forEach(appendEmail);
        } catch (err) {
            console.log(`[!] Erro ao abrir ${url}: ${err.message}`);
        } finally {
            await page.close();
        }
    });
}

(async () => {
    console.log('🚀 Iniciando Automador...');
    const browser = await puppeteer.launch({
        headless: false, // OBRIGATÓRIO estar false para você ver o CAPTCHA
        args: ['--no-sandbox', '--window-size=1280,720']
    });

    try {
        const urls = await minePage(browser);

        if (urls.length > 0) {
            console.log(`\n🔗 Extraindo e-mails de ${urls.length} perfis...`);
            await Promise.all(urls.map(u => scrapeInstagram(browser, u)));
        } else {
            console.log('❌ Nenhum link foi capturado.');
        }

    } catch (error) {
        console.error("Erro crítico:", error);
    } finally {
        console.log(`\n✅ Processo finalizado. Novos e-mails: ${saved}`);
        // await browser.close(); // Comentei para você ver o estado final do navegador
    }
})();