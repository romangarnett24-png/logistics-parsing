const express = require('express');
const path = require('path');
const cron = require('node-cron');
const { trackCSE, trackMajor, trackCDEK } = require('./parsers');
const { addOrUpdateRecord, getAllRecords, getUndeliveredRecords, deleteRecord } = require('./historyStore');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Mapping carrier string to parser function
const parsers = {
    'CSE': trackCSE,
    'Major': trackMajor,
    'CDEK': trackCDEK
};

// ============================================
// API Endpoints
// ============================================

// 1. Track a new or existing package
app.post('/api/track', async (req, res) => {
    const { carrier, trackNumber } = req.body;

    if (!carrier || !trackNumber) {
        return res.status(400).json({ error: 'Необходимо указать carrier и trackNumber' });
    }

    const parser = parsers[carrier];
    if (!parser) {
        return res.status(400).json({ error: 'Неизвестная транспортная компания' });
    }

    try {
        const result = await parser(trackNumber);

        // Save to DB
        addOrUpdateRecord(carrier, trackNumber, result.status, result.history);

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. Get history
app.get('/api/history', (req, res) => {
    try {
        const records = getAllRecords();
        res.json(records);
    } catch (error) {
        res.status(500).json({ error: 'Ошибка при чтении истории' });
    }
});

// 3. Delete from history
app.delete('/api/history', (req, res) => {
    const { carrier, trackNumber } = req.body;

    if (!carrier || !trackNumber) {
        return res.status(400).json({ error: 'Необходимо указать carrier и trackNumber' });
    }

    try {
        deleteRecord(carrier, trackNumber);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка при удалении записи' });
    }
});

// ============================================
// Cron Job for Background Updates
// ============================================

// Runs sequentially to save memory and CPU
async function runScheduledUpdates() {
    console.log(`[Cron] Запуск фонового обновления в ${new Date().toLocaleString()}...`);
    const undelivered = getUndeliveredRecords();

    console.log(`[Cron] Найдено ${undelivered.length} активных отправлений.`);

    for (const record of undelivered) {
        const { carrier, track_number: trackNumber } = record;
        const parser = parsers[carrier];

        if (parser) {
            try {
                console.log(`[Cron] Обновление: ${carrier} - ${trackNumber}`);
                const result = await parser(trackNumber);
                addOrUpdateRecord(carrier, trackNumber, result.status, result.history);

                // Pause between requests to avoid bans
                await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (error) {
                console.error(`[Cron] Ошибка при обновлении ${carrier} ${trackNumber}:`, error.message);
            }
        }
    }
    console.log(`[Cron] Фоновое обновление завершено.`);
}

// Schedule tasks at 10:00 and 16:00
cron.schedule('0 10,16 * * *', () => {
    runScheduledUpdates();
});

// ============================================
// Start Server
// ============================================
app.listen(PORT, () => {
    console.log(`Сервер MultiTrack запущен на http://localhost:${PORT}`);
    console.log(`Для остановки нажмите Ctrl+C`);
});
