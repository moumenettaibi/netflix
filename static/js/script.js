const apiKey = 'f2d7ae9dee829174c475e32fe8f993dc';
const posterBaseUrl = 'https://image.tmdb.org/t/p/w500';
const backdropBaseUrl = 'https://image.tmdb.org/t/p/original';
const playerBaseUrl = 'https://player.videasy.net'; 

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

function displayContentRow(items, container, mediaType, isRankedList = false) {
    container.innerHTML = '';
    items.forEach((item, index) => {
        const card = createPosterCard(item, mediaType);
        if (!card) return;
        if (isRankedList) {
            const rankedContainer = document.createElement('div');
            rankedContainer.classList.add('ranked-item-container');
            const rankNumber = document.createElement('div');
            rankNumber.classList.add('rank-number');
            rankNumber.textContent = index + 1;
            rankedContainer.appendChild(rankNumber);
            rankedContainer.appendChild(card);
            container.appendChild(rankedContainer);
        } else {
            container.appendChild(card);
        }
    });
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
                <button class="action-btn add-list-btn ${addedClass}" title="Add to My List" data-id="${itemId}" data-type="${mediaType}" onclick="addToMyList('${itemId}', '${mediaType}', this)"><svg viewBox="0 0 24 24">${addListIcon}</svg></button>
                <button class="action-btn like-btn ${likedClass}" title="Like" data-id="${itemId}" data-type="${mediaType}" onclick="addToLikedList('${itemId}', '${mediaType}', this)"><svg viewBox="0 0 24 24"><path d="M23,10C23,8.89,22.1,8,21,8H14.68L15.64,3.43C15.66,3.33,15.67,3.22,15.67,3.11C15.67,2.7,15.5,2.32,15.23,2.05L14.17,1L7.59,7.59C7.22,7.95,7,8.45,7,9V19A2,2 0 0,0 9,21H18C18.83,21,19.54,20.5,19.84,19.78L22.86,12.73C22.95,12.5,23,12.26,23,12V10M1,21H5V9H1V21Z"></path></svg></button>
                <button class="action-btn more-info-btn" title="More Info" data-id="${itemId}" data-type="${mediaType}"><svg viewBox="0 0 24 24"><path d="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z"></path></svg></button>
            </div>
            <p class="hover-card-overview">${overview}</p>
            <div class="hover-card-meta">
                <span class="meta-rating">${rating}</span><span class="meta-year">${releaseYear}</span><span class="meta-runtime">${formattedRuntime}</span>
            </div>
            <div class="hover-card-genres">${genreTags}</div>
        </div>`;
}

const initializePage = async () => {
    setupHeroSection();
    createAndDisplayShuffledRows(); // New all-in-one function for content rows
};

async function fetchData(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) { console.error('Error fetching data:', error); return null; }
}

const customCategories = [
    // Movies
    { name: "Action", type: 'movie', params: 'with_genres=28&sort_by=popularity.desc' },
    { name: "Comedy", type: 'movie', params: 'with_genres=35&sort_by=popularity.desc' },
    { name: "Horror", type: 'movie', params: 'with_genres=27&sort_by=popularity.desc' },
    { name: "Animation", type: 'movie', params: 'with_genres=16&sort_by=popularity.desc' },
    { name: "Science Fiction", type: 'movie', params: 'with_genres=878&sort_by=popularity.desc' },
    { name: "Blockbuster Action Movies", type: 'movie', params: 'with_genres=28&sort_by=revenue.desc' },
    { name: "Action with a Side of Romance", type: 'movie', params: 'with_genres=28,10749&sort_by=popularity.desc' },
    { name: "Thrillers with a Side of Action", type: 'movie', params: 'with_genres=53,28&sort_by=popularity.desc' },
    { name: "Hollywood Action Movies", type: 'movie', params: 'with_origin_country=US&with_genres=28&sort_by=popularity.desc' },
    { name: "Blockbuster Exciting Movies", type: 'movie', params: 'sort_by=revenue.desc' },
    { name: "Crowd Pleasers Movies", type: 'movie', params: 'sort_by=vote_average.desc&vote_count.gte=5000' },
    // TV Shows
    { name: "Action & Adventure", type: 'tv', params: 'with_genres=10759&sort_by=popularity.desc' },
    { name: "Comedy", type: 'tv', params: 'with_genres=35&sort_by=popularity.desc' },
    { name: "Drama", type: 'tv', params: 'with_genres=18&sort_by=popularity.desc' },
    { name: "Sci-Fi & Fantasy", type: 'tv', params: 'with_genres=10765&sort_by=popularity.desc' },
    { name: "Emmy-Winning TV Shows", type: 'tv', params: 'with_keywords=1846&sort_by=popularity.desc' },
    { name: "Award-Winning TV Shows", type: 'tv', params: 'with_keywords=155798&sort_by=popularity.desc' },
    { name: "Crowd Pleasers Tv Shows", type: 'tv', params: 'sort_by=vote_average.desc&vote_count.gte=2000' } // Newly added category
];

// Helper function to shuffle an array (Fisher-Yates algorithm)
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

async function createAndDisplayShuffledRows() {
    const mainContainer = document.getElementById('shuffled-rows-container');
    mainContainer.innerHTML = '<div class="loader"></div>';

    // Fetch user's location to get relevant trending data
    let countryDetails = { region: 'US', countryName: 'the U.S.' };
    try {
        const geoResponse = await fetch('https://ipapi.co/json/');
        const geoData = await geoResponse.json();
        if (geoData && geoData.country_code) {
            countryDetails = { region: geoData.country_code, countryName: geoData.country_name };
        }
    } catch (error) { console.warn('Could not fetch user location, defaulting to US.', error); }

    // 1. Define all rows to be displayed, including trending and custom categories
    const allRowDefinitions = [
        // Trending Rows
        { 
            name: `Top 10 Movies in ${countryDetails.countryName} Today`, 
            type: 'movie',
            isRanked: true, 
            url: `https://api.themoviedb.org/3/trending/movie/day?api_key=${apiKey}&region=${countryDetails.region}` 
        },
        { 
            name: `Top 10 TV Shows in ${countryDetails.countryName} Today`, 
            type: 'tv', 
            isRanked: true,
            url: `https://api.themoviedb.org/3/trending/tv/day?api_key=${apiKey}&region=${countryDetails.region}` 
        },
        // Custom Category Rows
        ...customCategories.map(category => {
            let title = category.name;
            if (!title.includes('Movies') && !title.includes('Shows') && !title.includes('Dramas') && !title.includes('Pleasers') && !title.includes('Weekend')) {
                 title = `${category.name} ${category.type === 'movie' ? 'Movies' : 'TV Shows'}`;
            }
            return {
                name: title,
                type: category.type,
                isRanked: false,
                url: `https://api.themoviedb.org/3/discover/${category.type}?api_key=${apiKey}&${category.params}`
            }
        })
    ];

    // 2. Fetch data for all rows concurrently
    const rowDataPromises = allRowDefinitions.map(def => fetchData(def.url));
    const allResults = await Promise.all(rowDataPromises);

    // 3. Prepare a list of renderable rows (filter out failed fetches or empty results)
    let renderableRows = [];
    allResults.forEach((data, index) => {
        if (data?.results && data.results.length > 0) {
            renderableRows.push({
                title: allRowDefinitions[index].name,
                type: allRowDefinitions[index].type,
                isRanked: allRowDefinitions[index].isRanked,
                items: allRowDefinitions[index].isRanked ? data.results.slice(0, 10) : data.results
            });
        }
    });

    // 4. Shuffle the list of categories
    shuffleArray(renderableRows);

    // 5. Enforce the "no more than two of the same type in a row" rule for a better mix
    for (let i = 2; i < renderableRows.length; i++) {
        if (renderableRows[i].type === renderableRows[i-1].type && renderableRows[i].type === renderableRows[i-2].type) {
            let swapIndex = -1;
            for (let j = i + 1; j < renderableRows.length; j++) {
                if (renderableRows[j].type !== renderableRows[i].type) {
                    swapIndex = j;
                    break;
                }
            }
            if (swapIndex !== -1) {
                [renderableRows[i], renderableRows[swapIndex]] = [renderableRows[swapIndex], renderableRows[i]];
            }
        }
    }

    // 6. Render the final shuffled and adjusted list of rows
    mainContainer.innerHTML = ''; // Clear loader
    renderableRows.forEach(rowData => {
        const row = document.createElement('div');
        row.classList.add('content-row');
        row.dataset.contentType = rowData.type; // Set for filtering logic
        
        row.innerHTML = `<h2>${rowData.title}</h2><div class="content-scroll"></div>`;
        mainContainer.appendChild(row);

        const contentScrollContainer = row.querySelector('.content-scroll');
        displayContentRow(rowData.items, contentScrollContainer, rowData.type, rowData.isRanked);
    });
}

