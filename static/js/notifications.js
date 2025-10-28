const posterBaseUrl = 'https://image.tmdb.org/t/p/w500';
const backdropBaseUrl = 'https://image.tmdb.org/t/p/original';
const playerBaseUrl = 'https://player.videasy.net';

async function apiGet(path) {
    const res = await fetch(path, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`GET ${path} failed`);
    return res.json();
}

async function apiSend(path, method, body) {
    const res = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'same-origin'
    });
    if (!res.ok) throw new Error(`${method} ${path} failed`);
    return res.json();
}

function createPosterCard(item, mediaType) {
    if (!item.poster_path) return null;
    const posterElement = document.createElement('div');
    posterElement.classList.add('poster-card');
    posterElement.dataset.id = item.id;
    posterElement.dataset.type = mediaType || item.media_type;
    posterElement.innerHTML = `
        <img src="${posterBaseUrl}${item.poster_path}" alt="${item.title || item.name}">
        <div class="hover-card-details">
            <div class="hover-card-media"><div class="loader"></div></div>
        </div>`;
    return posterElement;
}

function displayContentRow(items, container, mediaType) {
    container.innerHTML = '';
    items.forEach((item) => {
        const card = createPosterCard(item, mediaType);
        if (card) container.appendChild(card);
    });
}

async function fetchData(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (error) {
        console.warn('Fetch failed:', url, error.message);
        return null;
    }
}

const apiKey = 'f2d7ae9dee829174c475e32fe8f993dc';

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// Lightweight cache helpers and user-scoped key
function readCache(key) { try { const v = JSON.parse(localStorage.getItem(key) || ''); return (v && v.data) || []; } catch(_) { return []; } }
function writeCache(key, data) { try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch(_) {}
}
function getUserIdForCache() {
    const el = document.getElementById('user-id-data');
    return el ? (el.textContent || '').trim() : 'default';
}

async function loadNotifications() {
    const notificationsList = document.getElementById('notifications-list');
    notificationsList.innerHTML = '<div class="loader"></div>';

    const USER_ID = getUserIdForCache();
    const CACHE_KEY = `srv_notifications_v1_${USER_ID}`;

    // 1) Try cached first for instant paint
    const cached = readCache(CACHE_KEY);
    if (Array.isArray(cached) && cached.length) {
        displayNotifications(cached);
    }

    // 2) Fetch fresh and update UI/cache
    try {
        const notifications = await apiGet('/api/notifications?limit=50');
        writeCache(CACHE_KEY, notifications || []);
        displayNotifications(notifications);
    } catch (error) {
        console.error('Error loading notifications:', error);
        if (!cached || !cached.length) {
            notificationsList.innerHTML = '<div class="empty-message">Failed to load notifications.</div>';
        }
    }
}

