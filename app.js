/* MovieScope — TMDB with TV support, correct modal endpoint, and media-aware watchlist
   (Your TMDB key is included)
*/

const TMDB_API_KEY = "b3b8083c61ce05cdf279f23bd07c620c";
const TMDB_BASE = "https://api.themoviedb.org/3";

// DOM refs
const headerSearch = document.getElementById("headerSearch");
const searchResults = document.getElementById("searchResults");
const trendingRow = document.getElementById("trendingRow");
const topRatedRow = document.getElementById("topRatedRow");
const modalRoot = document.getElementById("modalRoot");
const heroBg = document.getElementById("heroBg");
const featuredPoster = document.getElementById("featuredPoster");
const featuredTitle = document.getElementById("featuredTitle");
const featuredMeta = document.getElementById("featuredMeta");
const featuredOverview = document.getElementById("featuredOverview");
const favFeatured = document.getElementById("favFeatured");
const watchlistBtn = document.getElementById("watchlistBtn");
const playBtn = document.getElementById("playBtn");

const LS_WATCH = "moviescope_watchlist_v1";

// ---- helpers ----
function tmdb(path, params = {}) {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", TMDB_API_KEY);
  for (let k in params) if (params[k] !== undefined && params[k] !== null) url.searchParams.set(k, params[k]);
  return fetch(url).then(r => r.json());
}
function poster(path, size = "w500") { return path ? `https://image.tmdb.org/t/p/${size}${path}` : "https://via.placeholder.com/500x750/000000/FFFFFF?text=No+Image"; }
function backdrop(path, size = "w1280") { return path ? `https://image.tmdb.org/t/p/${size}${path}` : ""; }
function escapeTxt(s){ return s ? String(s).replaceAll("<","&lt;").replaceAll(">","&gt;") : ""; }

// watchlist now stores strings like "movie:123" or "tv:456"
function loadWatchlist(){ try{ const raw = JSON.parse(localStorage.getItem(LS_WATCH) || "[]"); return new Set(raw); } catch { return new Set(); } }
function saveWatchlist(set){ localStorage.setItem(LS_WATCH, JSON.stringify(Array.from(set))); }

// parse "media:id" -> { media, id }
function parseWatchKey(key){
  const [media, id] = (String(key)).split(":");
  return { media: media || "movie", id };
}

// ---- UI card builders (add data-media) ----
function movieCardSmall(m){
  // m should contain poster_path, title, overview, release_date / first_air_date and media_type
  const media = m.media_type || m.mediaType || "movie";
  const el = document.createElement("div");
  el.className = "movie-card";
  el.dataset.media = media;
  el.innerHTML = `
    <img src="${poster(m.poster_path)}" alt="${escapeTxt(m.title || m.name)}" />
    <div class="overlay"><div>${escapeTxt((m.overview||"").slice(0,110))}</div></div>
    <div class="movie-meta">
      <div class="movie-title">${escapeTxt(m.title || m.name || "Untitled")}</div>
      <div class="movie-sub">${((m.release_date||m.first_air_date||"").slice(0,4) || "")}</div>
    </div>
  `;
  el.addEventListener("click", () => openMovieModal(m.id, media));
  return el;
}
function movieCardGrid(m){
  const media = m.media_type || m.mediaType || "movie";
  const el = document.createElement("div");
  el.className = "movie-card";
  el.dataset.media = media;
  el.innerHTML = `
    <img src="${poster(m.poster_path)}" alt="${escapeTxt(m.title || m.name)}" />
    <div class="overlay"><div>${escapeTxt((m.overview||"").slice(0,120))}</div></div>
    <div class="movie-meta">
      <div class="movie-title">${escapeTxt(m.title || m.name || "Untitled")}</div>
      <div class="movie-sub">${((m.release_date||m.first_air_date||"").slice(0,4) || "")}</div>
    </div>
  `;
  el.addEventListener("click", () => openMovieModal(m.id, media));
  return el;
}

function renderGrid(list){
  searchResults.innerHTML = "";
  if(!list || !list.length){ searchResults.innerHTML = `<div class="p-6 bg-white/5 rounded text-center">No Results Found</div>`; return; }
  list.forEach(m => searchResults.appendChild(movieCardGrid(m)));
}
function renderRow(container, list){
  container.innerHTML = "";
  list.forEach(m => container.appendChild(movieCardSmall(m)));
}
function showLoadingGrid(n=10){
  searchResults.innerHTML = "";
  for(let i=0;i<n;i++){ const s=document.createElement("div"); s.className="movie-card skeleton"; s.style.height="260px"; searchResults.appendChild(s); }
}