async function setupHeroSection(mediaType = 'all') {
    const heroContainer = document.getElementById('hero-container');
    heroContainer.innerHTML = '<div class="loader"></div>';

    try {
        const isMobile = window.innerWidth <= 480;
        let trendingUrl;
        if (mediaType === 'all') {
            trendingUrl = `https://api.themoviedb.org/3/trending/all/day?api_key=${apiKey}&language=en-US`;
        } else {
            trendingUrl = `https://api.themoviedb.org/3/trending/${mediaType}/day?api_key=${apiKey}&language=en-US`;
        }

        const trendingData = await fetchData(trendingUrl);
        const allTrending = (trendingData?.results || []).filter(item => item.backdrop_path && item.poster_path);

        if (allTrending.length > 0) {
            const top10Trending = allTrending.slice(0, 10);
            const featured = top10Trending[Math.floor(Math.random() * top10Trending.length)];
            const featuredMediaType = mediaType === 'all' ? (featured.media_type || (featured.title ? 'movie' : 'tv')) : mediaType;
            const playerUrl = `${playerBaseUrl}/${featuredMediaType}/${featured.id}`;

            if (isMobile) {
                const detailsUrl = `https://api.themoviedb.org/3/${featuredMediaType}/${featured.id}?api_key=${apiKey}`;
                const details = await fetchData(detailsUrl);
                const genreTags = details.genres.slice(0, 5).map(g => `<span>${g.name}</span>`).join('');
                const myList = getStorageData(STORAGE_KEYS.MY_LIST);
                const isInMyList = myList.some(item => item.id == featured.id && (item.media_type || (item.title ? 'movie' : 'tv')) === featuredMediaType);
                const myListButtonIcon = isInMyList ? `<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"></path></svg>` : `<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"></path></svg>`;
                
                heroContainer.innerHTML = `
                <div class="hero-frame-mobile" data-id="${featured.id}" data-type="${featuredMediaType}">
                    <div class="hero-image" style="background-image: url('${posterBaseUrl}${featured.poster_path}')"></div>
                    <div class="hero-gradient"></div>
                    <div class="hero-info">
                        <h1 class="hero-title-mobile">${featured.name || featured.title}</h1>
                        <div class="hero-tags-mobile">${genreTags}</div>
                        <div class="hero-buttons-mobile">
                            <a href="${playerUrl}" class="btn-play-mobile js-play-trigger">
                                <svg viewBox="0 0 24 24"><path d="M6 4l15 8-15 8z"></path></svg>Play
                            </a>
                            <button class="btn-mylist-mobile" data-id="${featured.id}" data-type="${featuredMediaType}" onclick="event.stopPropagation(); addToMyList('${featured.id}', '${featuredMediaType}')">
                                ${myListButtonIcon} My List
                            </button>
                        </div>
                    </div>
                </div>`;
            } else {
                 const rankInType = (trendingData?.results.findIndex(item => item.id === featured.id) || 0) + 1;
                 const mediaTypeDisplay = featuredMediaType === 'movie' ? 'Movies' : 'TV Shows';
                 heroContainer.style.backgroundImage = `url(${backdropBaseUrl}${featured.backdrop_path})`;
                 heroContainer.innerHTML = `
                    <div class="hero-content">
                        <h1 class="hero-title">${featured.name || featured.title}</h1>
                        <div class="hero-rank-badge">
                            <div class="hero-rank-square"><div class="top-text">TOP</div><div class="number-text">10</div></div>
                            <div class="hero-rank-text">#${rankInType} in ${mediaTypeDisplay} Today</div>
                        </div>
                        <p class="hero-overview">${featured.overview}</p>
                        <div class="hero-buttons">
                            <a href="${playerUrl}" class="btn btn-play js-play-trigger"><svg viewBox="0 0 24 24"><path d="M6 4l15 8-15 8z" fill="currentColor"></path></svg>Play</a>
                            <a href="#" class="btn btn-more-info" data-id="${featured.id}" data-type="${featuredMediaType}">
                                <svg viewBox="0 0 24 24"><path d="M11,9H13V7H11M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H13V11H11V17Z"/></svg>
                                More info
                            </a>
                        </div>
                    </div>`;
            }
        } else {
            heroContainer.innerHTML = "<p>Could not load featured content.</p>";
        }
    } catch (error) {
        heroContainer.innerHTML = "<p>Could not load featured content.</p>";
        console.error("Error setting up hero section:", error);
    }
}

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

