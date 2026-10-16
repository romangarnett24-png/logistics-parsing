document.addEventListener('DOMContentLoaded', () => {

    // --- Elements ---
    const forms = document.querySelectorAll('.track-form');
    const refreshBtn = document.getElementById('refresh-history');
    const historyList = document.getElementById('history-list');
    const toast = document.getElementById('toast');

    // --- Toast Notification ---
    function showToast(message, type = 'success') {
        toast.textContent = message;
        toast.className = `toast show ${type}`;
        setTimeout(() => {
            toast.className = 'toast';
        }, 3000);
    }

    // --- Form Handling ---
    forms.forEach(form => {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const carrier = form.dataset.carrier;
            const input = form.querySelector('input[name="trackNumber"]');
            const trackNumber = input.value.trim();
            const btn = form.querySelector('button');
            const card = document.getElementById(`card-${carrier.toLowerCase()}`);
            const resultContainer = card.querySelector('.result-container');
            const skeleton = card.querySelector('.skeleton-loader');

            if (!trackNumber) return;

            // UI Loading state
            btn.disabled = true;
            resultContainer.style.display = 'none';
            skeleton.style.display = 'block';

            try {
                const response = await fetch('/api/track', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ carrier, trackNumber })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Произошла ошибка при отслеживании');
                }

                renderResult(card, data);
                showToast(`Информация по ${trackNumber} получена`);
                loadHistory(); // Refresh history sidebar

            } catch (error) {
                showToast(error.message, 'error');
            } finally {
                btn.disabled = false;
                skeleton.style.display = 'none';
            }
        });
    });

    // --- Render Results ---
    function renderResult(card, data) {
        const resultContainer = card.querySelector('.result-container');
        const summary = resultContainer.querySelector('.status-summary');
        const timeline = resultContainer.querySelector('.timeline');

        summary.textContent = `Текущий статус: ${data.status}`;

        timeline.innerHTML = ''; // Clear previous

        if (data.history && data.history.length > 0) {
            data.history.forEach(item => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <span class="timeline-date">${item.date}</span>
                    <span class="timeline-status">${item.status}</span>
                    ${item.location ? `<span class="timeline-location">${item.location}</span>` : ''}
                `;
                timeline.appendChild(li);
            });
        } else {
            timeline.innerHTML = '<li>Нет подробной истории</li>';
        }

        resultContainer.style.display = 'block';
    }

    // --- History Sidebar ---
    async function loadHistory() {
        try {
            const res = await fetch('/api/history');
            const records = await res.json();

            if (records.length === 0) {
                historyList.innerHTML = '<p class="empty-state">История пуста</p>';
                return;
            }

            historyList.innerHTML = '';
            records.forEach(record => {
                const div = document.createElement('div');
                div.className = `history-item ${record.is_delivered ? 'history-delivered' : ''}`;

                div.innerHTML = `
                    <button class="history-delete" data-carrier="${record.carrier}" data-track="${record.track_number}">&times;</button>
                    <div class="history-carrier">${record.carrier}</div>
                    <div class="history-track">${record.track_number}</div>
                    <div class="history-status">${record.status_text || 'Нет статуса'}</div>
                `;

                // Click to view
                div.addEventListener('click', (e) => {
                    if (e.target.classList.contains('history-delete')) return;

                    const cardId = `card-${record.carrier.toLowerCase()}`;
                    const card = document.getElementById(cardId);

                    if (card) {
                        // Fill input and render data
                        const input = card.querySelector('input[name="trackNumber"]');
                        input.value = record.track_number;

                        renderResult(card, {
                            status: record.status_text,
                            history: record.history
                        });

                        // Scroll to card on mobile
                        if (window.innerWidth <= 768) {
                            card.scrollIntoView({ behavior: 'smooth' });
                        }
                    }
                });

                historyList.appendChild(div);
            });

            // Attach delete listeners
            document.querySelectorAll('.history-delete').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const carrier = e.target.dataset.carrier;
                    const trackNumber = e.target.dataset.track;

                    if(confirm(`Удалить ${trackNumber} из истории?`)) {
                         await deleteHistoryItem(carrier, trackNumber);
                    }
                });
            });

        } catch (error) {
            console.error('Ошибка загрузки истории', error);
        }
    }

    async function deleteHistoryItem(carrier, trackNumber) {
        try {
            const res = await fetch('/api/history', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ carrier, trackNumber })
            });

            if (res.ok) {
                showToast(`Трек ${trackNumber} удален`);
                loadHistory();
            } else {
                showToast('Ошибка удаления', 'error');
            }
        } catch (error) {
            showToast('Ошибка удаления', 'error');
        }
    }

    refreshBtn.addEventListener('click', loadHistory);

    // Initial load
    loadHistory();
});