// ---- hero trailer logic (set media on favFeatured) ----
let currentHeroTrailerKey = null;

async function setHeroMovie(item){
  if(!item) return;
  // item may be a movie-like or tv-like object
  const media = item.media_type || item.mediaType || "movie";
  featuredPoster.src = poster(item.poster_path);
  featuredTitle.textContent = item.title || item.name || "Untitled";
  featuredMeta.textContent = `${((item.release_date||item.first_air_date||"").slice(0,4))} • ⭐ ${item.vote_average || item.vote_average === 0 ? item.vote_average : ""}`;
  try {
    // fetch the full details for overview & runtime; choose endpoint by media
    const det = await tmdb(`/${media}/${item.id}`, { language: "en-US" });
    featuredOverview.textContent = det && (det.overview || det.summary) ? (det.overview.length>320?det.overview.slice(0,320)+"...":det.overview) : (item.overview || item.summary || "");
  } catch(e){
    featuredOverview.textContent = item.overview || "";
  }

  if(heroBg) heroBg.style.backgroundImage = `url(${backdrop(item.backdrop_path || item.poster_path)})`;
  favFeatured.dataset.id = item.id;
  favFeatured.dataset.media = media;

  // find trailer (by media)
  try {
    const vids = await tmdb(`/${media}/${item.id}/videos`);
    const trailer = vids && vids.results ? vids.results.find(v => v.site === "YouTube" && v.type === "Trailer") : null;
    if(trailer){ currentHeroTrailerKey = trailer.key; injectHeroBackgroundTrailer(trailer.key); }
    else { currentHeroTrailerKey = null; removeHeroBackgroundTrailer(); }
  } catch(e){ currentHeroTrailerKey = null; removeHeroBackgroundTrailer(); }
}

function injectHeroBackgroundTrailer(key){
  const existing = document.getElementById("heroTrailerIframe");
  if(existing && existing.dataset.key === key) return;
  removeHeroBackgroundTrailer();
  const iframe = document.createElement("iframe");
  iframe.id = "heroTrailerIframe";
  iframe.dataset.key = key;
  iframe.src = `https://www.youtube.com/embed/${key}?autoplay=1&mute=1&controls=0&loop=1&playlist=${key}&modestbranding=1&rel=0`;
  iframe.setAttribute("allow","autoplay; encrypted-media; picture-in-picture");
  iframe.style.position = "absolute";
  iframe.style.inset = "0";
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.objectFit = "cover";
  iframe.style.zIndex = "0";
  iframe.style.border = "0";
  iframe.style.pointerEvents = "none";
  if(heroBg){
    heroBg.style.position = "relative";
    heroBg.prepend(iframe);
  }
}
function removeHeroBackgroundTrailer(){
  const ex = document.getElementById("heroTrailerIframe");
  if(ex) ex.remove();
}