async function openInfoModal(mediaType, itemId) {
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
    const mediaContent = officialTrailer ? `<iframe src="https://www.youtube.com/embed/${officialTrailer.key}?autoplay=1&mute=0&controls=0&loop=1&playlist=${officialTrailer.key}" allow="autoplay; encrypted-media" allowfullscreen></iframe>` : '';
    const backgroundStyle = !officialTrailer ? `style="background-image: url('${backdropBaseUrl}${data.backdrop_path}')"` : '';
    const playIcon = `<svg viewBox="0 0 24 24"><path d="M6 4l15 8-15 8z" fill="currentColor"></path></svg>`;
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
                        <button class="modal-icon-btn add-list-btn ${addedClass}" title="Add to My List" data-id="${itemId}" data-type="${mediaType}" onclick="addToMyList('${itemId}', '${mediaType}', this)">${addListIcon}</button>
                        <button class="modal-icon-btn like-btn ${likedClass}" title="Like" data-id="${itemId}" data-type="${mediaType}" onclick="addToLikedList('${itemId}', '${mediaType}', this)">${likeIcon}</button>
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
        </div>`;
}

function closeInfoModal() {
    document.body.classList.remove('modal-open');
    const infoModal = document.getElementById('info-modal');
    infoModal.classList.remove('active');
    infoModal.innerHTML = '';
}

const searchIconTrigger = document.getElementById('search-icon-trigger');
const headerSearchInput = document.getElementById('header-search-input');
const closeSearchIcon = document.getElementById('close-search-icon');
const searchResultsSection = document.getElementById('search-results-section');
const searchResultsGrid = document.getElementById('search-results');
const searchFeedback = document.getElementById('search-feedback');
const heroContainer = document.getElementById('hero-container');
const mainContent = document.getElementById('main-content');
let searchTimeout;

function toggleSearch() {
    if (window.innerWidth <= 480) {
        const mobileSearchPopup = document.getElementById('mobile-search-popup');
        if (mobileSearchPopup) {
            mobileSearchPopup.classList.add('active');
            document.body.classList.add('modal-open');
        }
        return;
    }
    document.body.classList.toggle('search-active');
    if (document.body.classList.contains('search-active')) {
        setTimeout(() => headerSearchInput.focus(), 100);
    } else {
        closeSearch();
    }
}

const mobileSearchBackBtn = document.getElementById('mobile-search-back-btn');
if (mobileSearchBackBtn) {
    mobileSearchBackBtn.addEventListener('click', () => {
        const mobileSearchPopup = document.getElementById('mobile-search-popup');
        if (mobileSearchPopup) {
            mobileSearchPopup.classList.remove('active');
        }
        document.body.classList.remove('modal-open');
        document.body.classList.remove('search-active');
    });
}

function closeSearch() {
    document.body.classList.remove('search-active');
    headerSearchInput.value = '';
    searchResultsSection.style.display = 'none';
    searchResultsGrid.innerHTML = '';
    if (searchFeedback) searchFeedback.innerHTML = '';
    heroContainer.style.display = 'flex';
    mainContent.style.display = 'block';
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
        heroContainer.style.display = 'flex';
        mainContent.style.display = 'block';
        return;
    }
    heroContainer.style.display = 'none';
    mainContent.style.display = 'none';
    searchResultsSection.style.display = 'block';
    validResults.forEach(item => {
        const card = createPosterCard(item, item.media_type);
        if (card) searchResultsGrid.appendChild(card);
    });
}

document.addEventListener('DOMContentLoaded', initializePage);

// --- CONTENT FILTERING LOGIC ---
function filterContent(filter) {
    // This now correctly filters the dynamically generated rows
    const allContent = document.querySelectorAll('#shuffled-rows-container .content-row');
    allContent.forEach(section => {
        if (filter === 'all' || section.dataset.contentType === filter) {
            section.style.display = 'block';
        } else {
            section.style.display = 'none';
        }
    });
}

// --- MOBILE FILTERING LOGIC ---
function setupMobileFiltering() {
    const mobileFilterButtons = document.querySelectorAll('.mobile-filters button');
    mobileFilterButtons.forEach(button => {
        button.addEventListener('click', function() {
            const buttonText = this.textContent.trim();
            
            mobileFilterButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            if (buttonText === 'TV Shows') {
                filterContent('tv');
                setupHeroSection('tv');
            } else if (buttonText === 'Movies') {
                filterContent('movie');
                setupHeroSection('movie');
            } else if (buttonText.includes('Categories')) {
                // Categories functionality will be implemented later
            }
        });
    });
}

// --- DESKTOP NAVIGATION FILTERING ---
function setupNavFiltering() {
    const navLinks = document.querySelectorAll('.main-nav li[id]');
    navLinks.forEach(link => {
        link.addEventListener('click', function (e) {
            e.preventDefault();

            if (document.body.classList.contains('search-active')) {
                closeSearch();
            }

            navLinks.forEach(l => l.classList.remove('active'));
            this.classList.add('active');

            const filter = this.id.replace('nav-', '');
            if (filter === 'home') {
                filterContent('all');
                setupHeroSection('all');
            } else if (filter === 'shows') {
                filterContent('tv');
                setupHeroSection('tv');
            } else if (filter === 'movies') {
                filterContent('movie');
                setupHeroSection('movie');
            }
        });
    });
}

// Initialize filtering
document.addEventListener('DOMContentLoaded', () => {
    setupMobileFiltering();
    setupNavFiltering();
    setupMobileSearch();
});

// --- MOBILE SEARCH FUNCTIONALITY ---
function setupMobileSearch() {
    const searchIconTrigger = document.getElementById('search-icon-trigger');
    const mobileSearchPopup = document.getElementById('mobile-search-popup');
    const mobileSearchBackBtn = document.getElementById('mobile-search-back-btn');
    const mobileSearchInput = document.getElementById('mobile-search-input');
    const mobileSearchResultsList = document.getElementById('mobile-search-results-list');

    searchIconTrigger.addEventListener('click', function() {
        if (window.innerWidth <= 480) {
            mobileSearchPopup.classList.add('active');
            document.body.classList.add('modal-open');
            setTimeout(() => mobileSearchInput.focus(), 100);
            loadMobileSearchResults();
        }
    });

    mobileSearchBackBtn.addEventListener('click', function() {
        mobileSearchPopup.classList.remove('active');
        document.body.classList.remove('modal-open');
        mobileSearchInput.value = '';
        mobileSearchResultsList.innerHTML = '';
    });

    let mobileSearchTimeout;
    mobileSearchInput.addEventListener('input', function() {
        clearTimeout(mobileSearchTimeout);
        const query = this.value.trim();
        
        mobileSearchTimeout = setTimeout(() => {
            if (query) {
                performMobileSearch(query);
            } else {
                loadMobileSearchResults();
            }
        }, 500);
    });

    mobileSearchPopup.addEventListener('click', function(e) {
        if (e.target === this) {
            this.classList.remove('active');
            document.body.classList.remove('modal-open');
        }
    });
}

async function loadMobileSearchResults() {
    const mobileSearchResultsList = document.getElementById('mobile-search-results-list');
    mobileSearchResultsList.innerHTML = '<div class="loader"></div>';

    try {
        const movieUrl = `https://api.themoviedb.org/3/trending/movie/day?api_key=${apiKey}&language=en-US`;
        const tvUrl = `https://api.themoviedb.org/3/trending/tv/day?api_key=${apiKey}&language=en-US`;
        
        const [movieData, tvData] = await Promise.all([
            fetchData(movieUrl),
            fetchData(tvUrl)
        ]);

        const allTrending = (movieData?.results || []).concat(tvData?.results || []);
        const recommendations = allTrending.slice(0, 8).filter(item => item.backdrop_path);

        displayMobileSearchResults(recommendations, 'Recommended TV Shows & Movies');
    } catch (error) {
        console.error('Error loading mobile search results:', error);
        mobileSearchResultsList.innerHTML = '<p>Could not load recommendations.</p>';
    }
}