function displayNotifications(notifications) {
    const notificationsList = document.getElementById('notifications-list');

    console.log('Notifications page - Total notifications:', notifications.length);
    console.log('Notifications page - Notifications:', notifications);

    if (!notifications || notifications.length === 0) {
        notificationsList.innerHTML = '<div class="empty-message">No notifications yet.</div>';
        return;
    }

    notificationsList.innerHTML = notifications.map(n => {
        const dateStr = new Date(n.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const posterUrl = n.poster_path ? `${posterBaseUrl}${n.poster_path}` : '';
        return `
        <div class="feed-item" data-id="${n.id}">
            ${posterUrl ? `<img class="feed-thumb" src="${posterUrl}" alt="${n.title}">` : `<div class="feed-thumb placeholder"></div>`}
            <div class="feed-body">
                <div class="feed-title">${n.title}</div>
                <div class="feed-subtitle">${n.message}</div>
                <div class="feed-date">${dateStr}</div>
            </div>
            <div class="feed-actions-inline"></div>
        </div>`;
    }).join('');
}

async function markAsRead(notificationId) {
    try {
        await apiSend(`/api/notifications/${notificationId}/mark-read`, 'POST');
        showToast('Notification marked as read');
        loadNotifications(); // Refresh the list
    } catch (error) {
        console.error('Error marking notification as read:', error);
        showToast('Failed to mark notification as read');
    }
}

async function deleteNotification(notificationId) {
    try {
        await apiSend(`/api/notifications/${notificationId}`, 'DELETE');
        showToast('Notification deleted');
        loadNotifications(); // Refresh the list
    } catch (error) {
        console.error('Error deleting notification:', error);
        showToast('Failed to delete notification');
    }
}

async function markAllAsRead() {
    try {
        await apiSend('/api/notifications/mark-all-read', 'POST');
        showToast('All notifications marked as read');
        loadNotifications(); // Refresh the list
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        showToast('Failed to mark all notifications as read');
    }
}

async function fetchTMDBNotifications() {
    try {
        const result = await apiSend('/api/admin/fetch-tmdb-notifications', 'POST');
        showToast(`Fetched ${result.notifications_added} new notifications`);
        loadNotifications(); // Refresh the list
    } catch (error) {
        console.error('Error fetching TMDB notifications:', error);
        showToast('Failed to fetch new notifications');
    }
}

async function loadUpcomingMovies() {
    const container = document.getElementById('upcoming-movies');
    container.innerHTML = '<div class="loader"></div>';

    try {
        const data = await fetchData(`https://api.themoviedb.org/3/movie/upcoming?api_key=${apiKey}&language=en-US&page=1`);
        if (data?.results) {
            displayContentRow(data.results.slice(0, 20), container, 'movie');
        } else {
            container.innerHTML = '<div class="empty-message">No upcoming movies available.</div>';
        }
    } catch (error) {
        console.error('Error loading upcoming movies:', error);
        container.innerHTML = '<div class="empty-message">Failed to load upcoming movies.</div>';
    }
}

async function loadTrendingShows() {
    const container = document.getElementById('trending-shows');
    container.innerHTML = '<div class="loader"></div>';

    try {
        const data = await fetchData(`https://api.themoviedb.org/3/trending/tv/week?api_key=${apiKey}&language=en-US&page=1`);
        if (data?.results) {
            displayContentRow(data.results.slice(0, 20), container, 'tv');
        } else {
            container.innerHTML = '<div class="empty-message">No trending shows available.</div>';
        }
    } catch (error) {
        console.error('Error loading trending shows:', error);
        container.innerHTML = '<div class="empty-message">Failed to load trending shows.</div>';
    }
}

async function loadPopularMovies() {
    const container = document.getElementById('popular-movies');
    container.innerHTML = '<div class="loader"></div>';

    try {
        const data = await fetchData(`https://api.themoviedb.org/3/movie/popular?api_key=${apiKey}&language=en-US&page=1`);
        if (data?.results) {
            displayContentRow(data.results.slice(0, 20), container, 'movie');
        } else {
            container.innerHTML = '<div class="empty-message">No popular movies available.</div>';
        }
    } catch (error) {
        console.error('Error loading popular movies:', error);
        container.innerHTML = '<div class="empty-message">Failed to load popular movies.</div>';
    }
}

// Initialize the page
// --- MOBILE MENU FUNCTIONS ---
function toggleMobileMenu() {
    const popup = document.getElementById('mobile-menu-popup');
    if (popup) {
        popup.classList.toggle('active');
        document.body.classList.toggle('modal-open');
    }
}

function closeMobileMenu() {
    const popup = document.getElementById('mobile-menu-popup');
    if (popup) {
        popup.classList.remove('active');
        document.body.classList.remove('modal-open');
    }
}

function manageProfiles() {
    closeMobileMenu();
    showToast('Manage Profiles - Coming Soon');
}

function appSettings() {
    closeMobileMenu();
    showToast('App Settings - Coming Soon');
}

function accountSettings() {
    closeMobileMenu();
    showToast('Account Settings - Coming Soon');
}

function helpCenter() {
    closeMobileMenu();
    showToast('Help Center - Coming Soon');
}

async function signOut() {
    closeMobileMenu();
    try {
        const response = await fetch('/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin'
        });
        if (response.ok) {
            window.location.href = '/';
        } else {
            showToast('Logout failed');
        }
    } catch (error) {
        console.error('Logout error:', error);
        showToast('Logout failed');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadNotifications();
    // Auto-refresh every 60s
    setInterval(() => { loadNotifications(); }, 60000);

    // Setup mobile menu button
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', toggleMobileMenu);
    }

    // Close menu when clicking outside
    const mobileMenuPopup = document.getElementById('mobile-menu-popup');
    if (mobileMenuPopup) {
        mobileMenuPopup.addEventListener('click', function(e) {
            if (e.target === mobileMenuPopup) {
                closeMobileMenu();
            }
        });
    }

    // Ensure mobile search modal wiring runs even if script.js loaded after DOMContentLoaded
    if (typeof window.setupMobileSearch === 'function') {
        try { window.setupMobileSearch(); } catch (_) {}
    }
});

// Re-use existing modal and player functions from script.js
// These will be available since script.js is loaded first