async function nh_apiGet(path) {
    const res = await fetch(path, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`GET ${path} failed`);
    return res.json();
}

async function nh_apiSend(path, method, body) {
    const res = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'same-origin'
    });
    if (!res.ok) throw new Error(`${method} ${path} failed`);
    return res.json();
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.ceil((date - now) / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return 'Coming Soon';
    if (diffDays <= 7) return `Coming ${date.toLocaleDateString('en-US', { weekday: 'long' })}`;

    return `Coming ${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
}

function nh_createPhoneCard(item, mediaType, isComingSoon) {
    if (!item.backdrop_path && !item.poster_path) return null;

    const cardElement = document.createElement('div');
    cardElement.classList.add('phone-card');
    cardElement.dataset.id = item.id;
    // Resolve the actual media type per item (avoid using 'mixed' which causes 404s)
    const resolvedType = (mediaType && mediaType !== 'mixed')
        ? mediaType
        : (item.media_type || (item.title ? 'movie' : 'tv'));
    cardElement.dataset.type = resolvedType;

    const imageUrl = item.backdrop_path ? `${backdropBaseUrl}${item.backdrop_path}` : `${posterBaseUrl}${item.poster_path}`;
    const title = item.title || item.name;
    const description = item.overview || 'No description available.';
    const comingDate = formatDate(item.release_date || item.first_air_date);

    let buttonsHtml = '';
    if (isComingSoon) {
        buttonsHtml = `
            <p class="coming-date">${comingDate}</p>
            <button class="remind-me-btn" data-id="${item.id}" data-type="${resolvedType}" data-title="${title.replace(/\"/g, '\\\"')}" data-poster="${item.poster_path || ''}" data-release="${item.release_date || item.first_air_date || ''}">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 22C13.1 22 14 21.1 14 20H10C10 21.1 10.9 22 12 22ZM18 16V11C18 7.93 16.37 5.36 13.5 4.68V4C13.5 3.17 12.83 2.5 12 2.5C11.17 2.5 10.5 3.17 10.5 4V4.68C7.63 5.36 6 7.93 6 11V16L4 18V19H20V18L18 16Z" fill="white"/>
                </svg>
                <span>Remind Me</span>
            </button>
        `;
    } else {
        buttonsHtml = `
            <div class="hero-buttons">
                <a href="${playerBaseUrl}/${resolvedType}/${item.id}" class="btn btn-play js-play-trigger" data-id="${item.id}" data-type="${resolvedType}">
                    <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>
                    Play
                </a>
                <button class="btn btn-mylist" data-id="${item.id}" data-type="${resolvedType}" onclick="event.stopPropagation(); addToMyList('${item.id}', '${resolvedType}', this)">
                    <svg viewBox="0 0 24 24"><path d="M13 7h-2v4H7v2h4v4h2v-4h4v-2h-4V7zm-1-5C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"></path></svg>
                    My List
                </button>
            </div>
        `;
    }

    cardElement.innerHTML = `
        <div class="card-poster" data-trailer-key="${item.trailer_key || ''}">
            <img src="${imageUrl}" alt="${title}" class="poster-image">
            <div class="in-place-player"></div>
            ${item.trailer_key ? `
            <div class="play-overlay">
                <button class="play-trailer-btn">
                    <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </button>
            </div>` : ''}
        </div>
        <div class="card-info">
            <h3 class="card-title">${title}</h3>
            <p class="card-description">${description}</p>
            ${buttonsHtml}
        </div>
    `;

    return cardElement;
}

function nh_createPosterCard(item, mediaType, isComingSoon = false) {
    // Use the unified card layout (same as mobile) on all viewports for consistency
    return nh_createPhoneCard(item, mediaType, isComingSoon);
}

function nh_displayContentRow(items, container, mediaType, isRankedList = false, isComingSoon = false) {
    container.innerHTML = '';
    items.forEach((item, index) => {
        const card = nh_createPosterCard(item, mediaType, isComingSoon);
        if (!card) return;

        if (isRankedList) {
            const rankNumber = document.createElement('div');
            rankNumber.classList.add('rank-number-mobile');
            rankNumber.textContent = index + 1;
            const posterElement = card.querySelector('.card-poster');
            if (posterElement) {
                posterElement.insertBefore(rankNumber, posterElement.firstChild);
            }
            container.appendChild(card);
        } else {
            container.appendChild(card);
        }
    });
}

async function nh_fetchData(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (error) {
        console.warn('Fetch failed:', url, error.message);
        return null;
    }
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}


// Helper to create skeleton cards for New & Hot
function createSkeletonCards() {
    let skeletons = '';
    // Show 4 skeleton cards to fill the view
    for (let i = 0; i < 4; i++) {
        skeletons += `
            <div class="skeleton-phone-card">
                <div class="skeleton-poster skeleton"></div>
                <div class="skeleton-info">
                    <div class="skeleton-title skeleton"></div>
                    <div class="skeleton-text-line skeleton"></div>
                    <div class="skeleton-text-line skeleton" style="width: 80%"></div>
                    <div class="skeleton-btn skeleton"></div>
                </div>
            </div>`;
    }
    return skeletons;
}

// Load Coming Soon content (upcoming streaming releases)
async function loadComingSoon() {
    const container = document.getElementById('coming-soon-content');
    container.innerHTML = createSkeletonCards();

    try {
        // Use Watchmode API for Netflix-only upcoming releases
        const watchmodeApiKey = '51G4wxnccn8OxMClxU0Q0P9qzj78suwhOs2Yd4pa'; // Test API key from docs
        const today = new Date().toISOString().split('T')[0].replace(/-/g, ''); // Format: YYYYMMDD
        const futureDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0].replace(/-/g, ''); // 60 days from now
        const releasesData = await nh_fetchData(`https://api.watchmode.com/v1/releases/?apiKey=${watchmodeApiKey}&source_ids=203&start_date=${today}&end_date=${futureDate}&limit=50`);

        const allUpcoming = [];
        if (releasesData?.releases) {
            // Filter for only future releases (not already released)
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Set to start of day

            const futureReleases = releasesData.releases.filter(item => {
                const releaseDate = new Date(item.source_release_date);
                return releaseDate >= today; // Only include releases from today onwards
            });

            // Convert Watchmode format to our expected format
            for (const item of futureReleases.slice(0, 20)) { // Limit to 20 to avoid too many API calls
                try {
                    // Get detailed info from TMDB to get proper poster paths, trailers, and backdrop images
                    const tmdbDetails = await nh_fetchData(`https://api.themoviedb.org/3/${item.tmdb_type}/${item.tmdb_id}?api_key=${apiKey}&append_to_response=videos,images`);

                    // Get trailer for coming soon items
                    let trailerKey = null;
                    if (tmdbDetails?.videos?.results) {
                        const trailer = tmdbDetails.videos.results.find(v => v.site === 'YouTube' && v.type === 'Trailer');
                        if (trailer) trailerKey = trailer.key;
                    }

                    // Get horizontal backdrop image for coming soon items
                    let backdropPath = null;
                    if (tmdbDetails?.images?.backdrops && tmdbDetails.images.backdrops.length > 0) {
                        // Find a backdrop with appropriate aspect ratio (around 16:9)
                        const suitableBackdrop = tmdbDetails.images.backdrops.find(backdrop =>
                            backdrop.aspect_ratio > 1.7 && backdrop.aspect_ratio < 2.0
                        ) || tmdbDetails.images.backdrops[0];
                        backdropPath = suitableBackdrop.file_path;
                    }

                    const convertedItem = {
                        id: item.tmdb_id,
                        title: item.title,
                        name: item.title,
                        overview: tmdbDetails?.overview, // Added overview
                        poster_path: tmdbDetails?.poster_path || null,
                        backdrop_path: backdropPath,
                        media_type: item.type === 'movie' ? 'movie' : 'tv',
                        release_date: item.source_release_date,
                        first_air_date: item.source_release_date,
                        popularity: tmdbDetails?.popularity || Math.random() * 100,
                        source_name: item.source_name,
                        is_original: item.is_original,
                        is_coming_soon: true,
                        trailer_key: trailerKey
                    };
                    allUpcoming.push(convertedItem);
                } catch (error) {
                    console.warn('Error fetching TMDB details for', item.title, error);
                    // Fallback without TMDB details
                    const convertedItem = {
                        id: item.tmdb_id,
                        title: item.title,
                        name: item.title,
                        poster_path: null,
                        media_type: item.type === 'movie' ? 'movie' : 'tv',
                        release_date: item.source_release_date,
                        first_air_date: item.source_release_date,
                        popularity: Math.random() * 100,
                        source_name: item.source_name,
                        is_original: item.is_original,
                        is_coming_soon: true,
                        trailer_key: null
                    };
                    allUpcoming.push(convertedItem);
                }
            }
        }

        // Sort by release date (soonest first), then by popularity
        allUpcoming.sort((a, b) => {
            const dateA = new Date(a.release_date || a.first_air_date || '2025-01-01');
            const dateB = new Date(b.release_date || b.first_air_date || '2025-01-01');

            // First sort by date (soonest first)
            const dateDiff = dateA - dateB;
            if (dateDiff !== 0) return dateDiff;

            // Then by popularity (highest first)
            return b.popularity - a.popularity;
        });

        if (allUpcoming.length > 0) {
            nh_displayContentRow(allUpcoming.slice(0, 40), container, 'mixed', false, true);
        } else {
            container.innerHTML = '<div class="empty-message">No upcoming streaming releases available.</div>';
        }
    } catch (error) {
        console.error('Error loading coming soon:', error);
        container.innerHTML = '<div class="empty-message">Failed to load upcoming streaming releases.</div>';
    }
}

