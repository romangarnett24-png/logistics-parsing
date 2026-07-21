const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

// ============================================
// CSE Parser
// ============================================
async function trackCSE(trackNumber) {
    try {
        // Based on common public CSE API or page structure.
        // Needs adjustment if actual CSE API differs. We'll use a direct request to lk.cse.ru as mentioned.
        const response = await axios.post('https://lk.cse.ru/api/web/v2/tracking/search', {
            numbers: [trackNumber]
        }, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        if (response.data && response.data.length > 0 && response.data[0].history) {
            const history = response.data[0].history.map(item => ({
                date: item.date,
                status: item.status_name,
                location: item.city_name || ''
            }));

            return {
                carrier: 'CSE',
                trackNumber,
                status: history.length > 0 ? history[0].status : 'Нет данных',
                history: history
            };
        }
        throw new Error('Данные не найдены');
    } catch (error) {
        console.error(`CSE parsing error for ${trackNumber}:`, error.message);
        throw new Error(`Ошибка отслеживания КСЭ: ${error.message}`);
    }
}

// ============================================
// Major Express Parser (Axios + Cheerio)
// ============================================
async function trackMajor(trackNumber) {
    try {
        // Fetch HTML page
        const response = await axios.get(`https://major-express.ru/Trace.aspx?wbn=${trackNumber}`, {
            headers: {
                 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            },
            timeout: 10000
        });

        const $ = cheerio.load(response.data);

        // Example selector (needs to match actual major-express.ru table structure)
        const history = [];
        $('#ctl00_ContentPlaceHolder1_gvTrace tr').each((i, el) => {
            if (i === 0) return; // Skip header
            const cols = $(el).find('td');
            if (cols.length >= 3) {
                history.push({
                    date: $(cols[0]).text().trim(),
                    status: $(cols[1]).text().trim(),
                    location: $(cols[2]).text().trim()
                });
            }
        });

        if (history.length > 0) {
            return {
                carrier: 'Major',
                trackNumber,
                status: history[0].status,
                history: history
            };
        }

        throw new Error('Данные не найдены или трек-номер неверен');
    } catch (error) {
         console.error(`Major Express parsing error for ${trackNumber}:`, error.message);
         throw new Error(`Ошибка отслеживания Major Express: ${error.message}`);
    }
}

// ============================================
// CDEK Parser (Puppeteer)
// ============================================
let browserInstance = null;

async function getBrowser() {
    if (!browserInstance) {
        browserInstance = await puppeteer.launch({
            headless: 'new', // Use new headless mode
            args: ['--no-sandbox', '--disable-setuid-sandbox']
            // Removed CHROME_PATH to allow Puppeteer to use its bundled Chromium automatically
        });
    }
    return browserInstance;
}

async function trackCDEK(trackNumber) {
    let page = null;
    try {
        const browser = await getBrowser();
        page = await browser.newPage();

        // Randomize user agent slightly
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');

        // Go to main tracking page to bypass basic bot protection
        await page.goto('https://cdek.ru/tracking', { waitUntil: 'domcontentloaded', timeout: 15000 });

        // Fetch API data directly using the established session
        const apiUrl = `https://cdek.ru/api-site/track/info/${trackNumber}`;

        const response = await page.evaluate(async (url) => {
             const res = await fetch(url, {
                headers: {
                    'Accept': 'application/json, text/plain, */*'
                }
             });
             return await res.json();
        }, apiUrl);

        if (response && response.status === 'SUCCESS' && response.entity) {
            const pkg = response.entity;
            const history = [];

            if (pkg.statuses && pkg.statuses.length > 0) {
                // Reverse to get newest first if they are in chronological order
                const sortedStatuses = [...pkg.statuses].reverse();
                sortedStatuses.forEach(s => {
                    history.push({
                        date: s.date || s.datetime,
                        status: s.name,
                        location: s.city || ''
                    });
                });
            }

            return {
                carrier: 'CDEK',
                trackNumber,
                status: history.length > 0 ? history[0].status : (pkg.status || 'В пути'),
                history: history
            };
        }

        throw new Error('Некорректный ответ от API СДЭК');

    } catch (error) {
        console.error(`CDEK parsing error for ${trackNumber}:`, error.message);
        throw new Error(`Ошибка отслеживания СДЭК: ${error.message}`);
    } finally {
        if (page) await page.close();
    }
}

// Ensure browser is closed on exit
process.on('exit', () => {
    if (browserInstance) {
        browserInstance.close();
    }
});

module.exports = {
    trackCSE,
    trackMajor,
    trackCDEK
};