async function performMobileSearch(query) {
    const mobileSearchResultsList = document.getElementById('mobile-search-results-list');
    mobileSearchResultsList.innerHTML = '<div class="loader"></div>';

    try {
        const url = `https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&query=${encodeURIComponent(query)}`;
        const data = await fetchData(url);
        
        if (data?.results) {
            const validResults = data.results.filter(item => 
                (item.media_type === 'movie' || item.media_type === 'tv') && item.backdrop_path
            );
            displayMobileSearchResults(validResults, `Search results for "${query}"`);
        } else {
            mobileSearchResultsList.innerHTML = '<p>No results found.</p>';
        }
    } catch (error) {
        console.error('Error performing mobile search:', error);
        mobileSearchResultsList.innerHTML = '<p>Search failed.</p>';
    }
}

function displayMobileSearchResults(results, title) {
    const mobileSearchResultsList = document.getElementById('mobile-search-results-list');
    const mobileSearchTitle = document.querySelector('.mobile-search-title');
    
    mobileSearchTitle.textContent = title;
    
    if (results.length === 0) {
        mobileSearchResultsList.innerHTML = '<p>No results found.</p>';
        return;
    }

    mobileSearchResultsList.innerHTML = results.map(item => {
        const title = item.title || item.name;
        const mediaType = item.media_type || (item.title ? 'movie' : 'tv');
        const playerUrl = `${playerBaseUrl}/${mediaType}/${item.id}`;
        
        return `
            <div class="mobile-result-item">
                <img src="${backdropBaseUrl}${item.backdrop_path}" alt="${title}" class="mobile-result-thumbnail">
                <div class="mobile-result-info">
                    <div class="mobile-result-title">${title}</div>
                    <div class="mobile-result-meta">${mediaType === 'movie' ? 'Movie' : 'TV Show'}</div>
                </div>
                <button class="mobile-play-btn js-play-trigger" data-url="${playerUrl}" title="Play">
                    <svg viewBox="0 0 24 24">
                        <path d="M6 4l15 8-15 8z"></path>
                    </svg>
                </button>
            </div>
        `;
    }).join('');

    mobileSearchResultsList.querySelectorAll('.js-play-trigger').forEach(btn => {
        btn.addEventListener('click', function() {
            const playerUrl = this.dataset.url;
            if (playerUrl) {
                closeInfoModal();
                openPlayerModal(playerUrl);
                document.getElementById('mobile-search-popup').classList.remove('active');
                document.body.classList.remove('modal-open');
            }
        });
    });
}