// Load Everyone's Watching (trending content)
async function loadEveryoneWatching() {
    const container = document.getElementById('everyone-watching-content');
    container.innerHTML = createSkeletonCards();

    try {
        const trendingData = await nh_fetchData(`https://api.themoviedb.org/3/trending/all/day?api_key=${apiKey}&region=US&language=en-US&page=1`);

        if (trendingData?.results) {
            // Add trailer keys to trending items
            const itemsWithTrailers = await Promise.all(trendingData.results.slice(0, 40).map(async (item) => {
                try {
                    const tmdbDetails = await nh_fetchData(`https://api.themoviedb.org/3/${item.media_type}/${item.id}?api_key=${apiKey}&append_to_response=videos`);
                    let trailerKey = null;
                    if (tmdbDetails?.videos?.results) {
                        const trailer = tmdbDetails.videos.results.find(v => v.site === 'YouTube' && v.type === 'Trailer');
                        if (trailer) trailerKey = trailer.key;
                    }
                    return { ...item, trailer_key: trailerKey };
                } catch (error) {
                    return { ...item, trailer_key: null };
                }
            }));

            nh_displayContentRow(itemsWithTrailers, container, 'mixed');
        } else {
            container.innerHTML = '<div class="empty-message">No trending content available.</div>';
        }
    } catch (error) {
        console.error('Error loading everyone watching:', error);
        container.innerHTML = '<div class="empty-message">Failed to load trending content.</div>';
    }
}

