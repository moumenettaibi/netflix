        const apiKey = 'f2d7ae9dee829174c475e32fe8f993dc';
        const posterBaseUrl = 'https://image.tmdb.org/t/p/w500';
        const backdropBaseUrl = 'https://image.tmdb.org/t/p/original';
        const playerBaseUrl = 'https://player.videasy.net';

        const STORAGE_KEYS = {
            MY_LIST: 'netflix_my_list',
            CONTINUE_WATCHING: 'netflix_continue_watching',
            WATCH_HISTORY: 'netflix_watch_history',
            REMINDERS: 'netflix_reminders',
            TRAILERS_WATCHED: 'netflix_trailers_watched',
            LIKED_LIST: 'netflix_liked_list'
        };

        function getStorageData(key) {
            try {
                const data = localStorage.getItem(key);
                return data ? JSON.parse(data) : [];
            } catch (error) {
                console.error('Error reading from localStorage:', error);
                return [];
            }
        }

        function setStorageData(key, data) {
            try {
                localStorage.setItem(key, JSON.stringify(data));
            } catch (error) {
                console.error('Error writing to localStorage:', error);
            }
        }

        function showToast(message) {
            const toast = document.getElementById('toast');
            toast.textContent = message;
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
            }, 3000);
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

        async function fetchAndPopulateHoverCard(card) {
            if (card.dataset.detailsLoaded === 'true') return;
            card.dataset.detailsLoaded = 'true';

            const mediaType = card.dataset.type;
            const itemId = card.dataset.id;
            const playerUrl = `${playerBaseUrl}/${mediaType}/${itemId}`;
            const url = `https://api.themoviedb.org/3/${mediaType}/${itemId}?api_key=${apiKey}&append_to_response=content_ratings`;

            const data = await fetchData(url);
            if (!data) return;

            const hoverDetailsContainer = card.querySelector('.hover-card-details');

            const releaseYear = (data.release_date || data.first_air_date || '').substring(0, 4);
            const runtime = data.runtime || (data.episode_run_time ? data.episode_run_time[0] : null);
            const formattedRuntime = runtime ? `${Math.floor(runtime / 60)}h ${runtime % 60}m` : '';
            const overview = data.overview.length > 150 ? data.overview.substring(0, 150) + '...' : data.overview;

            let rating = 'NR';
            if (data.content_ratings?.results) {
                const usRating = data.content_ratings.results.find(r => r.iso_3166_1 === 'US');
                if (usRating) rating = usRating.rating;
            }

            const genreTags = data.genres.slice(0, 3).map(g => `<span>${g.name}</span>`).join('');

            const likedList = getStorageData(STORAGE_KEYS.LIKED_LIST);
            const isLiked = likedList.some(item => item.id == itemId && (item.media_type || (item.title ? 'movie' : 'tv')) === mediaType);
            const likedClass = isLiked ? 'liked' : '';

            const myList = getStorageData(STORAGE_KEYS.MY_LIST);
            const isInMyList = myList.some(item => item.id == itemId && (item.media_type || (item.title ? 'movie' : 'tv')) === mediaType);
            const addedClass = isInMyList ? 'added' : '';
            const addListIcon = isInMyList ? '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"></path></svg>' : '<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"></path></svg>';

            hoverDetailsContainer.innerHTML = `
                <div class="hover-card-media" style="background-image: url('${backdropBaseUrl}${data.backdrop_path}')"></div>
                <div class="hover-card-body">
                    <div class="hover-action-buttons">
                        <a href="${playerUrl}" class="action-btn play-btn js-play-trigger" title="Play"><svg viewBox="0 0 24 24"><path d="M6 4l15 8-15 8z"></path></svg></a>
                        <button class="action-btn add-list-btn ${addedClass}" title="Add to My List" onclick="addToMyList('${itemId}', '${mediaType}', this)">${addListIcon}</button>
                        <button class="action-btn like-btn ${likedClass}" title="Like" onclick="addToLikedList('${itemId}', '${mediaType}', this)"><svg viewBox="0 0 24 24"><path d="M23,10C23,8.89,22.1,8,21,8H14.68L15.64,3.43C15.66,3.33,15.67,3.22,15.67,3.11C15.67,2.7,15.5,2.32,15.23,2.05L14.17,1L7.59,7.59C7.22,7.95,7,8.45,7,9V19A2,2 0 0,0 9,21H18C18.83,21,19.54,20.5,19.84,19.78L22.86,12.73C22.95,12.5,23,12.26,23,12V10M1,21H5V9H1V21Z"></path></svg></button>
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
        }

        async function fetchData(url) {
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return await response.json();
            } catch (error) {
                console.error('Error fetching data:', error);
                return null;
            }
        }

        function populateGrid(gridId, dataList) {
            const grid = document.getElementById(gridId);
            grid.innerHTML = '';
            if (dataList.length > 0) {
                dataList.forEach(item => {
                    const card = createPosterCard(item, item.media_type);
                    if (card) grid.appendChild(card);
                });
            } else {
                // Show empty state message
                const emptyMessage = createEmptyStateMessage(gridId);
                grid.appendChild(emptyMessage);
            }
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

        function displayMyList() {
            const myList = getStorageData(STORAGE_KEYS.MY_LIST);
            populateGrid('my-list-grid', myList);
        }

        function displayTrailersWatched() {
            const trailersWatched = getStorageData(STORAGE_KEYS.TRAILERS_WATCHED);
            populateGrid('trailers-watched-grid', trailersWatched);
        }

        function displayLikedList() {
            const likedList = getStorageData(STORAGE_KEYS.LIKED_LIST);
            populateGrid('liked-grid', likedList);
        }

        async function addTrailerToWatched(itemId, mediaType) {
            const url = `https://api.themoviedb.org/3/${mediaType}/${itemId}?api_key=${apiKey}`;
            const itemData = await fetchData(url);
            if (itemData) {
                let trailersWatched = getStorageData(STORAGE_KEYS.TRAILERS_WATCHED);
                const exists = trailersWatched.some(item => item.id == itemId && (item.media_type || (item.title ? 'movie' : 'tv')) === mediaType);
                if (!exists) {
                    itemData.media_type = mediaType;
                    trailersWatched.unshift(itemData);
                    setStorageData(STORAGE_KEYS.TRAILERS_WATCHED, trailersWatched);
                    displayTrailersWatched();
                }
            }
        }

        async function addToMyList(itemId, mediaType, buttonElement) {
            const url = `https://api.themoviedb.org/3/${mediaType}/${itemId}?api_key=${apiKey}`;
            const data = await fetchData(url);
            if (!data) {
                showToast('Error adding to My List');
                return;
            }
            let myList = getStorageData(STORAGE_KEYS.MY_LIST);
            const existsIndex = myList.findIndex(item => item.id == itemId && (item.media_type || (item.title ? 'movie' : 'tv')) === mediaType);

            if (existsIndex > -1) {
                myList.splice(existsIndex, 1);
                setStorageData(STORAGE_KEYS.MY_LIST, myList);
                buttonElement.classList.remove('added');
                buttonElement.innerHTML = '<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"></path></svg>';
                showToast(`Removed "${data.title || data.name}" from My List`);
            } else {
                data.media_type = mediaType;
                myList.unshift(data);
                setStorageData(STORAGE_KEYS.MY_LIST, myList);
                buttonElement.classList.add('added');
                buttonElement.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"></path></svg>';
                showToast(`Added "${data.title || data.name}" to My List`);
            }
            displayMyList();
        }

        async function addToLikedList(itemId, mediaType, buttonElement) {
            const url = `https://api.themoviedb.org/3/${mediaType}/${itemId}?api_key=${apiKey}`;
            const data = await fetchData(url);
            if (!data) {
                showToast('Error updating Liked List');
                return;
            }
            let likedList = getStorageData(STORAGE_KEYS.LIKED_LIST);
            const existsIndex = likedList.findIndex(item => item.id == itemId && (item.media_type || (item.title ? 'movie' : 'tv')) === mediaType);

            if (existsIndex > -1) {
                likedList.splice(existsIndex, 1);
                setStorageData(STORAGE_KEYS.LIKED_LIST, likedList);
                buttonElement.classList.remove('liked');
                showToast(`Removed "${data.title || data.name}" from Liked List`);
            } else {
                data.media_type = mediaType;
                likedList.unshift(data);
                setStorageData(STORAGE_KEYS.LIKED_LIST, likedList);
                buttonElement.classList.add('liked');
                showToast(`Added "${data.title || data.name}" to Liked List`);
            }
            displayLikedList();
        }

        // --- PLAYER MODAL LOGIC ---
        function openPlayerModal(url) {
            const playerModal = document.getElementById('player-modal');
            const playerContainer = document.getElementById('player-container');
            if (playerContainer && playerModal) {
                playerContainer.innerHTML = `<iframe src="${url}" allow="autoplay; fullscreen" allowfullscreen></iframe>`;
                playerModal.classList.add('active');
                document.body.classList.add('modal-open');
            }
        }

        function closePlayerModal() {
            const playerModal = document.getElementById('player-modal');
            const playerContainer = document.getElementById('player-container');
            if (playerContainer && playerModal) {
                playerModal.classList.remove('active');
                playerContainer.innerHTML = '';
                document.body.classList.remove('modal-open');
            }
        }

        // --- INFO MODAL LOGIC ---
        async function openInfoModal(mediaType, itemId) {
            addTrailerToWatched(itemId, mediaType);
            document.body.classList.add('modal-open');
            const infoModal = document.getElementById('info-modal');
            infoModal.classList.add('active');
            infoModal.innerHTML = `<div class="modal-backdrop"></div><div style="position:relative; z-index:1;"><div class="loader"></div></div>`;

            const url = `https://api.themoviedb.org/3/${mediaType}/${itemId}?api_key=${apiKey}&append_to_response=videos,content_ratings,credits`;
            const data = await fetchData(url);

            if (!data) {
                infoModal.innerHTML = '<p>Could not load details.</p>';
                return;
            }

            const title = data.name || data.title;
            const releaseYear = (data.first_air_date || data.release_date || '').substring(0, 4);
            const seasons = data.number_of_seasons ? `${data.number_of_seasons} Seasons` : '';
            const overview = data.overview;
            const cast = data.credits?.cast.slice(0, 3).map(c => c.name).join(', ') + ', more';
            const genres = data.genres.map(g => g.name).join(', ');
            const playerUrl = `${playerBaseUrl}/${mediaType}/${itemId}`;

            let rating = '';
            if (data.content_ratings?.results) {
                const usRating = data.content_ratings.results.find(r => r.iso_3166_1 === 'US');
                if (usRating?.rating) rating = `<span class="metadata-badge">${usRating.rating}</span>`;
            }

            const officialTrailer = data.videos?.results.find(v => v.site === 'YouTube' && v.type === 'Trailer');
            const mediaContent = officialTrailer
                ? `<iframe src="https://www.youtube.com/embed/${officialTrailer.key}?autoplay=1&mute=0&controls=0&loop=1&playlist=${officialTrailer.key}" allow="autoplay; encrypted-media" allowfullscreen></iframe>`
                : '';

            const backgroundStyle = !officialTrailer ? `style="background-image: url('${backdropBaseUrl}${data.backdrop_path}')"` : '';

            const playIcon = `<svg viewBox="0 0 24 24"><path d="M6 4l15 8-15 8z" fill="currentColor"></path></svg>`;
            const addIcon = `<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"></path></svg>`;
            const likeIcon = `<svg viewBox="0 0 24 24"><path d="M23,10C23,8.89,22.1,8,21,8H14.68L15.64,3.43C15.66,3.33,15.67,3.22,15.67,3.11C15.67,2.7,15.5,2.32,15.23,2.05L14.17,1L7.59,7.59C7.22,7.95,7,8.45,7,9V19A2,2 0 0,0 9,21H18C18.83,21,19.54,20.5,19.84,19.78L22.86,12.73C22.95,12.5,23,12.26,23,12V10M1,21H5V9H1V21Z"></path></svg>`;

            const likedList = getStorageData(STORAGE_KEYS.LIKED_LIST);
            const isLiked = likedList.some(item => item.id == itemId && (item.media_type || (item.title ? 'movie' : 'tv')) === mediaType);
            const likedClass = isLiked ? 'liked' : '';

            const myList = getStorageData(STORAGE_KEYS.MY_LIST);
            const isInMyList = myList.some(item => item.id == itemId && (item.media_type || (item.title ? 'movie' : 'tv')) === mediaType);
            const addedClass = isInMyList ? 'added' : '';
            const addListIcon = isInMyList ? '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"></path></svg>' : '<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"></path></svg>';

            infoModal.innerHTML = `
                <div class="modal-backdrop"></div>
                <div class="modal-content-wrapper">
                    <button class="modal-close-btn">&times;</button>
                    <div class="modal-media-container" ${backgroundStyle}>
                        ${mediaContent}
                        <div class="modal-content-overlay">
                            <h2 class="modal-title">${title}</h2>
                            <div class="modal-action-buttons">
                                <a href="${playerUrl}" class="modal-play-btn js-play-trigger">${playIcon} Play</a>
                                <button class="modal-icon-btn add-list-btn ${addedClass}" title="Add to My List" onclick="addToMyList('${itemId}', '${mediaType}', this)">${addListIcon}</button>
                                <button class="modal-icon-btn like-btn ${likedClass}" title="Like" onclick="addToLikedList('${itemId}', '${mediaType}', this)">${likeIcon}</button>
                            </div>
                        </div>
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
                    </div>
                </div>
            `;
        }

        function closeInfoModal() {
            document.body.classList.remove('modal-open');
            const infoModal = document.getElementById('info-modal');
            infoModal.classList.remove('active');
            infoModal.innerHTML = '';
        }

        // --- EVENT LISTENERS ---
        document.addEventListener('DOMContentLoaded', function () {
            displayMyList();
            displayTrailersWatched();
            displayLikedList();
            setupNavFiltering();
            setupSearch();
        });

        document.addEventListener('mouseenter', (event) => {
            const card = event.target.closest('.poster-card');
            if (card) fetchAndPopulateHoverCard(card);
        }, true);

        document.addEventListener('click', function (event) {
            const moreInfoButton = event.target.closest('.more-info-btn');
            const playButton = event.target.closest('.js-play-trigger');

            if (playButton) {
                event.preventDefault();
                const playerUrl = playButton.getAttribute('href');
                if (playerUrl) {
                    closeInfoModal();
                    openPlayerModal(playerUrl);
                }
            }

            if (moreInfoButton) {
                event.preventDefault();
                const { id, type } = moreInfoButton.dataset;
                if (id && type) openInfoModal(type, id);
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