document.addEventListener('mouseenter', (event) => {
    const card = event.target.closest('.poster-card');
    if (card && window.innerWidth > 480) fetchAndPopulateHoverCard(card);
}, true);

document.addEventListener('click', function (event) {
    const moreInfoButton = event.target.closest('.more-info-btn, .btn-more-info, .hero-frame-mobile');
    const playButton = event.target.closest('.js-play-trigger');
    const posterCard = event.target.closest('.poster-card');

    if (event.target.closest('.btn-mylist-mobile')) {
        return;
    }
    if (playButton) {
        event.preventDefault();
        const playerUrl = playButton.getAttribute('href') || playButton.dataset.url;
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
    if (posterCard && window.innerWidth <= 480) {
        event.preventDefault();
        const { id, type } = posterCard.dataset;
        if (id && type) openInfoModal(type, id);
    }
    if (event.target.closest('.modal-close-btn') || event.target.matches('.modal-backdrop')) {
        closeInfoModal();
    }
    if (event.target.closest('#close-player-btn')) {
        closePlayerModal();
    }
});

searchIconTrigger.addEventListener('click', toggleSearch);
closeSearchIcon.addEventListener('click', toggleSearch);

headerSearchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        const query = headerSearchInput.value.trim();
        if (query) {
            searchResultsSection.style.display = 'block';
            searchResultsGrid.innerHTML = '<div class="loader"></div>';
            performSearch(query);
        } else {
            searchResultsGrid.innerHTML = '';
            searchFeedback.innerHTML = '';
            searchResultsSection.style.display = 'none';
            heroContainer.style.display = 'flex';
            mainContent.style.display = 'block';
        }
    }, 500);
});

