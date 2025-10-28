        const apiKey = 'f2d7ae9dee829174c475e32fe8f993dc';
        const posterBaseUrl = 'https://image.tmdb.org/t/p/w500';
        const backdropBaseUrl = 'https://image.tmdb.org/t/p/original';
        const playerBaseUrl = 'https://player.videasy.net';
        
        // Notification management
        let notificationsCache = [];
        let unreadCount = 0;
        let notificationPollingInterval = null;
        let notificationWebSocket = null;

        const SERVER_SEED = (() => {
            try {
                const el = document.getElementById('my-netflix-payload');
                if (el) {
                    const txt = el.textContent || el.innerText || '{}';
                    return JSON.parse(txt);
                }
            } catch (e) { /* ignore */ }
            return (typeof window !== 'undefined' && window.__MY_NETFLIX_INITIAL__) ? window.__MY_NETFLIX_INITIAL__ : {};
        })();

        // Get user ID for user-specific caching
        const USER_ID = (() => {
            try {
                const el = document.getElementById('user-id-data');
                return el ? el.textContent.trim() : 'default';
            } catch (e) {
                return 'default';
            }
        })();

        // In-memory caches loaded from server
        let MY_LIST_CACHE = [];
        let LIKED_LIST_CACHE = [];
        let TRAILERS_WATCHED_CACHE = [];

        // Persistent browser cache for fast startup (user-specific)
        const CACHE_KEYS = {
            MY_LIST: `srv_my_list_v1_${USER_ID}`,
            LIKES: `srv_likes_v1_${USER_ID}`,
            TRAILERS: `srv_trailers_v1_${USER_ID}`,
            NOTIFICATIONS: `srv_notifications_v1_${USER_ID}`
        };

        // Clean up caches from other users
        function cleanupOldCaches() {
            try {
                const keysToClean = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && (key.startsWith('srv_my_list_v1_') || key.startsWith('srv_likes_v1_') || key.startsWith('srv_trailers_v1_'))) {
                        // If this cache key doesn't belong to current user, mark it for deletion
                        if (!key.endsWith(`_${USER_ID}`)) {
                            keysToClean.push(key);
                        }
                    }
                }
                // Remove old user caches
                keysToClean.forEach(key => localStorage.removeItem(key));
                if (keysToClean.length > 0) {
                    console.log(`Cleaned up ${keysToClean.length} old cache entries`);
                }
            } catch (e) {
                console.warn('Could not clean up old caches:', e);
            }
        }

        const MEDIA_DETAILS_CACHE = new Map();
        function cacheWrite(key, data) {
            try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch (_) {}
        }
        function cacheRead(key) {
            try { const v = JSON.parse(localStorage.getItem(key) || ''); return (v && v.data) || []; } catch (_) { return []; }
        }

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

        function showToast(message) {
            const toast = document.getElementById('toast');
            toast.textContent = message;
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
            }, 3000);
        }

        function updateAllButtons(itemId, mediaType) {
            const normalizedType = (mediaType || '').toLowerCase();
            const likedList = LIKED_LIST_CACHE || [];
            const myList = MY_LIST_CACHE || [];

            const isLiked = likedList.some(item => String(item.id) === String(itemId) && (item.media_type || resolveMediaIdentifiers(item).mediaType) === normalizedType);
            const isInMyList = myList.some(item => String(item.id) === String(itemId) && (item.media_type || resolveMediaIdentifiers(item).mediaType) === normalizedType);

            const addListIcon = isInMyList
                ? '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"></path></svg>'
                : '<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"></path></svg>';

            document.querySelectorAll(`.like-btn[data-id="${itemId}"][data-type="${normalizedType}"]`).forEach(button => {
                button.classList.toggle('liked', isLiked);
            });

            document.querySelectorAll(`.add-list-btn[data-id="${itemId}"][data-type="${normalizedType}"], .btn-mylist-mobile[data-id="${itemId}"][data-type="${normalizedType}"]`).forEach(button => {
                button.classList.toggle('added', isInMyList);
                if (button.classList.contains('btn-mylist-mobile')) {
                    button.innerHTML = `${addListIcon} My List`;
                } else {
                    button.innerHTML = addListIcon;
                }
            });
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
                    <div class="hover-card-media">
                        <div class="loader"></div>
                    </div>
                </div>
            `;
            return posterElement;
        }

        function findCachedItem(mediaType, itemId) {
            const collections = [MY_LIST_CACHE, LIKED_LIST_CACHE, TRAILERS_WATCHED_CACHE];
            for (const list of collections) {
                if (!Array.isArray(list)) continue;
                const found = list.find(entry => String(entry.id) === String(itemId) && entry.media_type === mediaType);
                if (found) return found;
            }
            return null;
        }

        function renderHoverFallback(container, title) {
            container.innerHTML = `
                <div class="hover-card-body">
                    <p class="hover-card-overview">Preview unavailable right now.</p>
                    <div class="hover-card-meta">
                        <span class="meta-year">${title ? title : 'Try again later'}</span>
                    </div>
                </div>
            `;
        }

        async function fetchAndPopulateHoverCard(card) {
            if (!card || card.dataset.detailsLoaded === 'true') return;
            card.dataset.detailsLoaded = 'true';

            const mediaType = (card.dataset.type || '').toLowerCase();
            const itemId = card.dataset.id;
            const hoverDetailsContainer = card.querySelector('.hover-card-details');
            const fallbackTitle = card.querySelector('img')?.alt || 'Preview unavailable';
            if (!hoverDetailsContainer || !mediaType || !itemId) {
                card.dataset.detailsLoaded = '';
                if (hoverDetailsContainer) {
                    renderHoverFallback(hoverDetailsContainer, fallbackTitle);
                }
                return;
            }

            const playerUrl = `${playerBaseUrl}/${mediaType}/${itemId}`;
            const url = `https://api.themoviedb.org/3/${mediaType}/${itemId}?api_key=${apiKey}&append_to_response=content_ratings`;

            try {
                let cachedReference = findCachedItem(mediaType, itemId);
                let data = cachedReference;
                if (!data) {
                    data = await fetchData(url);
                } else {
                    const needsRefresh = !Array.isArray(data.genres) || !data.overview || !data.backdrop_path;
                    if (needsRefresh) {
                        const refreshed = await fetchData(url);
                        if (refreshed) {
                            Object.assign(data, refreshed);
                        }
                    }
                }

                if (!data) {
                    card.dataset.detailsLoaded = '';
                    renderHoverFallback(hoverDetailsContainer, fallbackTitle);
                    return;
                }

                const normalized = normalizeMediaItem({ ...data, media_type: data.media_type || mediaType, id: data.id || itemId });
                if (!normalized) {
                    card.dataset.detailsLoaded = '';
                    renderHoverFallback(hoverDetailsContainer, fallbackTitle);
                    return;
                }

                const cacheKey = `${normalized.media_type}:${normalized.id}`;
                MEDIA_DETAILS_CACHE.set(cacheKey, { ...normalized });
                if (cachedReference) {
                    Object.assign(cachedReference, normalized);
                    data = cachedReference;
                } else {
                    data = normalized;
                }

                const releaseYear = (data.release_date || data.first_air_date || '').substring(0, 4);
                const runtime = data.runtime || (Array.isArray(data.episode_run_time) ? data.episode_run_time[0] : null);
                const formattedRuntime = runtime ? `${Math.floor(runtime / 60)}h ${runtime % 60}m` : '';
                const overviewSource = typeof data.overview === 'string' ? data.overview.trim() : '';
                const overviewText = overviewSource || 'Preview unavailable right now.';
                const overview = overviewText.length > 150 ? `${overviewText.substring(0, 150)}...` : overviewText;

                let rating = 'NR';
                if (data.content_ratings?.results) {
                    const usRating = data.content_ratings.results.find(r => r.iso_3166_1 === 'US');
                    if (usRating?.rating) rating = usRating.rating;
                }

                const genres = Array.isArray(data.genres) ? data.genres : [];
                const genreTags = genres.slice(0, 3).map(g => `<span>${g.name}</span>`).join('');

                const likedList = LIKED_LIST_CACHE || [];
                const isLiked = likedList.some(item => item.id == itemId && (item.media_type || (item.title ? 'movie' : 'tv')) === mediaType);
                const likedClass = isLiked ? 'liked' : '';

                const myList = MY_LIST_CACHE || [];
                const isInMyList = myList.some(item => item.id == itemId && (item.media_type || (item.title ? 'movie' : 'tv')) === mediaType);
                const addedClass = isInMyList ? 'added' : '';
                const addListIcon = isInMyList
                    ? '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"></path></svg>'
                    : '<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"></path></svg>';

                const backdropPath = data.backdrop_path || data.poster_path || '';
                const backdropUrl = backdropPath.startsWith('http') ? backdropPath : (backdropPath ? `${backdropBaseUrl}${backdropPath}` : '');

                hoverDetailsContainer.innerHTML = `
                    <div class="hover-card-media"${backdropUrl ? ` style="background-image: url('${backdropUrl}')"` : ''}></div>
                    <div class="hover-card-body">
                        <div class="hover-action-buttons">
                            <a href="${playerUrl}" class="action-btn play-btn js-play-trigger" title="Play"><svg viewBox="0 0 24 24"><path d="M6 4l15 8-15 8z"></path></svg></a>
                            <button class="action-btn add-list-btn ${addedClass}" title="Add to My List" data-id="${itemId}" data-type="${mediaType}" onclick="addToMyList('${itemId}', '${mediaType}', this)">${addListIcon}</button>
                            <button class="action-btn like-btn ${likedClass}" title="Like" data-id="${itemId}" data-type="${mediaType}" onclick="addToLikedList('${itemId}', '${mediaType}', this)"><svg viewBox="0 0 24 24"><path d="M23,10C23,8.89,22.1,8,21,8H14.68L15.64,3.43C15.66,3.33,15.67,3.22,15.67,3.11C15.67,2.7,15.5,2.32,15.23,2.05L14.17,1L7.59,7.59C7.22,7.95,7,8.45,7,9V19A2,2 0 0,0 9,21H18C18.83,21,19.54,20.5,19.84,19.78L22.86,12.73C22.95,12.5,23,12.26,23,12V10M1,21H5V9H1V21Z"></path></svg></button>
                            <button class="action-btn more-info-btn" title="More Info" data-id="${itemId}" data-type="${mediaType}"><svg viewBox="0 0 24 24"><path d="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z"></path></svg></button>
                        </div>
                        <p class="hover-card-overview">${overview}</p>
                        <div class="hover-card-meta">
                            <span class="meta-rating">${rating}</span>
                            <span class="meta-year">${releaseYear}</span>
                            <span class="meta-runtime">${formattedRuntime}</span>
                        </div>
                        <div class="hover-card-genres">${genreTags}</div>
                    </div>
                `;
                updateAllButtons(normalized.id, normalized.media_type);
            } catch (error) {
                console.error('Failed to populate hover card', error);
                card.dataset.detailsLoaded = '';
                renderHoverFallback(hoverDetailsContainer, fallbackTitle);
            }
        }

        function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
            if (typeof AbortController === 'undefined') {
                return fetch(url, options);
            }
            return new Promise((resolve, reject) => {
                const controller = new AbortController();
                const id = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, timeoutMs);
                fetch(url, { ...options, signal: controller.signal })
                    .then(res => { clearTimeout(id); resolve(res); })
                    .catch(err => { clearTimeout(id); reject(err); });
            });
        }

        async function fetchData(url) {
            try {
                const response = await fetchWithTimeout(url, {}, 8000);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return await response.json();
            } catch (error) {
                console.warn('Fetch failed:', url, error.message);
                return null;
            }
        }

        function populateGrid(gridId, dataList = []) {
            const grid = document.getElementById(gridId);
            if (!grid) return;

            grid.innerHTML = '';
            if (!Array.isArray(dataList) || dataList.length === 0) {
                grid.appendChild(createEmptyStateMessage(gridId));
                return;
            }

            let renderedCount = 0;
            dataList.forEach(item => {
                const card = createPosterCard(item, item.media_type);
                if (card) {
                    grid.appendChild(card);
                    renderedCount += 1;
                }
            });

            if (renderedCount === 0) {
                grid.appendChild(createEmptyStateMessage(gridId));
            }

            observeGridCards(grid);
        }

        function createEmptyStateMessage(gridId) {
            const emptyDiv = document.createElement('div');
            emptyDiv.style.cssText = `
                grid-column: 1 / -1;
                text-align: center;
                padding: 60px 20px;
                color: var(--text-secondary-color);
            `;

            let message = '';
            let actionText = '';

            switch (gridId) {
                case 'my-list-grid':
                    message = 'Your list is empty';
                    actionText = 'Add movies and TV shows to My List while browsing to see them here.';
                    break;
                case 'liked-grid':
                    message = 'You haven\'t liked anything yet';
                    actionText = 'Like movies and TV shows while browsing to see them here.';
                    break;
                case 'trailers-watched-grid':
                    message = 'No trailers watched yet';
                    actionText = 'Watch trailers and browse content to see your history here.';
                    break;
                default:
                    message = 'No content found';
                    actionText = 'Start browsing to discover content.';
            }

            emptyDiv.innerHTML = `
                <div style="margin-bottom: 20px;">
                    <svg viewBox="0 0 24 24" style="width: 64px; height: 64px; fill: var(--text-muted-color);">
                        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
                    </svg>
                </div>
                <h3 style="font-size: 1.5rem; margin: 0 0 15px 0; color: var(--text-color);">${message}</h3>
                <p style="font-size: 1rem; line-height: 1.5; margin: 0; max-width: 400px; margin: 0 auto;">${actionText}</p>
                <div style="margin-top: 25px;">
                    <a href="/browse" style="
                        display: inline-block;
                        background-color: var(--netflix-red);
                        color: white;
                        padding: 12px 24px;
                        text-decoration: none;
                        border-radius: 4px;
                        font-weight: 500;
                        transition: background-color 0.2s ease;
                    " onmouseover="this.style.backgroundColor='#f40612'" onmouseout="this.style.backgroundColor='var(--netflix-red)'">
                        Start Browsing
                    </a>
                </div>
            `;

            return emptyDiv;
        }

        function resolveMediaIdentifiers(item) {
            if (!item) return { id: undefined, mediaType: undefined };
            const id = item.id || item.tmdb_id;
            const inferredType = item.media_type || (item.title ? 'movie' : item.name ? 'tv' : '');
            const mediaType = (inferredType || '').toLowerCase();
            return { id, mediaType };
        }

        // Prefetch hover details when cards enter viewport (like main page feel)
        let hoverObserver;
        function ensureHoverObserver() {
            if (hoverObserver) return hoverObserver;
            if (typeof IntersectionObserver === 'undefined') return null;
            hoverObserver = new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const card = entry.target;
                        if (card && !card.dataset.detailsLoaded) fetchAndPopulateHoverCard(card);
                        hoverObserver.unobserve(card);
                    }
                });
            }, { rootMargin: '200px' });
            return hoverObserver;
        }

        function observeGridCards(grid) {
            const obs = ensureHoverObserver();
            if (!obs) return;
            grid.querySelectorAll('.poster-card').forEach(card => obs.observe(card));
        }

        function normalizeMediaItem(rawItem) {
            if (!rawItem) return null;
            const clone = { ...rawItem };
            const { id, mediaType } = resolveMediaIdentifiers(clone);
            if (!id || !mediaType) return null;
            clone.id = id;
            clone.media_type = mediaType;
            return clone;
        }

        function normalizeCollection(items) {
            if (!Array.isArray(items) || items.length === 0) return [];
            const seenKeys = new Set();
            const normalized = [];
            items.forEach(item => {
                const normalizedItem = normalizeMediaItem(item);
                if (!normalizedItem) return;
                const key = `${normalizedItem.media_type}:${normalizedItem.id}`;
                if (seenKeys.has(key)) return;
                seenKeys.add(key);
                normalized.push(normalizedItem);
            });
            return normalized;
        }

        async function hydrateMediaItem(item) {
            const hydrated = normalizeMediaItem(item);
            if (!hydrated) return null;
            const { id, media_type: mediaType } = hydrated;

            if (!id || !mediaType || hydrated.poster_path) {
                return hydrated;
            }

            const cacheKey = `${mediaType}:${id}`;
            let fresh = MEDIA_DETAILS_CACHE.get(cacheKey);
            if (!fresh) {
                fresh = await fetchData(`https://api.themoviedb.org/3/${mediaType}/${id}?api_key=${apiKey}`);
                if (fresh) {
                    fresh.id = id;
                    fresh.media_type = mediaType;
                    MEDIA_DETAILS_CACHE.set(cacheKey, fresh);
                }
            }

            if (fresh) {
                if (!hydrated.poster_path && fresh.poster_path) hydrated.poster_path = fresh.poster_path;
                if (!hydrated.backdrop_path && fresh.backdrop_path) hydrated.backdrop_path = fresh.backdrop_path;
                if (!hydrated.overview && fresh.overview) hydrated.overview = fresh.overview;
                if (!hydrated.title && fresh.title) hydrated.title = fresh.title;
                if (!hydrated.name && fresh.name) hydrated.name = fresh.name;
            }

            return hydrated;
        }

        async function hydrateItemCollection(items) {
            if (!Array.isArray(items) || items.length === 0) return [];
            const hydrated = await Promise.all(items.map(item => hydrateMediaItem(item)));
            return hydrated.filter(Boolean);
        }

        async function displayMyList() {
            const hydrated = await hydrateItemCollection(MY_LIST_CACHE || []);
            MY_LIST_CACHE = hydrated;
            cacheWrite(CACHE_KEYS.MY_LIST, MY_LIST_CACHE);
            populateGrid('my-list-grid', hydrated);
        }

        async function displayTrailersWatched() {
            const hydrated = await hydrateItemCollection(TRAILERS_WATCHED_CACHE || []);
            TRAILERS_WATCHED_CACHE = hydrated;
            cacheWrite(CACHE_KEYS.TRAILERS, TRAILERS_WATCHED_CACHE);
            populateGrid('trailers-watched-grid', hydrated);
        }

        async function displayLikedList() {
            const hydrated = await hydrateItemCollection(LIKED_LIST_CACHE || []);
            LIKED_LIST_CACHE = hydrated;
            cacheWrite(CACHE_KEYS.LIKES, LIKED_LIST_CACHE);
            populateGrid('liked-grid', hydrated);
        }

        async function addTrailerToWatched(itemId, mediaType) {
            const url = `https://api.themoviedb.org/3/${mediaType}/${itemId}?api_key=${apiKey}`;
            const itemData = await fetchData(url);
            if (itemData) {
                const normalizedItem = normalizeMediaItem({ ...itemData, media_type: mediaType });
                if (!normalizedItem) return;
                const trailersWatched = TRAILERS_WATCHED_CACHE || [];
                const exists = trailersWatched.some(item => item.id == normalizedItem.id && item.media_type === normalizedItem.media_type);
                if (!exists) {
                    try { await apiSend('/api/me/trailers', 'POST', { tmdb_id: normalizedItem.id, media_type: normalizedItem.media_type, data: normalizedItem }); } catch(e) { /* ignore */ }
                    TRAILERS_WATCHED_CACHE = [normalizedItem, ...trailersWatched];
                    await displayTrailersWatched();
                }
            }
        }

        async function addToMyList(itemId, mediaType, buttonElement) {
            const url = `https://api.themoviedb.org/3/${mediaType}/${itemId}?api_key=${apiKey}`;
            const rawData = await fetchData(url);
            if (!rawData) {
                showToast('Error adding to My List');
                return;
            }
            const normalizedItem = normalizeMediaItem({ ...rawData, media_type: mediaType });
            if (!normalizedItem) {
                showToast('Error adding to My List');
                return;
            }
            const displayTitle = rawData.title || rawData.name;
            let myList = MY_LIST_CACHE || [];
            const existsIndex = myList.findIndex(item => item.id == normalizedItem.id && item.media_type === normalizedItem.media_type);

            if (existsIndex > -1) {
                try { await apiSend('/api/me/my-list', 'DELETE', { tmdb_id: normalizedItem.id, media_type: normalizedItem.media_type }); } catch(e) { /* ignore */ }
                myList.splice(existsIndex, 1);
                MY_LIST_CACHE = myList;
                showToast(`Removed "${displayTitle}" from My List`);
            } else {
                try { await apiSend('/api/me/my-list', 'POST', { tmdb_id: normalizedItem.id, media_type: normalizedItem.media_type, data: normalizedItem }); } catch(e) { /* ignore */ }
                myList.unshift(normalizedItem);
                MY_LIST_CACHE = myList;
                showToast(`Added "${displayTitle}" to My List`);
            }
            await displayMyList();
            updateAllButtons(normalizedItem.id, normalizedItem.media_type);
        }

        async function addToLikedList(itemId, mediaType, buttonElement) {
            const url = `https://api.themoviedb.org/3/${mediaType}/${itemId}?api_key=${apiKey}`;
            const rawData = await fetchData(url);
            if (!rawData) {
                showToast('Error updating Liked List');
                return;
            }
            const normalizedItem = normalizeMediaItem({ ...rawData, media_type: mediaType });
            if (!normalizedItem) {
                showToast('Error updating Liked List');
                return;
            }
            const displayTitle = rawData.title || rawData.name;
            let likedList = LIKED_LIST_CACHE || [];
            const existsIndex = likedList.findIndex(item => item.id == normalizedItem.id && item.media_type === normalizedItem.media_type);

            if (existsIndex > -1) {
                try { await apiSend('/api/me/likes', 'DELETE', { tmdb_id: normalizedItem.id, media_type: normalizedItem.media_type }); } catch(e) { /* ignore */ }
                likedList.splice(existsIndex, 1);
                LIKED_LIST_CACHE = likedList;
                showToast(`Removed "${displayTitle}" from Liked List`);
            } else {
                try { await apiSend('/api/me/likes', 'POST', { tmdb_id: normalizedItem.id, media_type: normalizedItem.media_type, data: normalizedItem }); } catch(e) { /* ignore */ }
                likedList.unshift(normalizedItem);
                LIKED_LIST_CACHE = likedList;
                showToast(`Added "${displayTitle}" to Liked List`);
            }
            await displayLikedList();
            updateAllButtons(normalizedItem.id, normalizedItem.media_type);
        }

        // Use global openPlayerModal from script.js if available; wrap with a robust fallback
        (function ensureOpenPlayerModalWrapper() {
            const baseOpen = typeof window.openPlayerModal === 'function' ? window.openPlayerModal : null;
            window.openPlayerModal = function(url, mediaType, itemId) {
                try { if (baseOpen) baseOpen(url, mediaType, itemId); } catch (_) { /* ignore base errors */ }

                const playerModal = document.getElementById('player-modal');
                const playerContainer = document.getElementById('player-container');
                if (!playerModal || !playerContainer) return;

                // If the modal isn't visible yet, or iframe not mounted, force-show with a safe fallback
                const hasIframe = !!playerContainer.querySelector('iframe');
                if (!hasIframe) {
                    playerContainer.innerHTML = '';
                    const loader = document.createElement('div');
                    loader.className = 'loader';
                    loader.style.position = 'absolute';
                    loader.style.left = '50%';
                    loader.style.top = '50%';
                    loader.style.transform = 'translate(-50%, -50%)';
                    playerContainer.appendChild(loader);

                    const iframe = document.createElement('iframe');
                    iframe.src = url;
                    iframe.allow = 'autoplay; fullscreen';
                    iframe.allowFullscreen = true;
                    iframe.onload = () => { loader.remove(); };
                    iframe.onerror = () => {
                        loader.remove();
                        const fallback = document.createElement('div');
                        fallback.style.color = '#fff';
                        fallback.style.textAlign = 'center';
                        fallback.style.paddingTop = '20vh';
                        fallback.innerHTML = `Player failed to load. <a style="color:#fff;text-decoration:underline" href="${url}" target="_blank">Open in new tab</a>`;
                        playerContainer.appendChild(fallback);
                    };
                    playerContainer.appendChild(iframe);

                    // Add Next Episode handling when using fallback (mirror main page)
                    window.addEventListener('message', async (event) => {
                        const ifr = playerContainer.querySelector('iframe');
                        if (!ifr || event.source !== ifr.contentWindow) return;
                        if (event.data && event.data.type === 'episodeEnded' && mediaType === 'tv' && itemId) {
                            const nextEpisodeButton = document.createElement('button');
                            nextEpisodeButton.id = 'next-episode-btn';
                            nextEpisodeButton.textContent = 'Next Episode';
                            nextEpisodeButton.onclick = async () => {
                                try {
                                    const parts = (url || '').split('/');
                                    const currentSeason = parts.length > 4 ? parts[4] : '1';
                                    const currentEpisode = parts.length > 5 ? parts[5] : '1';
                                    const nextEpisodeNumber = parseInt(currentEpisode, 10) + 1;
                                    const seasonsUrl = `https://api.themoviedb.org/3/tv/${itemId}?api_key=${apiKey}`;
                                    const seasonsData = await fetchData(seasonsUrl);
                                    const currentSeasonData = seasonsData?.seasons?.find(s => String(s.season_number) === String(currentSeason));
                                    if (currentSeasonData && nextEpisodeNumber <= currentSeasonData.episode_count) {
                                        const nextEpisodeUrl = `${playerBaseUrl}/tv/${itemId}/${currentSeason}/${nextEpisodeNumber}`;
                                        openPlayerModal(nextEpisodeUrl, mediaType, itemId);
                                    } else {
                                        closePlayerModal();
                                    }
                                } catch (_) {
                                    closePlayerModal();
                                }
                            };
                            if (!playerContainer.querySelector('#next-episode-btn')) {
                                playerContainer.appendChild(nextEpisodeButton);
                            }
                        }
                    });
                }

                playerModal.classList.add('active');
                document.body.classList.add('modal-open');
            };
        })();

        window.closePlayerModal = window.closePlayerModal || function() {
            const playerModal = document.getElementById('player-modal');
            const playerContainer = document.getElementById('player-container');
            if (playerContainer && playerModal) {
                playerModal.classList.remove('active');
                playerContainer.innerHTML = '';
                document.body.classList.remove('modal-open');
            }
        };

        // --- INFO MODAL LOGIC ---
        async function openInfoModal(mediaType, itemId) {
            addTrailerToWatched(itemId, mediaType);
            document.body.classList.add('modal-open');
            const infoModal = document.getElementById('info-modal');
            infoModal.classList.add('active');
            // Quick skeleton with Play button
            const playerUrl = `${playerBaseUrl}/${mediaType}/${itemId}`;
            infoModal.innerHTML = `
                <div class="modal-backdrop"></div>
                <div class="modal-content-wrapper">
                    <button class="modal-close-btn">&times;</button>
                    <div class="modal-media-container">
                        <div class="loader" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)"></div>
                        <div class="modal-content-overlay">
                            <h2 class="modal-title">Loading...</h2>
                            <div class="modal-action-buttons">
                                <a href="${playerUrl}" class="modal-play-btn js-play-trigger"><svg viewBox="0 0 24 24"><path d="M6 4l15 8-15 8z" fill="currentColor"></path></svg>Play</a>
                            </div>
                        </div>
                    </div>
                    <div class="modal-body">
                        <div class="modal-metadata-row"></div>
                        <div class="modal-main-content-grid">
                            <div class="modal-description"><p></p></div>
                            <aside class="modal-meta-data"></aside>
                        </div>
                    </div>
                </div>`;

            const url = `https://api.themoviedb.org/3/${mediaType}/${itemId}?api_key=${apiKey}&append_to_response=videos,content_ratings,credits`;
            const data = await fetchData(url);

            if (!data) {
                const mediaContainer = infoModal.querySelector('.modal-media-container');
                mediaContainer.style.background = '#000';
                const titleEl = infoModal.querySelector('.modal-title');
                if (titleEl) titleEl.textContent = 'Details unavailable';
                return;
            }

            const title = data.name || data.title;
            const releaseYear = (data.first_air_date || data.release_date || '').substring(0, 4);
            const seasons = data.number_of_seasons ? `${data.number_of_seasons} Seasons` : '';
            const overview = data.overview;
            const cast = data.credits?.cast.slice(0, 3).map(c => c.name).join(', ') + ', more';
            const genres = data.genres.map(g => g.name).join(', ');

            let rating = '';
            if (data.content_ratings?.results) {
                const usRating = data.content_ratings.results.find(r => r.iso_3166_1 === 'US');
                if (usRating?.rating) rating = `<span class="metadata-badge">${usRating.rating}</span>`;
            }

            const officialTrailer = data.videos?.results.find(v => v.site === 'YouTube' && v.type === 'Trailer');
            const mediaContent = officialTrailer
                ? `<iframe id="modal-trailer-video" src="https://www.youtube.com/embed/${officialTrailer.key}?autoplay=1&mute=1&controls=0&loop=1&playlist=${officialTrailer.key}&enablejsapi=1" allow="autoplay; encrypted-media" allowfullscreen></iframe>`
                : '';

            const backgroundStyle = !officialTrailer ? `style="background-image: url('${backdropBaseUrl}${data.backdrop_path}')"` : '';

            const playIcon = `<svg viewBox="0 0 24 24"><path d="M6 4l15 8-15 8z" fill="currentColor"></path></svg>`;
            const addIcon = `<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"></path></svg>`;
            const likeIcon = `<svg viewBox="0 0 24 24"><path d="M23,10C23,8.89,22.1,8,21,8H14.68L15.64,3.43C15.66,3.33,15.67,3.22,15.67,3.11C15.67,2.7,15.5,2.32,15.23,2.05L14.17,1L7.59,7.59C7.22,7.95,7,8.45,7,9V19A2,2 0 0,0 9,21H18C18.83,21,19.54,20.5,19.84,19.78L22.86,12.73C22.95,12.5,23,12.26,23,12V10M1,21H5V9H1V21Z"></path></svg>`;
            const muteIcon = `<svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"></path></svg>`;
            const unmuteIcon = `<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"></path></svg>`;

            const likedList = LIKED_LIST_CACHE || [];
            const isLiked = likedList.some(item => item.id == itemId && (item.media_type || (item.title ? 'movie' : 'tv')) === mediaType);
            const likedClass = isLiked ? 'liked' : '';

            const myList = MY_LIST_CACHE || [];
            const isInMyList = myList.some(item => item.id == itemId && (item.media_type || (item.title ? 'movie' : 'tv')) === mediaType);
            const addedClass = isInMyList ? 'added' : '';
            const addListIcon = isInMyList ? '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"></path></svg>' : '<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"></path></svg>';

            const wrapper = infoModal.querySelector('.modal-content-wrapper');
            if (wrapper) {
                wrapper.innerHTML = `
                    <button class="modal-close-btn">&times;</button>
                    <div class="modal-media-container" ${backgroundStyle}>
                        ${mediaContent}
                        <div class="modal-content-overlay">
                            <h2 class="modal-title">${title}</h2>
                            <div class="modal-action-buttons">
                                <a href="${playerUrl}" class="modal-play-btn js-play-trigger" data-id="${itemId}" data-type="${mediaType}">${playIcon} Play</a>
                                <button class="modal-icon-btn add-list-btn ${addedClass}" title="Add to My List" onclick="addToMyList('${itemId}', '${mediaType}', this)">${addListIcon}</button>
                                <button class="modal-icon-btn like-btn ${likedClass}" title="Like" onclick="addToLikedList('${itemId}', '${mediaType}', this)">${likeIcon}</button>
                            </div>
                        </div>
                        ${officialTrailer ? `
                        <button class="modal-icon-btn mute-toggle-btn" id="mute-toggle-btn" data-muted="true" title="Unmute">
                            ${muteIcon}
                        </button>` : ''}
                    </div>
                    <div class="modal-body">
                        <div class="modal-metadata-row">
                            ${releaseYear ? `<span>${releaseYear}</span>` : ''}
                            ${seasons ? `<span>${seasons}</span>` : ''}
                            ${rating}
                            <span class="metadata-badge">HD</span>
                        </div>
                        <div class="modal-main-content-grid">
                            <div class="modal-description"><p>${overview}</p></div>
                            <aside class="modal-meta-data">
                                <p><span class="label">Cast:</span> <span class="value">${cast}</span></p>
                                <p><span class="label">Genres:</span> <span class="value">${genres}</span></p>
                            </aside>
                        </div>
                    </div>`;
            }

            // Setup mute/unmute toggle
            const muteToggleButton = infoModal.querySelector('#mute-toggle-btn');
            if (muteToggleButton) {
                const trailerIframe = infoModal.querySelector('iframe');
                muteToggleButton.addEventListener('click', () => {
                    const isMuted = muteToggleButton.dataset.muted === 'true';
                    const action = isMuted ? 'unMute' : 'mute';
                    const newMutedState = !isMuted;

                    if (trailerIframe && trailerIframe.contentWindow) {
                        trailerIframe.contentWindow.postMessage(JSON.stringify({
                            event: 'command',
                            func: action,
                            args: []
                        }), '*');
                    }

                    muteToggleButton.dataset.muted = newMutedState;
                    muteToggleButton.title = newMutedState ? 'Unmute' : 'Mute';
                    muteToggleButton.innerHTML = newMutedState ? muteIcon : unmuteIcon;
                });
            }
        }

        function closeInfoModal() {
            document.body.classList.remove('modal-open');
            const infoModal = document.getElementById('info-modal');
            infoModal.classList.remove('active');
            infoModal.innerHTML = '';
        }

        // --- MOBILE MENU FUNCTIONS ---
        window.toggleMobileMenu = function() {
            const popup = document.getElementById('mobile-menu-popup');
            if (popup) {
                popup.classList.toggle('active');
                document.body.classList.toggle('modal-open');
            }
        }

        window.closeMobileMenu = function() {
            const popup = document.getElementById('mobile-menu-popup');
            if (popup) {
                popup.classList.remove('active');
                document.body.classList.remove('modal-open');
            }
        }

        window.manageProfiles = function() {
            closeMobileMenu();
            showToast('Manage Profiles - Coming Soon');
        }

        window.appSettings = function() {
            closeMobileMenu();
            showToast('App Settings - Coming Soon');
        }

        window.accountSettings = function() {
            closeMobileMenu();
            showToast('Account Settings - Coming Soon');
        }

        window.helpCenter = function() {
            closeMobileMenu();
            showToast('Help Center - Coming Soon');
        }

        window.signOut = function() {
            closeMobileMenu();
            logout();
        }
        async function logout() {
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

        // --- EVENT LISTENERS ---
        document.addEventListener('DOMContentLoaded', async function () {
            // Load from server only, no local cache seeding for user lists
            try {
                const responses = await Promise.allSettled([
                    apiGet('/api/me/my-list'),
                    apiGet('/api/me/likes'),
                    apiGet('/api/me/trailers')
                ]);

                if (responses[0].status === 'fulfilled') {
                    MY_LIST_CACHE = normalizeCollection(responses[0].value || []);
                } else if (responses[0].status === 'rejected') {
                    console.warn('Failed to refresh My List from server', responses[0].reason);
                }

                if (responses[1].status === 'fulfilled') {
                    LIKED_LIST_CACHE = normalizeCollection(responses[1].value || []);
                } else if (responses[1].status === 'rejected') {
                    console.warn('Failed to refresh Likes from server', responses[1].reason);
                }

                if (responses[2].status === 'fulfilled') {
                    TRAILERS_WATCHED_CACHE = normalizeCollection(responses[2].value || []);
                } else if (responses[2].status === 'rejected') {
                    console.warn('Failed to refresh Trailers from server', responses[2].reason);
                }

                await Promise.all([
                    displayMyList(),
                    displayTrailersWatched(),
                    displayLikedList()
                ]);
            } catch (e) {
                console.warn('Failed to refresh user data from server', e);
            }

            setupNavFiltering();
            setupSearch();

            // Setup logout button
            const logoutBtn = document.getElementById('logout-btn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', logout);
            }
        });

        document.addEventListener('mouseenter', (event) => {
            const card = event.target.closest('.poster-card');
            if (card) fetchAndPopulateHoverCard(card);
        }, true);

        // Ensure hover population fires across browsers
        document.addEventListener('mouseover', (event) => {
            const card = event.target.closest('.poster-card');
            if (card) fetchAndPopulateHoverCard(card);
        }, true);

        document.addEventListener('click', function (event) {
            const moreInfoButton = event.target.closest('.more-info-btn');
            const playButton = event.target.closest('.js-play-trigger');
            const posterCard = event.target.closest('.poster-card');

            if (playButton) {
                event.preventDefault();

                // If info modal trailer is playing, pause it first (parity with main page)
                const infoModal = document.getElementById('info-modal');
                if (infoModal && infoModal.classList.contains('active')) {
                    const trailerIframe = infoModal.querySelector('#modal-trailer-video');
                    if (trailerIframe && trailerIframe.contentWindow) {
                        trailerIframe.contentWindow.postMessage(JSON.stringify({
                            event: 'command',
                            func: 'pauseVideo',
                            args: []
                        }), '*');
                    }
                }

                const playerUrl = playButton.getAttribute('href') || playButton.dataset.url;
                // Find nearest element that carries the media identifiers (works for both cards and modal button)
                const mediaContainer = playButton.closest('[data-id][data-type]');

                if (playerUrl && mediaContainer) {
                    const { id, type } = mediaContainer.dataset;
                    closeInfoModal();
                    openPlayerModal(playerUrl, type, id);
                } else if (playerUrl) {
                    // Fallback: just open by URL
                    closeInfoModal();
                    openPlayerModal(playerUrl);
                }
            }

            if (moreInfoButton) {
                event.preventDefault();
                const { id, type } = moreInfoButton.dataset;
                if (id && type) openInfoModal(type, id);
            }

            // Mobile: Click on poster card opens modal
            if (posterCard && window.innerWidth <= 480) {
                const { id, type } = posterCard.dataset;
                if (id && type) {
                    event.preventDefault();
                    openInfoModal(type, id);
                }
            }

            if (event.target.closest('.modal-close-btn') || event.target.matches('.modal-backdrop')) {
                closeInfoModal();
            }

            if (event.target.closest('#close-player-btn')) {
                closePlayerModal();
            }
        });

        // --- NAVIGATION FILTERING LOGIC ---
        function setupNavFiltering() {
            const navLinks = document.querySelectorAll('.main-nav li[id]');
            navLinks.forEach(link => {
                link.addEventListener('click', function (e) {
                    e.preventDefault();
                    
                    const filter = this.id.replace('nav-', '');
                    if (filter === 'shows') {
                        localStorage.setItem('netflix_nav_filter', 'tv');
                    } else if (filter === 'movies') {
                        localStorage.setItem('netflix_nav_filter', 'movie');
                    }
                    
                    // Navigate to browse page
                    window.location.href = '/browse';
                });
            });
        }

        // --- SEARCH LOGIC ---
        const searchIconTrigger = document.getElementById('search-icon-trigger');
        const headerSearchInput = document.getElementById('header-search-input');
        const closeSearchIcon = document.getElementById('close-search-icon');
        const searchResultsSection = document.getElementById('search-results-section');
        const searchResultsGrid = document.getElementById('search-results');
        const searchFeedback = document.getElementById('search-feedback');
        const mainContent = document.querySelector('main');
        let searchTimeout;

        function setupSearch() {
            // Only enable desktop inline search on screens wider than 480px
            if (window.innerWidth <= 480) return;
            searchIconTrigger.addEventListener('click', toggleSearch);
            closeSearchIcon.addEventListener('click', toggleSearch);

            headerSearchInput.addEventListener('input', () => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    const query = headerSearchInput.value.trim();
                    if (query) {
                        searchResultsSection.style.display = 'block';
                        mainContent.style.display = 'none';
                        searchResultsGrid.innerHTML = '<div class="loader"></div>';
                        performSearch(query);
                    } else {
                        searchResultsGrid.innerHTML = '';
                        searchFeedback.innerHTML = '';
                        searchResultsSection.style.display = 'none';
                        mainContent.style.display = 'block';
                    }
                }, 500);
            });
        }

        function toggleSearch() {
            document.body.classList.toggle('search-active');
            if (document.body.classList.contains('search-active')) {
                setTimeout(() => {
                    headerSearchInput.focus();
                }, 100);
            } else {
                headerSearchInput.value = '';
                searchResultsSection.style.display = 'none';
                searchResultsGrid.innerHTML = '';
                if (searchFeedback) searchFeedback.innerHTML = '';
                mainContent.style.display = 'block';
            }
        }

        async function performSearch(query) {
            const url = `https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&query=${encodeURIComponent(query)}`;
            const data = await fetchData(url);
            if (data) displaySearchResults(data.results, query);
        }

        function displaySearchResults(results, query) {
            searchResultsGrid.innerHTML = '';
            searchFeedback.innerHTML = '';

            const validResults = results.filter(item => (item.media_type === 'movie' || item.media_type === 'tv') && item.poster_path);

            if (validResults.length === 0) {
                searchFeedback.textContent = `Your search for "${query}" did not have any matches.`;
                searchResultsSection.style.display = 'block';
                mainContent.style.display = 'none';
                return;
            }

            mainContent.style.display = 'none';
            searchResultsSection.style.display = 'block';

            validResults.forEach(item => {
                const card = createPosterCard(item, item.media_type);
                if (card) searchResultsGrid.appendChild(card);
            });
        }

        // --- NOTIFICATION FUNCTIONS ---

        async function fetchNotifications() {
            try {
                // 1) Try to show cached notifications immediately for fast UI
                const cached = cacheRead(CACHE_KEYS.NOTIFICATIONS);
                if (Array.isArray(cached) && cached.length) {
                    notificationsCache = cached;
                    updateNotificationBadge();
                    renderNotifications();
                }

                // 2) Fetch fresh notifications in background with cache busting
                const allResponse = await fetch(`/api/notifications?limit=50&_t=${Date.now()}`);
                if (allResponse.ok) {
                    const allNotifications = await allResponse.json();
                    notificationsCache = allNotifications;
                    cacheWrite(CACHE_KEYS.NOTIFICATIONS, notificationsCache);
                    updateNotificationBadge();
                    renderNotifications();
                }
            } catch (error) {
                console.error('Error fetching notifications:', error);
                // If network fails and we have cache, keep cached UI
                if (Array.isArray(notificationsCache) && notificationsCache.length) return;
                const cached = cacheRead(CACHE_KEYS.NOTIFICATIONS);
                if (Array.isArray(cached) && cached.length) {
                    notificationsCache = cached;
                    updateNotificationBadge();
                    renderNotifications();
                }
            }
        }

        async function fetchAllNotifications() {
            try {
                const response = await fetch('/api/notifications?limit=50');
                if (response.ok) {
                    const notifications = await response.json();
                    notificationsCache = notifications;
                    updateNotificationBadge();
                    renderNotifications();
                }
            } catch (error) {
                console.error('Error fetching all notifications:', error);
            }
        }

        function updateNotificationBadge() {
            const badge = document.getElementById('notification-badge');
            const unreadCount = notificationsCache.filter(n => !n.is_read).length;
            if (unreadCount > 0) {
                badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }

        function renderNotifications() {
            const list = document.getElementById('notification-list');
            if (!list) return;
            list.classList.add('feed-list');

            // Only show unread notifications on My Netflix page
            const unreadNotifications = notificationsCache.filter(n => !n.is_read);

            if (unreadNotifications.length === 0) {
                list.innerHTML = '';
                return;
            }

            const recentNotifications = unreadNotifications.slice(0, 2);
            list.innerHTML = recentNotifications.map(n => {
                const dateStr = new Date(n.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                const posterUrl = n.poster_path ? `${posterBaseUrl}${n.poster_path}` : '';
                return `
                <div class="feed-item unread" data-id="${n.id}">
                    ${posterUrl ? `<img class=\"feed-thumb\" src=\"${posterUrl}\" alt=\"${n.title}\">` : `<div class=\"feed-thumb placeholder\"></div>`}
                    <div class="feed-body">
                        <div class="feed-title">${n.title}</div>
                        <div class="feed-subtitle">${n.message}</div>
                        <div class="feed-date">${dateStr}</div>
                    </div>
                    <div class="feed-actions-inline"></div>
                </div>`;
            }).join('');
        }

        async function markNotificationAsRead(notificationId) {
            try {
                const response = await fetch(`/api/notifications/${notificationId}/mark-read`, {
                    method: 'POST'
                });
                
                if (response.ok) {
                    const notification = notificationsCache.find(n => n.id === notificationId);
                    if (notification) {
                        notification.is_read = true;
                        updateNotificationBadge();
                        renderNotifications();
                    }
                }
            } catch (error) {
                console.error('Error marking notification as read:', error);
            }
        }

        async function deleteNotification(notificationId) {
            try {
                const response = await fetch(`/api/notifications/${notificationId}`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    notificationsCache = notificationsCache.filter(n => n.id !== notificationId);
                    updateNotificationBadge();
                    renderNotifications();
                }
            } catch (error) {
                console.error('Error deleting notification:', error);
            }
        }

        async function markAllNotificationsAsRead() {
            try {
                const response = await fetch('/api/notifications/mark-all-read', {
                    method: 'POST'
                });
                
                if (response.ok) {
                    notificationsCache.forEach(n => n.is_read = true);
                    updateNotificationBadge();
                    renderNotifications();
                }
            } catch (error) {
                console.error('Error marking all notifications as read:', error);
            }
        }

        async function refreshNotifications() {
            await fetchAllNotifications();
        }

        async function fetchNewNotificationsFromTMDB() {
            try {
                const response = await fetch('/api/admin/fetch-tmdb-notifications', {
                    method: 'POST'
                });
                
                if (response.ok) {
                    const result = await response.json();
                    if (result.success) {
                        showToast(`Added ${result.notifications_added} new notifications!`);
                        await fetchAllNotifications();
                    }
                }
            } catch (error) {
                console.error('Error fetching new notifications from TMDB:', error);
                showToast('Failed to fetch new notifications');
            }
        }

        // Add CSS animation for spinning refresh icon
        const style = document.createElement('style');
        style.textContent = `
            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);

        // Initialize notifications when page loads
        document.addEventListener('DOMContentLoaded', function() {
            // Load notifications
            fetchNotifications();
            // Process due reminders and refresh
            (async () => {
                try {
                    await fetch('/api/me/reminders/process', { method: 'POST' });
                    await fetchNotifications();
                } catch (e) { /* ignore */ }
            })();

            // Auto-refresh every 60s
            setInterval(() => { fetchNotifications(); }, 60000);

            // Setup mobile menu button
            const mobileMenuBtn = document.getElementById('mobile-menu-btn');
            if (mobileMenuBtn) {
                mobileMenuBtn.addEventListener('click', window.toggleMobileMenu);
            }

            // Close menu when clicking outside
            const mobileMenuPopup = document.getElementById('mobile-menu-popup');
            if (mobileMenuPopup) {
                mobileMenuPopup.addEventListener('click', function(e) {
                    if (e.target === mobileMenuPopup) {
                        window.closeMobileMenu();
                    }
                });
            }

            // Ensure mobile search modal wiring runs even if script.js loaded after DOMContentLoaded
            if (typeof window.setupMobileSearch === 'function') {
                try { window.setupMobileSearch(); } catch (_) {}
            }

            // Mark all current notifications as read when user clicks See All
            const seeAllLink = document.querySelector('.notifications-section .see-all-btn');
            if (seeAllLink) {
                seeAllLink.addEventListener('click', async (e) => {
                    // Mark all as read on the server
                    try {
                        await fetch('/api/notifications/mark-all-read', {
                            method: 'POST'
                        });
                        // Update local cache
                        notificationsCache.forEach(n => n.is_read = true);
                        cacheWrite(CACHE_KEYS.NOTIFICATIONS, notificationsCache);
                        updateNotificationBadge();
                        renderNotifications();
                    } catch (error) {
                        console.error('Error marking notifications as read:', error);
                    }
                });
            }
        });