// Load Top 10 TV Shows
async function loadTop10TVShows() {
    const container = document.getElementById('top-10-tv-content');
    container.innerHTML = createSkeletonCards();

    try {
        const tvData = await nh_fetchData(`https://api.themoviedb.org/3/trending/tv/day?api_key=${apiKey}&region=US&language=en-US&page=1`);

        if (tvData?.results) {
            // Add trailer keys to TV shows
            const tvShowsWithTrailers = await Promise.all(tvData.results.slice(0, 10).map(async (item) => {
                try {
                    const tmdbDetails = await nh_fetchData(`https://api.themoviedb.org/3/tv/${item.id}?api_key=${apiKey}&append_to_response=videos`);
                    let trailerKey = null;
                    if (tmdbDetails?.videos?.results) {
                        const trailer = tmdbDetails.videos.results.find(v => v.site === 'YouTube' && v.type === 'Trailer');
                        if (trailer) trailerKey = trailer.key;
                    }
                    return { ...item, trailer_key: trailerKey };
                } catch (error) {
                    return { ...item, trailer_key: null };
                }
            }));

            nh_displayContentRow(tvShowsWithTrailers, container, 'tv', true);
        } else {
            container.innerHTML = '<div class="empty-message">No TV shows available.</div>';
        }
    } catch (error) {
        console.error('Error loading top 10 TV shows:', error);
        container.innerHTML = '<div class="empty-message">Failed to load TV shows.</div>';
    }
}

