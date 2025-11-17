/* MovieScope — TMDB with Netflix-style UI enhancements
   - hero background trailer (muted autoplay)
   - card hover scale
   - modal cast slider & modal trailer autoplay
   - keep Watchlist + search + trending/top rated
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
function loadWatchlist(){ try{ return new Set(JSON.parse(localStorage.getItem(LS_WATCH)) || []); } catch { return new Set(); } }
function saveWatchlist(set){ localStorage.setItem(LS_WATCH, JSON.stringify([...set])); }

// ---- UI card builders ----
function movieCardSmall(m){
  const el = document.createElement("div");
  el.className = "movie-card";
  el.innerHTML = `
    <img src="${poster(m.poster_path)}" alt="${escapeTxt(m.title)}" />
    <div class="overlay"><div>${escapeTxt((m.overview||"").slice(0,110))}</div></div>
    <div class="movie-meta">
      <div class="movie-title">${escapeTxt(m.title)}</div>
      <div class="movie-sub">${((m.release_date||"").slice(0,4) || "")}</div>
    </div>
  `;
  el.addEventListener("click", () => openMovieModal(m.id));
  return el;
}
function movieCardGrid(m){
  const el = document.createElement("div");
  el.className = "movie-card";
  el.innerHTML = `
    <img src="${poster(m.poster_path)}" alt="${escapeTxt(m.title)}" />
    <div class="overlay"><div>${escapeTxt((m.overview||"").slice(0,120))}</div></div>
    <div class="movie-meta">
      <div class="movie-title">${escapeTxt(m.title)}</div>
      <div class="movie-sub">${((m.release_date||"").slice(0,4) || "")}</div>
    </div>
  `;
  el.addEventListener("click", () => openMovieModal(m.id));
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

// ---- hero trailer logic ----
let currentHeroTrailerKey = null; // store youtube key

async function setHeroMovie(movie){
  if(!movie) return;
  featuredPoster.src = poster(movie.poster_path,'w500');
  featuredTitle.textContent = movie.title;
  featuredMeta.textContent = `${(movie.release_date||"").slice(0,4)} • ⭐ ${movie.vote_average}`;
  try {
    const det = await tmdb(`/movie/${movie.id}`, { language: "en-US" });
    featuredOverview.textContent = det && det.overview ? (det.overview.length>320?det.overview.slice(0,320)+"...":det.overview) : (movie.overview || "");
  } catch(e){ featuredOverview.textContent = movie.overview || ""; }

  if(heroBg) heroBg.style.backgroundImage = `url(${backdrop(movie.backdrop_path || movie.poster_path)})`;
  favFeatured.dataset.id = movie.id;

  // find trailer and prepare background video iframe (muted autoplay)
  try {
    const vids = await tmdb(`/movie/${movie.id}/videos`);
    const trailer = vids && vids.results ? vids.results.find(v => v.site === "YouTube" && v.type === "Trailer") : null;
    if(trailer){
      currentHeroTrailerKey = trailer.key;
      injectHeroBackgroundTrailer(trailer.key);
    } else {
      currentHeroTrailerKey = null;
      removeHeroBackgroundTrailer();
    }
  } catch(e){
    currentHeroTrailerKey = null;
    removeHeroBackgroundTrailer();
  }
}

function injectHeroBackgroundTrailer(key){
  // if already present with same key, keep it
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
  iframe.style.pointerEvents = "none"; // don't capture clicks
  // place inside heroBg container
  if(heroBg){
    heroBg.style.position = "relative";
    heroBg.prepend(iframe);
  }
}
function removeHeroBackgroundTrailer(){
  const ex = document.getElementById("heroTrailerIframe");
  if(ex) ex.remove();
}

// ---- modal with cast slider and autoplay trailer ----
async function openMovieModal(id){
  const [details, videos, credits] = await Promise.all([
    tmdb(`/movie/${id}`),
    tmdb(`/movie/${id}/videos`),
    tmdb(`/movie/${id}/credits`)
  ]);
  if(!details || details.success === false){ alert("Could not load details"); return; }

  // remove existing modals
  document.querySelectorAll(".modal-backdrop").forEach(n => n.remove());
  const overlay = document.createElement("div");
  overlay.className = "modal-backdrop";
  overlay.style.overflow = "auto";

  // build cast slider html
  const cast = (credits && credits.cast) ? credits.cast.slice(0, 12) : [];
  const castHtml = cast.map(c=>{
    const face = c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : "https://via.placeholder.com/120x180/222/fff?text=no+face";
    return `<div class="cast-item"><img src="${face}" alt="${escapeTxt(c.name)}"><div class="cast-name">${escapeTxt(c.name)}</div><div class="cast-role">${escapeTxt(c.character || "")}</div></div>`;
  }).join("");

  const trailer = videos && videos.results ? videos.results.find(v => v.site === "YouTube" && v.type === "Trailer") : null;
  const trailerEmbed = trailer ? `<iframe id="modalTrailer" src="https://www.youtube.com/embed/${trailer.key}?autoplay=1&mute=0&controls=1&rel=0" allow="autoplay; encrypted-media" frameborder="0"></iframe>` : "";

  overlay.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true">
      <div class="modal-grid">
        <div>
          <img class="modal-poster" src="${poster(details.poster_path,'w500')}" alt="${escapeTxt(details.title)}" />
        </div>
        <div>
          <h3 class="modal-h">${escapeTxt(details.title)}</h3>
          <div class="modal-sub">${((details.release_date||"").slice(0,4))} • ${(details.genres||[]).map(g=>g.name).join(", ")} • ${details.runtime?details.runtime+"m":""} • ★ ${details.vote_average||"N/A"}</div>
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

  const watchSet = loadWatchlist();
  if(watchSet.has(String(details.id))){ addBtn.textContent = "Remove from Watchlist"; addBtn.classList.add("fav-saved"); }
  addBtn.addEventListener("click", () => {
    const s = loadWatchlist();
    if(s.has(String(details.id))){ s.delete(String(details.id)); addBtn.textContent = "Add to Watchlist"; addBtn.classList.remove("fav-saved"); }
    else { s.add(String(details.id)); addBtn.textContent = "Remove from Watchlist"; addBtn.classList.add("fav-saved"); }
    saveWatchlist(s);
  });
  closeBtn.addEventListener("click", () => overlay.remove());
  if(playBtnModal && trailer) {
    playBtnModal.addEventListener("click", () => {
      const frame = overlay.querySelector("#modalTrailer");
      if(frame) {
        // ensure not muted
        const src = frame.src;
        // reload with autoplay=1&mute=0 (already set)
        frame.src = src;
        frame.scrollIntoView({behavior:"smooth", block:"center"});
      }
    });
  }

  // make cast slider scrollable with mouse drag
  const slider = overlay.querySelector(".cast-slider");
  if(slider){
    let isDown=false, startX, scrollLeft;
    slider.addEventListener('mousedown', (e)=>{ isDown=true; slider.classList.add('active'); startX = e.pageX - slider.offsetLeft; scrollLeft = slider.scrollLeft; });
    slider.addEventListener('mouseleave', ()=>{ isDown=false; slider.classList.remove('active'); });
    slider.addEventListener('mouseup', ()=>{ isDown=false; slider.classList.remove('active'); });
    slider.addEventListener('mousemove', (e)=>{ if(!isDown) return; e.preventDefault(); const x = e.pageX - slider.offsetLeft; const walk = (x - startX) * 1.5; slider.scrollLeft = scrollLeft - walk; });
  }
}

// header watchlist
if(watchlistBtn){
  watchlistBtn.addEventListener("click", async () => {
    const ids = Array.from(loadWatchlist());
    if(ids.length === 0) return alert("Your watchlist is empty.");
    showLoadingGrid(Math.min(12, ids.length));
    const arr = [];
    for(const id of ids){
      try { const det = await tmdb(`/movie/${id}`); if(det && det.id) arr.push(det); } catch(e){ /* skip */ }
    }
    renderGrid(arr);
    window.scrollTo({ top: 420, behavior: "smooth" });
  });
}

