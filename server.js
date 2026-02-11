const puppeteer = require('puppeteer');
const fs = require('fs');

console.log("🚀 O robô começou a trabalhar... aguarde o navegador abrir.");

const delay = (ms) => new Promise(res => setTimeout(res, ms));

// --- FUNÇÃO PARA DETECTAR E ESPERAR O CAPTCHA ---
async function handleCaptcha(page) {
    // Verifica se existe o iframe do reCAPTCHA ou formulário de captcha do Google
    const isCaptchaVisible = await page.evaluate(() => {
        return !!document.getElementById('captcha-form') ||
            !!document.querySelector('iframe[src*="api2/anchor"]') ||
            document.body.innerText.includes("nossa rede") || // Mensagem comum de bloqueio
            document.body.innerText.includes("detected unusual traffic");
    });

    if (isCaptchaVisible) {
        console.log("\n⚠️  CAPTCHA DETECTADO! ⚠️");
        console.log("Aguardando você resolver o desafio manualmente no navegador...");

        // Espera até que o elemento do captcha saia do DOM ou a página mude
        await page.waitForFunction(() => {
            return !document.getElementById('captcha-form') &&
                !document.querySelector('iframe[src*="api2/anchor"]') &&
                !document.body.innerText.includes("detected unusual traffic");
        }, { timeout: 0 }); // timeout 0 faz ele esperar para sempre

        console.log("✅ Captcha resolvido! Retomando o trabalho...\n");
        await delay(2000); // Pequena pausa extra para garantir o carregamento
    }
}

async function scrapeEmails() {
    const browser = await puppeteer.launch({
        headless: false, // Precisa ser false para você conseguir resolver o captcha
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

    const searchTerm = 'site:instagram.com "clinica" "estetica" "@gmail.com"';
    await page.goto(`https://www.google.com/search?q=${encodeURIComponent(searchTerm)}`);

    let allEmails = new Set();
    const paginasParaProcessar = 10;

    for (let p = 0; p < paginasParaProcessar; p++) {
        // Verifica captcha antes de começar cada página
        await handleCaptcha(page);

        console.log(`\n--- Minerando Página ${p + 1} do Google ---`);

        // Aguarda pelo menos um resultado de pesquisa aparecer na tela
        try {
            await page.waitForSelector('h3', { timeout: 10000 });
        } catch (e) {
            console.log("⚠️  Aviso: Não encontrou títulos 'h3'. Verifique se a página carregou ou se há CAPTCHA.");
            await handleCaptcha(page); // Verifica se o motivo de não achar links é um captcha
        }

        // Captura links dos resultados com seletores mais modernos
        const links = await page.evaluate(() => {
            // Busca todos os links que estão dentro de um H3 (padrão atual do Google)
            // ou que possuem o atributo data-ved (usado em links de resultado)
            const anchors = Array.from(document.querySelectorAll('a h3')).map(h3 => h3.closest('a'));

            return anchors
                .map(a => a ? a.href : null)
                .filter(href =>
                    href &&
                    href.startsWith('http') &&
                    !href.includes('google.com') &&
                    !href.includes('webcache.googleusercontent.com')
                );
        });

        console.log(`🔗 Links encontrados nesta página: ${links.length}`);

        if (links.length === 0) {
            console.log("⚠️ Nenhum link encontrado. Pode ser um bloqueio silencioso ou fim dos resultados.");
        }

        for (let link of links) {
            const detailPage = await browser.newPage();
            try {
                await detailPage.goto(link, { waitUntil: 'domcontentloaded', timeout: 15000 });

                const textContent = await detailPage.evaluate(() => document.body.innerText);
                const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
                const found = textContent.match(emailRegex);

                if (found) {
                    found.forEach(email => {
                        const cleanEmail = email.toLowerCase();
                        if (!allEmails.has(cleanEmail)) {
                            allEmails.add(cleanEmail);
                            console.log(`  [+] Novo E-mail: ${cleanEmail}`);
                        }
                    });
                }
            } catch (err) {
                console.log(`  [!] Ignorado: ${link.substring(0, 30)}...`);
            }
            await detailPage.close();
            await delay(1500); // Aumentado um pouco para evitar detecção
        }

        // Salva progresso
        fs.writeFileSync('leads_emails.txt', Array.from(allEmails).join('\n'));

        // Próxima página
        const nextButton = await page.$('#pnnext');
        if (nextButton) {
            console.log("Indo para a próxima página do Google...");
            await Promise.all([
                page.click('#pnnext'),
                page.waitForNavigation({ waitUntil: 'networkidle2' }),
            ]);
            await delay(3000);
        } else {
            // Verifica se não tem o próximo porque caiu em um captcha no final da página
            await handleCaptcha(page);

            // Se após o captcha ainda não houver botão, realmente acabou
            const retryNext = await page.$('#pnnext');
            if (!retryNext) {
                console.log("Fim das páginas disponíveis.");
                break;
            }
        }
    }

    console.log(`\n✅ Concluído! Total: ${allEmails.size} e-mails salvos.`);
    await browser.close();
}

scrapeEmails().catch(err => {
    console.error("❌ Erro geral:", err);
});