// Load Top 10 Movies
async function loadTop10Movies() {
    const container = document.getElementById('top-10-movies-content');
    container.innerHTML = createSkeletonCards();

    try {
        const movieData = await nh_fetchData(`https://api.themoviedb.org/3/trending/movie/day?api_key=${apiKey}&region=US&language=en-US&page=1`);

        if (movieData?.results) {
            // Add trailer keys to movies
            const moviesWithTrailers = await Promise.all(movieData.results.slice(0, 10).map(async (item) => {
                try {
                    const tmdbDetails = await nh_fetchData(`https://api.themoviedb.org/3/movie/${item.id}?api_key=${apiKey}&append_to_response=videos`);
                    let trailerKey = null;
                    if (tmdbDetails?.videos?.results) {
                        const trailer = tmdbDetails.videos.results.find(v => v.site === 'YouTube' && v.type === 'Trailer');
                        if (trailer) trailerKey = trailer.key;
                    }
                    return { ...item, trailer_key: trailerKey };
                } catch (error) {
                    return { ...item, trailer_key: null };
                }
            }));

            nh_displayContentRow(moviesWithTrailers, container, 'movie', true);
        } else {
            container.innerHTML = '<div class="empty-message">No movies available.</div>';
        }
    } catch (error) {
        console.error('Error loading top 10 movies:', error);
        container.innerHTML = '<div class="empty-message">Failed to load movies.</div>';
    }
}

async function addToMyList(itemId, mediaType, button) {
    // Mirror main page: fetch full TMDB details to avoid null data
    try {
        const details = await nh_fetchData(`https://api.themoviedb.org/3/${mediaType}/${itemId}?api_key=${apiKey}`);
        const isAdded = button.classList.contains('added');
        const method = isAdded ? 'DELETE' : 'POST';
        const url = '/api/me/my-list';

        const payload = {
            tmdb_id: itemId,
            media_type: mediaType,
            data: details ? { ...details, media_type: mediaType } : undefined
        };

        const response = await nh_apiSend(url, method, payload);
        if (response.success) {
            button.classList.toggle('added');
            const icon = button.querySelector('svg');
            if (button.classList.contains('added')) {
                if (icon) icon.innerHTML = '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"></path>';
                showToast('Added to My List');
            } else {
                if (icon) icon.innerHTML = '<path d="M13 7h-2v4H7v2h4v4h2v-4h4v-2h-4V7zm-1-5C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"></path>';
                showToast('Removed from My List');
            }
        }
    } catch (error) {
        console.error('Failed to update My List:', error);
        showToast('Could not update My List. Please try again.');
    }
}

// Tab switching functionality
function setupTabSwitching() {
    const filterTabs = document.querySelectorAll('.filter-tab');
    const contentSections = document.querySelectorAll('.content-section');

    filterTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs
            filterTabs.forEach(t => t.classList.remove('active'));
            // Add active class to clicked tab
            tab.classList.add('active');

            // Hide all sections
            contentSections.forEach(section => section.classList.remove('active'));

            // Show selected section
            const filterType = tab.dataset.filter;
            const targetSection = document.getElementById(`${filterType}-section`);
            if (targetSection) {
                targetSection.classList.add('active');

                // Load content for the selected section if not already loaded
                loadSectionContent(filterType);
            }
        });
    });
}