// ---- modal (now accepts media type) ----
async function openMovieModal(id, mediaType = "movie"){
  mediaType = String(mediaType || "movie").toLowerCase();
  const base = (mediaType === "tv") ? "/tv" : "/movie";
  try {
    const [details, videos, credits] = await Promise.all([
      tmdb(`${base}/${id}`, { language: "en-US" }),
      tmdb(`${base}/${id}/videos`),
      tmdb(`${base}/${id}/credits`)
    ]);
    if(!details || details.success === false){ alert("Could not load details"); return; }

    // remove existing modals
    document.querySelectorAll(".modal-backdrop").forEach(n => n.remove());
    const overlay = document.createElement("div");
    overlay.className = "modal-backdrop";
    overlay.style.overflow = "auto";

    // cast
    const cast = (credits && credits.cast) ? credits.cast.slice(0, 12) : [];
    const castHtml = cast.map(c=>{
      const face = c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : "https://via.placeholder.com/120x180/222/fff?text=no+face";
      return `<div class="cast-item"><img src="${face}" alt="${escapeTxt(c.name)}"><div class="cast-name">${escapeTxt(c.name)}</div><div class="cast-role">${escapeTxt(c.character || "")}</div></div>`;
    }).join("");

    const trailer = videos && videos.results ? videos.results.find(v => v.site === "YouTube" && v.type === "Trailer") : null;
    const trailerEmbed = trailer ? `<iframe id="modalTrailer" src="https://www.youtube.com/embed/${trailer.key}?autoplay=1&mute=0&controls=1&rel=0" allow="autoplay; encrypted-media" frameborder="0"></iframe>` : "";

    // choose title (movie.title or tv.name)
    const displayTitle = details.title || details.name || details.original_title || details.original_name || "Untitled";

    overlay.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true">
        <div class="modal-grid">
          <div>
            <img class="modal-poster" src="${poster(details.poster_path,'w500')}" alt="${escapeTxt(displayTitle)}" />
          </div>
          <div>
            <h3 class="modal-h">${escapeTxt(displayTitle)}</h3>
            <div class="modal-sub">${((details.release_date||details.first_air_date||"").slice(0,4))} • ${(details.genres||[]).map(g=>g.name).join(", ")} • ${details.runtime?details.runtime+"m":(details.episode_run_time && details.episode_run_time[0]?details.episode_run_time[0]+"m":"")} • ★ ${details.vote_average||"N/A"}</div>
            <p style="margin-top:12px;color:var(--muted);line-height:1.5;max-width:900px;">${escapeTxt(details.overview || "No description available.")}</p>
            <div class="modal-buttons">
              <button id="modalAdd" class="bg-red-600 px-3 py-1.5 rounded text-sm">Add to Watchlist</button>
              <button id="modalClose" class="text-sm px-3 py-1.5 rounded text-slate-300 border">Close</button>
              <button id="modalPlay" class="text-sm px-3 py-1.5 rounded text-white bg-black/60 border">Play Trailer</button>
            </div>
            <div style="margin-top:14px;">
              <div style="font-weight:600; margin-bottom:8px;">Cast</div>
              <div class="cast-slider">${castHtml || "<div style='color:var(--muted)'>Cast not available.</div>"}</div>
            </div>
          </div>

          ${trailer ? `<div class="video-row">${trailerEmbed}</div>` : `<div class="video-row" style="color:var(--muted)">Trailer not available.</div>`}
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    overlay.scrollTop = 0;

    // handlers
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
    const addBtn = overlay.querySelector("#modalAdd");
    const closeBtn = overlay.querySelector("#modalClose");
    const playBtnModal = overlay.querySelector("#modalPlay");

    // watchlist key is media:id
    const watchKey = `${mediaType}:${id}`;
    const watchSet = loadWatchlist();
    if(watchSet.has(watchKey)){ addBtn.textContent = "Remove from Watchlist"; addBtn.classList.add("fav-saved"); }
    addBtn.addEventListener("click", () => {
      const s = loadWatchlist();
      if(s.has(watchKey)){ s.delete(watchKey); addBtn.textContent = "Add to Watchlist"; addBtn.classList.remove("fav-saved"); }
      else { s.add(watchKey); addBtn.textContent = "Remove from Watchlist"; addBtn.classList.add("fav-saved"); }
      saveWatchlist(s);
    });

    closeBtn.addEventListener("click", () => overlay.remove());

    if(playBtnModal && trailer){
      playBtnModal.addEventListener("click", () => {
        const frame = overlay.querySelector("#modalTrailer");
        if(frame) frame.scrollIntoView({behavior:"smooth", block:"center"});
      });
    }

    // cast slider drag
    const slider = overlay.querySelector(".cast-slider");
    if(slider){
      let isDown=false, startX, scrollLeft;
      slider.addEventListener('mousedown', (e)=>{ isDown=true; slider.classList.add('active'); startX = e.pageX - slider.offsetLeft; scrollLeft = slider.scrollLeft; });
      slider.addEventListener('mouseleave', ()=>{ isDown=false; slider.classList.remove('active'); });
      slider.addEventListener('mouseup', ()=>{ isDown=false; slider.classList.remove('active'); });
      slider.addEventListener('mousemove', (e)=>{ if(!isDown) return; e.preventDefault(); const x = e.pageX - slider.offsetLeft; const walk = (x - startX) * 1.5; slider.scrollLeft = scrollLeft - walk; });
    }

  } catch(e){
    console.error("openMovieModal error", e);
    alert("Could not load details");
  }
}

// header watchlist (now handles media:id entries)
if(watchlistBtn){
  watchlistBtn.addEventListener("click", async () => {
    const ids = Array.from(loadWatchlist());
    if(ids.length === 0) return alert("Your watchlist is empty.");
    showLoadingGrid(Math.min(12, ids.length));
    const arr = [];
    for(const key of ids){
      const { media, id } = parseWatchKey(key);
      try {
        const det = await tmdb(`/${media}/${id}`, { language: "en-US" });
        if(det && (det.id || det.name)) {
          // normalize to movie-like fields used by renderGrid
          det.media_type = media;
          det.title = det.title || det.name;
          arr.push(det);
        }
      } catch(e){ /* skip missing */ }
    }
    renderGrid(arr);
    window.scrollTo({ top: 420, behavior: "smooth" });
  });
}

// hero Play button should open featured modal (reads media)
if(playBtn){
  playBtn.addEventListener("click", async () => {
    const id = favFeatured?.dataset?.id;
    const media = favFeatured?.dataset?.media || "movie";
    if(!id) return alert("No featured item available.");
    openMovieModal(id, media);
  });
}

