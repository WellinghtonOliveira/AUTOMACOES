// server.mjs  (ESM – rode com:  node server.mjs )
import puppeteer from 'puppeteer';
import axios from 'axios';
import cheerio from 'cheerio';
import fs from 'fs';
import pLimit from 'p-limit';

const QUERY = 'site:instagram.com "clínica" "facial" "profissional" "@gmail.com"';
const CONC = 10;                 // requisições simultâneas
const OUT_FILE = 'leads_emails.txt';
const LIMIT = 100;                // máx de links que o Google mostra

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
    console.log(`[+] ${e}  (total ${saved})`);
}

async function fetchHtml(url) {
    try {
        const { data } = await axios.get(url, {
            timeout: 8000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        return data;
    } catch { return null; }
}

function extractEmails(html) {
    const $ = cheerio.load(html);
    const mails = $.text().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
    return [...new Set(mails.map(m => m.toLowerCase()))];
}

async function minePage(browser) {
    const page = await browser.newPage();
    await page.goto('https://www.google.com/search?q=' + encodeURIComponent(QUERY), { waitUntil: 'networkidle2' });
    await page.waitForFunction(() => !document.body.textContent.includes('detected unusual traffic'), { timeout: 0 });

    const links = [];
    while (links.length < LIMIT) {
        const batch = await page.$eval('a[href^="http"]', as =>
            as.map(a => a.href)
                .filter(h => h.includes('instagram.com') && !h.includes('google.com'))
        );
        links.push(...batch);
        const next = await page.$('#pnnext');
        if (!next) break;
        await Promise.all([
            page.click('#pnnext'),
            page.waitForNavigation({ waitUntil: 'networkidle2' })
        ]);
    }
    await page.close();
    return [...new Set(links)].slice(0, LIMIT);
}

(async () => {
    console.log('🚀 Capturando lista de links...');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const urls = await minePage(browser);
    console.log(`🔗 ${urls.length} links únicos. Iniciando crawl...`);

    await Promise.all(urls.map(u => limit(async () => {
        const html = await fetchHtml(u);
        if (!html) return;
        extractEmails(html).forEach(appendEmail);
    })));

    console.log(`✅ Finalizado. ${saved} novos e-mails salvos.`);
    await browser.close();
})();