function loadSectionContent(filterType) {
    switch (filterType) {
        case 'coming-soon':
            if (!document.getElementById('coming-soon-content').hasChildNodes() ||
                document.getElementById('coming-soon-content').querySelector('.loader')) {
                loadComingSoon();
            }
            break;
        case 'everyone-watching':
            if (!document.getElementById('everyone-watching-content').hasChildNodes() ||
                document.getElementById('everyone-watching-content').querySelector('.loader')) {
                loadEveryoneWatching();
            }
            break;
        case 'top-10-tv':
            if (!document.getElementById('top-10-tv-content').hasChildNodes() ||
                document.getElementById('top-10-tv-content').querySelector('.loader')) {
                loadTop10TVShows();
            }
            break;
        case 'top-10-movies':
            if (!document.getElementById('top-10-movies-content').hasChildNodes() ||
                document.getElementById('top-10-movies-content').querySelector('.loader')) {
                loadTop10Movies();
            }
            break;
    }
}


// Initialize the page
document.addEventListener('DOMContentLoaded', () => {
    setupTabSwitching();
    // Load the default active section (Coming Soon)
    loadSectionContent('coming-soon');

    let currentlyPlayingCard = null;

    function stopCurrentTrailer() {
        if (currentlyPlayingCard) {
            const player = currentlyPlayingCard.querySelector('.in-place-player');
            const posterImage = currentlyPlayingCard.querySelector('.poster-image');
            const playOverlay = currentlyPlayingCard.querySelector('.play-overlay');

            player.innerHTML = '';
            posterImage.style.display = 'block';
            if (playOverlay) playOverlay.style.display = 'flex';
            currentlyPlayingCard.classList.remove('is-playing');
            currentlyPlayingCard = null;
        }
    }

    document.addEventListener('click', async (e) => {
        const playTrigger = e.target.closest('.js-play-trigger');
        if (playTrigger) {
            e.preventDefault();
            const url = playTrigger.href;
            const mediaType = playTrigger.dataset.type;
            const itemId = playTrigger.dataset.id;
            openPlayerModal(url, mediaType, itemId);
            return;
        }

        const remindBtn = e.target.closest('.remind-me-btn');
        if (remindBtn) {
            e.preventDefault();
            e.stopPropagation();
            const itemId = remindBtn.dataset.id;
            const mediaType = remindBtn.dataset.type;
            const title = remindBtn.dataset.title;
            const posterPath = remindBtn.dataset.poster;
            const releaseDate = (remindBtn.dataset.release || '').slice(0, 10);
            try {
                const res = await nh_apiSend('/api/me/reminders', 'POST', {
                    tmdb_id: itemId,
                    media_type: mediaType,
                    title,
                    poster_path: posterPath,
                    release_date: releaseDate
                });
                if (res && res.success) showToast('Reminder set');
            } catch (err) {
                console.error('Failed to set reminder', err);
                showToast('Could not set reminder');
            }
            return;
        }

        const posterCard = e.target.closest('.card-poster');

        if (posterCard) {
            const trailerKey = posterCard.dataset.trailerKey;
            if (!trailerKey) {
                // If there's no trailer, do nothing. We can add a toast message if desired.
                // showToast('Trailer not available for this title.');
                return;
            }

            // If clicking the currently playing video, do nothing
            if (posterCard.classList.contains('is-playing')) {
                return;
            }

            stopCurrentTrailer();

            const player = posterCard.querySelector('.in-place-player');
            const posterImage = posterCard.querySelector('.poster-image');
            const playOverlay = posterCard.querySelector('.play-overlay');

            posterImage.style.display = 'none';
            if (playOverlay) playOverlay.style.display = 'none';

            player.innerHTML = `
                <iframe src="https://www.youtube.com/embed/${trailerKey}?autoplay=1&rel=0&controls=0&showinfo=0"
                        frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>
            `;

            posterCard.classList.add('is-playing');
            currentlyPlayingCard = posterCard;

        } else {
            // If user clicks outside a playing video, stop it
            if (currentlyPlayingCard && !e.target.closest('.card-poster.is-playing')) {
                stopCurrentTrailer();
            }
        }
    });
});