window.addEventListener('scroll', () => {
    const header = document.querySelector('header');
    if (window.scrollY > 10) {
        header.classList.add('scrolled');
    } else {
        header.classList.remove('scrolled');
    }
});

const STORAGE_KEYS = {
    MY_LIST: 'netflix_my_list',
    LIKED_LIST: 'netflix_liked_list'
};

function getStorageData(key) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
    } catch (e) { return []; }
}

function setStorageData(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (e) { console.error('Error writing to localStorage:', e); }
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function updateAllButtons(itemId, mediaType) {
    const likedList = getStorageData(STORAGE_KEYS.LIKED_LIST);
    const isLiked = likedList.some(item => item.id == itemId && (item.media_type || (item.title ? 'movie' : 'tv')) === mediaType);

    const myList = getStorageData(STORAGE_KEYS.MY_LIST);
    const isInMyList = myList.some(item => item.id == itemId && (item.media_type || (item.title ? 'movie' : 'tv')) === mediaType);

    const addListIcon = isInMyList ? '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"></path></svg>' : '<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"></path></svg>';
    
    const likeButtons = document.querySelectorAll(`.like-btn[data-id="${itemId}"][data-type="${mediaType}"]`);
    likeButtons.forEach(button => {
        if (isLiked) {
            button.classList.add('liked');
        } else {
            button.classList.remove('liked');
        }
    });

    const addListButtons = document.querySelectorAll(`.add-list-btn[data-id="${itemId}"][data-type="${mediaType}"], .btn-mylist-mobile[data-id="${itemId}"][data-type="${mediaType}"]`);
    addListButtons.forEach(button => {
        if (isInMyList) {
            button.classList.add('added');
        } else {
            button.classList.remove('added');
        }

        if (button.classList.contains('btn-mylist-mobile')) {
            button.innerHTML = `${addListIcon} My List`;
        } else {
            button.innerHTML = addListIcon;
        }
    });
}

async function addToMyList(itemId, mediaType) {
    const url = `https://api.themoviedb.org/3/${mediaType}/${itemId}?api_key=${apiKey}`;
    const data = await fetchData(url);
    if (!data) {
        showToast('Error updating My List');
        return;
    }
    let myList = getStorageData(STORAGE_KEYS.MY_LIST);
    const existsIndex = myList.findIndex(item => item.id == itemId && (item.media_type || (item.title ? 'movie' : 'tv')) === mediaType);

    if (existsIndex > -1) {
        myList.splice(existsIndex, 1);
        showToast(`Removed "${data.title || data.name}" from My List`);
    } else {
        data.media_type = mediaType;
        myList.unshift(data);
        showToast(`Added "${data.title || data.name}" to My List`);
    }
    setStorageData(STORAGE_KEYS.MY_LIST, myList);
    updateAllButtons(itemId, mediaType);
}

async function addToLikedList(itemId, mediaType) {
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
         showToast(`Removed "${data.title || data.name}" from Liked List`);
     } else {
         data.media_type = mediaType;
         likedList.unshift(data);
         showToast(`Added "${data.title || data.name}" to Liked List`);
     }
     setStorageData(STORAGE_KEYS.LIKED_LIST, likedList);
     updateAllButtons(itemId, mediaType);
}