// hero Play button should open featured modal
if(playBtn){
  playBtn.addEventListener("click", async () => {
    const id = favFeatured?.dataset?.id;
    if(!id) return alert("No featured movie available.");
    openMovieModal(id);
  });
}

// featured watchlist toggle
if(favFeatured){
  favFeatured.addEventListener("click", () => {
    const id = favFeatured.dataset.id;
    if(!id) return;
    const s = loadWatchlist();
    if(s.has(String(id))){ s.delete(String(id)); favFeatured.textContent = "+ Watchlist"; favFeatured.classList.remove("fav-saved"); }
    else { s.add(String(id)); favFeatured.textContent = "✓ In Watchlist"; favFeatured.classList.add("fav-saved"); }
    saveWatchlist(s);
  });
}

// NAV: support Home, Movies, TV Shows, Top Rated
async function mapTvToMovieLike(tv) {
  return {
    id: tv.id,
    title: tv.name || tv.original_name || "Untitled",
    poster_path: tv.poster_path,
    backdrop_path: tv.backdrop_path,
    overview: tv.overview || "",
    release_date: tv.first_air_date || ""
  };
}

async function handleNavClick(text) {
  text = (text || "").trim().toLowerCase();
  if (text === "home") {
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  if (text === "movies") {
    window.scrollTo({ top: 600, behavior: "smooth" });
    return;
  }
  if (text === "top rated") {
    window.scrollTo({ top: 1200, behavior: "smooth" });
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
      window.scrollTo({ top: 320, behavior: "smooth" });
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
    renderGrid(res.results || []);
    window.scrollTo({ top: 420, behavior: "smooth" });
  } catch(e){ console.error(e); renderGrid([]); }
}

// init: trending, top rated, featured
async function init(){
  const trendingData = await tmdb("/trending/movie/week");
  const trending = (trendingData && trendingData.results) ? trendingData.results : [];
  renderRow(trendingRow, trending.slice(0, 18));

  const topData = await tmdb("/movie/top_rated", { language: "en-US", page: 1 });
  const top = (topData && topData.results) ? topData.results : [];
  renderRow(topRatedRow, top.slice(0, 18));

  if(trending.length){
    const featuredMovie = trending.find(m => m.backdrop_path || m.poster_path) || trending[0];
    await setHeroMovie(featuredMovie);
  }

  // initial grid: show trending
  renderGrid(trending.slice(0, 40));
}

init();