// featured watchlist toggle (stores media:id)
if(favFeatured){
  favFeatured.addEventListener("click", () => {
    const id = favFeatured.dataset.id;
    const media = favFeatured.dataset.media || "movie";
    if(!id) return;
    const watchKey = `${media}:${id}`;
    const s = loadWatchlist();
    if(s.has(watchKey)){ s.delete(watchKey); favFeatured.textContent = "+ Watchlist"; favFeatured.classList.remove("fav-saved"); }
    else { s.add(watchKey); favFeatured.textContent = "✓ In Watchlist"; favFeatured.classList.add("fav-saved"); }
    saveWatchlist(s);
  });
}

// NAV: improved element-based scrolling + TV shows support
function scrollToEl(el, offset = 80) {
  if(!el) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  const rect = el.getBoundingClientRect();
  const top = window.scrollY + rect.top - offset;
  window.scrollTo({ top: Math.max(0, Math.round(top)), behavior: "smooth" });
}

async function mapTvToMovieLike(tv) {
  return {
    id: tv.id,
    title: tv.name || tv.original_name || "Untitled",
    poster_path: tv.poster_path,
    backdrop_path: tv.backdrop_path,
    overview: tv.overview || "",
    first_air_date: tv.first_air_date || "",
    media_type: "tv"
  };
}

async function handleNavClick(text) {
  text = (text || "").trim().toLowerCase();
  if (text === "home") {
    const hero = document.getElementById("hero") || heroBg || document.body;
    scrollToEl(hero, 24);
    return;
  }
  if (text === "movies") {
    const moviesSection = document.getElementById("searchResults") || document.querySelector(".search-results") || searchResults;
    scrollToEl(moviesSection, 80);
    return;
  }
  if (text === "top rated") {
    const topSection = document.getElementById("topRatedRow") || topRatedRow || document.querySelector(".top-rated");
    scrollToEl(topSection, 80);
    return;
  }
  if (text === "tv shows" || text === "tv") {
    try {
      showLoadingGrid();
      const tvData = await tmdb("/trending/tv/week");
      const tvList = (tvData && tvData.results) ? tvData.results : [];
      const mapped = await Promise.all(tvList.map(mapTvToMovieLike));
      renderGrid(mapped);
      if (mapped.length) await setHeroMovie(mapped[0]);
      const moviesSection = document.getElementById("searchResults") || searchResults;
      scrollToEl(moviesSection, 80);
    } catch (err) {
      console.error("Error loading TV shows", err);
      alert("Could not load TV shows. Check console.");
    }
    return;
  }
  alert(`Nav: ${text}`);
}

document.querySelectorAll("header nav a").forEach(a => {
  a.addEventListener("click", (e) => {
    e.preventDefault();
    handleNavClick(a.textContent);
  });
});

// search debounce
let searchTimer;
if(headerSearch){
  headerSearch.addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(()=>{ const q = (e.target.value||"").trim(); if(!q){ return; } performSearch(q); }, 350);
  });
}
async function performSearch(q){
  if(!q) return;
  showLoadingGrid();
  try {
    const res = await tmdb("/search/movie", { query: q, page: 1, include_adult: false });
    // tag results as movie
    const results = (res && res.results) ? res.results.map(r => { r.media_type = r.media_type || "movie"; r.title = r.title || r.name; return r; }) : [];
    renderGrid(results || []);
    window.scrollTo({ top: 420, behavior: "smooth" });
  } catch(e){ console.error(e); renderGrid([]); }
}

// init: trending, top rated, featured
async function init(){
  const trendingData = await tmdb("/trending/movie/week");
  const trending = (trendingData && trendingData.results) ? trendingData.results : [];
  // ensure movie items have media_type
  const trendingNorm = trending.map(m => { m.media_type = m.media_type || "movie"; m.title = m.title || m.name; return m; });
  renderRow(trendingRow, trendingNorm.slice(0, 18));

  const topData = await tmdb("/movie/top_rated", { language: "en-US", page: 1 });
  const top = (topData && topData.results) ? topData.results : [];
  const topNorm = top.map(m => { m.media_type = m.media_type || "movie"; m.title = m.title || m.name; return m; });
  renderRow(topRatedRow, topNorm.slice(0, 18));

  if(trendingNorm.length){
    const featuredMovie = trendingNorm.find(m => m.backdrop_path || m.poster_path) || trendingNorm[0];
    await setHeroMovie(featuredMovie);
  }

  // initial grid: show trending movies
  renderGrid(trendingNorm.slice(0, 40));
}

init();
