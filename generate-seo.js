const fs = require("fs/promises");
const path = require("path");

const SITE_URL = "https://cinevault.space";
const TMDB_API_KEY = (process.env.TMDB_API_KEY || "45bfb471ba5d77a724bbdc3f147bb1b3").trim();
const BATCH_LIMIT = Math.max(5, Math.min(120, parseInt(process.env.BATCH_LIMIT || "40", 10) || 40));
const TODAY_ISO = new Date().toISOString().split("T")[0];

const SLOT = Math.floor(Date.now() / (3 * 60 * 60 * 1000));
const PAGE_OFFSET = (SLOT % 15) * 2;

const PROVIDER_LINKS = {
  "netflix": "https://www.netflix.com/",
  "amazon prime video": "https://www.primevideo.com/",
  "apple tv": "https://tv.apple.com/",
  "apple tv+": "https://tv.apple.com/",
  "disney plus": "https://www.disneyplus.com/",
  "hulu": "https://www.hulu.com/",
  "max": "https://www.max.com/",
  "peacock": "https://www.peacocktv.com/",
  "paramount plus": "https://www.paramountplus.com/",
  "crunchyroll": "https://www.crunchyroll.com/",
  "youtube": "https://www.youtube.com/",
  "google play movies": "https://play.google.com/store/movies",
  "fandango at home": "https://athome.fandango.com/"
};

const GENRE_KEY_MAP = {
  28: "action",
  12: "adventure",
  16: "anime",
  35: "comedy",
  80: "crime",
  18: "drama",
  10751: "family",
  14: "scifi",
  27: "horror",
  9648: "crime",
  10749: "romance",
  878: "scifi",
  53: "thriller",
  10759: "action",
  10765: "scifi"
};

function slugify(text) {
  return (
    String(text || "title")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "title"
  );
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isComingSoon(dateStr) {
  return Boolean(dateStr && dateStr > TODAY_ISO);
}

function formatDate(dateStr) {
  if (!dateStr) return "Release date TBA";
  const dt = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return dateStr;
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  });
}

function getProviderUrl(providerName, title) {
  const key = String(providerName || "").trim().toLowerCase();
  if (PROVIDER_LINKS[key]) return PROVIDER_LINKS[key];
  return `https://www.google.com/search?q=${encodeURIComponent(`${title} watch on ${providerName}`)}`;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function tmdbGet(endpoint, params = {}) {
  const clean = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const qs = new URLSearchParams({ api_key: TMDB_API_KEY, ...params });
  return fetchJson(`https://api.themoviedb.org/3${clean}?${qs.toString()}`);
}

async function fetchPages(endpoint, pages, extraParams = {}) {
  const collected = [];
  for (const p of pages) {
    try {
      const data = await tmdbGet(endpoint, { page: p, ...extraParams });
      if (Array.isArray(data.results)) collected.push(...data.results);
    } catch {
      // Skip out-of-range page if TMDB returns fewer pages
    }
  }
  return collected;
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function loop() {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await worker(items[current], current);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, loop));
  return results;
}

function extractProviders(watchResults) {
  if (!watchResults || typeof watchResults !== "object") return [];
  const preferredOrder = ["US", "GB", "CA", "PK", "IN", "AU"];
  const orderedRegions = [
    ...preferredOrder.filter((c) => watchResults[c]),
    ...Object.keys(watchResults).filter((c) => !preferredOrder.includes(c))
  ];

  const seen = new Map();
  for (const cc of orderedRegions.slice(0, 6)) {
    const block = watchResults[cc] || {};
    const entries = [
      ...(block.flatrate || []).map((x) => ({ ...x, mode: "Stream" })),
      ...(block.rent || []).map((x) => ({ ...x, mode: "Rent" })),
      ...(block.buy || []).map((x) => ({ ...x, mode: "Buy" }))
    ];
    for (const item of entries) {
      if (!item.provider_name) continue;
      const key = item.provider_name.toLowerCase();
      if (!seen.has(key)) seen.set(key, { name: item.provider_name, mode: item.mode });
    }
  }
  return Array.from(seen.values()).slice(0, 10);
}

async function hydrateTitle(mediaType, raw, rowKey) {
  const d = await tmdbGet(`/${mediaType}/${raw.id}`, {
    append_to_response: "credits,videos,watch/providers"
  });

  const title = d.title || d.name || raw.title || raw.name || "Untitled";
  const releaseDate = d.release_date || d.first_air_date || "";
  const year = parseInt(releaseDate.slice(0, 4), 10) || 2026;
  const genreIds = Array.isArray(d.genres)
    ? d.genres.map((g) => g.id)
    : Array.isArray(raw.genre_ids)
    ? raw.genre_ids
    : [];

  const genreKeys = Array.from(new Set(genreIds.map((id) => GENRE_KEY_MAP[id]).filter(Boolean)));
  const genreNames =
    Array.isArray(d.genres) && d.genres.length
      ? d.genres.map((g) => g.name).filter(Boolean)
      : [mediaType === "tv" ? "Series" : "Movie"];

  let runtimeText = mediaType === "tv" ? "TV Series" : "Feature Film";
  if (typeof d.runtime === "number" && d.runtime > 0) {
    const hrs = Math.floor(d.runtime / 60);
    const mins = d.runtime % 60;
    runtimeText = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  } else if (typeof d.number_of_seasons === "number" && d.number_of_seasons > 0) {
    runtimeText = `${d.number_of_seasons} Season${d.number_of_seasons > 1 ? "s" : ""}`;
  }

  const videos = Array.isArray(d.videos?.results) ? d.videos.results : [];
  const trailer =
    videos.find((v) => v.site === "YouTube" && v.type === "Trailer" && v.official && v.key) ||
    videos.find((v) => v.site === "YouTube" && v.type === "Trailer" && v.key) ||
    videos.find((v) => v.site === "YouTube" && v.key);

  const cast = Array.isArray(d.credits?.cast)
    ? d.credits.cast.slice(0, 12).map((c) => c.name).filter(Boolean)
    : [];

  const providers = extractProviders(d["watch/providers"]?.results);

  return {
    id: `${mediaType}-${raw.id}`,
    tmdbId: raw.id,
    media_type: mediaType,
    rowKey,
    slug: `${slugify(title)}-${raw.id}`,
    title,
    releaseDate,
    year,
    runtime: runtimeText,
    rating: Number(d.vote_average || raw.vote_average || 0),
    voteCount: Number(d.vote_count || raw.vote_count || 0),
    popularity: Number(d.popularity || raw.popularity || 50),
    poster_path: d.poster_path || raw.poster_path || "",
    backdrop_path: d.backdrop_path || raw.backdrop_path || "",
    genres: genreKeys,
    genreLabels: genreNames,
    overview: (
      d.overview ||
      raw.overview ||
      `Explore release details, cast, trailer, and streaming platforms for ${title} (${year}) on CineVault.`
    ).trim(),
    cast,
    providers,
    trailerKey: trailer ? trailer.key : ""
  };
}

function sharedStyles() {
  return `
    :root {
      --bg: #050608;
      --bg-elevated: #0b0e14;
      --surface: #121620;
      --surface-2: #1a202e;
      --surface-3: #242c3f;
      --text: #f6f8fc;
      --muted: #9aa6be;
      --accent: #e50914;
      --accent-2: #ff1f2d;
      --gold: #f5c518;
      --border: rgba(255, 255, 255, 0.08);
      --border-strong: rgba(255, 255, 255, 0.2);
      --radius: 10px;
      --shadow: 0 20px 44px rgba(0, 0, 0, 0.75);
      --ease: cubic-bezier(0.22, 1, 0.36, 1);
      --max: 1400px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    html, body {
      background: radial-gradient(ellipse at top center, rgba(229, 9, 20, 0.14) 0%, rgba(13, 18, 30, 0.4) 35%, var(--bg) 75%);
      background-color: var(--bg);
      color: var(--text);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
    }
    a { color: inherit; text-decoration: none; }
    button, input, select { font-family: inherit; color: inherit; }
    button { cursor: pointer; border: none; background: none; }

    header {
      position: sticky; top: 0; z-index: 50;
      backdrop-filter: blur(16px);
      background: rgba(5, 6, 8, 0.94);
      border-bottom: 1px solid var(--border);
    }
    .nav-wrap {
      max-width: var(--max); margin: 0 auto; padding: 10px 16px;
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
    }
    .nav-left { display: flex; align-items: center; gap: 14px; min-width: 0; flex: 1; }
    .brand {
      display: inline-flex; align-items: center; gap: 7px; flex-shrink: 0;
      font-weight: 900; font-size: 1.18rem; letter-spacing: 0.04em; text-transform: uppercase;
    }
    .brand-mark { color: var(--accent); font-size: 1.28rem; line-height: 1; }
    .nav-links {
      display: flex; align-items: center; gap: 4px;
      overflow-x: auto; white-space: nowrap; scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
    }
    .nav-links::-webkit-scrollbar { display: none; }
    .nav-link {
      padding: 5px 10px; border-radius: 6px; font-size: 0.82rem; font-weight: 600; color: #cbd5e6; flex-shrink: 0;
    }
    .nav-link:hover, .nav-link.active { color: #fff; background: rgba(255, 255, 255, 0.11); }
    .pill-btn {
      padding: 6px 11px; border-radius: 6px; flex-shrink: 0;
      background: rgba(255, 255, 255, 0.09); border: 1px solid var(--border);
      font-size: 0.8rem; font-weight: 700; white-space: nowrap;
      display: inline-flex; align-items: center; gap: 5px;
    }
    .pill-btn:hover { background: rgba(255, 255, 255, 0.16); border-color: var(--border-strong); }
    .pill-btn.active { background: var(--accent); border-color: var(--accent); color: #fff; }
    .count-tag { background: rgba(255, 255, 255, 0.22); padding: 1px 6px; border-radius: 999px; font-size: 0.7rem; }

    main { max-width: var(--max); margin: 0 auto; padding: 14px 16px 52px; }

    .spotlight-strip {
      display: grid; grid-auto-flow: column; grid-auto-columns: 100%; gap: 14px;
      overflow-x: auto; scroll-snap-type: x mandatory; scroll-behavior: smooth;
      scrollbar-width: none; margin-bottom: 14px;
    }
    .spotlight-strip::-webkit-scrollbar { display: none; }
    .spot-slide {
      scroll-snap-align: center; position: relative;
      background-color: var(--bg-elevated); background-size: cover; background-position: center 20%;
      border: 1px solid var(--border-strong); border-radius: 14px; padding: 22px 20px;
      box-shadow: var(--shadow); display: grid; grid-template-columns: 1fr 165px; gap: 20px;
      align-items: center; overflow: hidden;
    }
    .spot-slide::before {
      content: ""; position: absolute; inset: 0;
      background:
        linear-gradient(95deg, rgba(5, 6, 8, 0.96) 0%, rgba(8, 11, 20, 0.84) 58%, rgba(5, 6, 8, 0.62) 100%),
        linear-gradient(180deg, rgba(5, 6, 8, 0.2) 0%, rgba(5, 6, 8, 0.94) 100%);
      z-index: 0;
    }
    .spot-body, .spot-poster-link { position: relative; z-index: 1; }
    .spot-badge-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-bottom: 8px; }
    .spot-rank-big {
      background: var(--accent); color: #fff; font-size: 0.74rem; font-weight: 900;
      padding: 3px 8px; border-radius: 5px; letter-spacing: 0.04em;
    }
    .spot-soon-pill {
      background: rgba(245, 197, 24, 0.16); color: var(--gold);
      border: 1px solid rgba(245, 197, 24, 0.45); font-size: 0.74rem; font-weight: 800;
      padding: 3px 8px; border-radius: 5px;
    }
    .spot-slide h1, .spot-slide h2 { font-size: clamp(1.38rem, 3.2vw, 2.15rem); font-weight: 900; line-height: 1.15; }
    .spot-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; font-size: 0.77rem; color: var(--muted); }
    .spot-tags span { background: rgba(255, 255, 255, 0.08); border: 1px solid var(--border); padding: 3px 8px; border-radius: 5px; }
    .spot-gold { color: var(--gold) !important; font-weight: 700; }
    .spot-desc {
      color: #d8e0ef; font-size: 0.89rem; margin: 9px 0 14px; max-width: 640px;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .spot-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .primary-btn {
      padding: 10px 15px; border-radius: 7px; background: #fff; color: #050608;
      font-weight: 800; font-size: 0.84rem; white-space: nowrap;
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    }
    .primary-btn:hover { background: #e6ebf5; }
    .secondary-btn {
      padding: 10px 14px; border-radius: 7px; background: rgba(255, 255, 255, 0.15);
      border: 1px solid var(--border-strong); color: #fff; font-weight: 700; font-size: 0.83rem;
      white-space: nowrap; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    }
    .secondary-btn:hover { background: rgba(255, 255, 255, 0.24); }
    .spot-poster-link {
      display: block; width: 100%; aspect-ratio: 2 / 3; border-radius: 10px; overflow: hidden;
      border: 1px solid var(--border-strong); background: var(--surface-2);
    }
    .spot-poster-link img { width: 100%; height: 100%; object-fit: cover; display: block; }

    .control-bar {
      background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
      padding: 10px 12px; margin-bottom: 18px; display: flex; flex-direction: column; gap: 10px;
    }
    .search-row { display: grid; grid-template-columns: 1fr auto auto; gap: 7px; align-items: center; }
    .search-input-wrap { position: relative; display: flex; align-items: center; min-width: 0; }
    .search-input {
      width: 100%; padding: 9px 32px 9px 12px; border-radius: 7px;
      background: var(--bg-elevated); border: 1px solid var(--border-strong); font-size: 0.88rem; outline: none;
    }
    .search-input:focus { border-color: var(--accent); }
    .clear-btn {
      position: absolute; right: 6px; width: 24px; height: 24px; border-radius: 5px;
      color: var(--muted); display: grid; place-items: center; font-size: 0.82rem;
    }
    .filter-toggle-btn {
      padding: 9px 11px; border-radius: 7px; background: var(--surface-2);
      border: 1px solid var(--border); font-size: 0.81rem; font-weight: 700; white-space: nowrap;
    }
    .filter-drawer { display: flex; flex-direction: column; gap: 9px; padding-top: 8px; border-top: 1px solid var(--border); }
    .filter-drawer.collapsed { display: none; }
    .filter-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
    .chip-group { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip {
      padding: 5px 10px; border-radius: 999px; background: var(--bg-elevated);
      border: 1px solid var(--border); font-size: 0.77rem; font-weight: 600; color: var(--muted);
    }
    .chip:hover { color: #fff; border-color: var(--border-strong); }
    .chip.active { background: #fff; color: #050608; border-color: #fff; }
    .sort-select {
      padding: 6px 10px; border-radius: 7px; background: var(--bg-elevated);
      border: 1px solid var(--border); font-size: 0.79rem; font-weight: 600; outline: none;
    }

    .search-hero-banner {
      background: linear-gradient(120deg, rgba(229, 9, 20, 0.2), rgba(18, 22, 32, 0.96));
      border: 1px solid var(--border-strong); border-radius: 14px; padding: 18px;
      margin-bottom: 16px; display: none; gap: 16px; align-items: center;
      grid-template-columns: 110px 1fr;
    }
    .search-hero-banner.active { display: grid; }
    .search-hero-poster {
      width: 110px; aspect-ratio: 2 / 3; border-radius: 8px;
      overflow: hidden; background: var(--surface-2); border: 1px solid var(--border);
    }
    .search-hero-poster img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .search-hero-kicker {
      font-size: 0.72rem; font-weight: 800; text-transform: uppercase;
      color: var(--gold); letter-spacing: 0.04em; margin-bottom: 4px;
    }
    .search-hero-title { font-size: clamp(1.2rem, 2.8vw, 1.8rem); font-weight: 900; line-height: 1.15; }
    .search-hero-meta { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; font-size: 0.76rem; color: var(--muted); }
    .search-hero-meta span { background: rgba(255, 255, 255, 0.08); padding: 3px 8px; border-radius: 5px; }
    .search-hero-desc { color: #dce3f2; font-size: 0.86rem; margin-bottom: 12px; }
    .structured-table-wrap {
      display: none; background: var(--surface); border: 1px solid var(--border);
      border-radius: 12px; padding: 14px; margin-bottom: 18px; overflow-x: auto;
    }
    .structured-table-wrap.active { display: block; }
    .structured-table-title { font-size: 0.98rem; font-weight: 800; margin-bottom: 10px; }
    .cv-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
    .cv-table th, .cv-table td {
      text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); white-space: nowrap;
    }
    .cv-table th { color: var(--muted); font-weight: 700; }
    .cv-table a { color: #fff; font-weight: 700; text-decoration: underline; }

    .netflix-rows { display: flex; flex-direction: column; gap: 22px; margin-bottom: 24px; }
    .row-block { display: flex; flex-direction: column; gap: 9px; }
    .row-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .row-title-wrap { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .row-title { font-size: 1.06rem; font-weight: 800; }
    .row-count {
      font-size: 0.7rem; color: var(--muted); font-weight: 700;
      background: var(--surface); border: 1px solid var(--border); padding: 1px 7px; border-radius: 999px;
    }
    .row-controls { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
    .row-arrow-btn, .row-expand-btn {
      padding: 4px 10px; border-radius: 6px; background: var(--surface);
      border: 1px solid var(--border); font-size: 0.75rem; font-weight: 700; color: var(--text);
    }
    .row-scroller {
      display: grid; grid-auto-flow: column; grid-auto-columns: minmax(144px, 166px);
      gap: 10px; overflow-x: auto; padding: 3px 2px 7px;
      scrollbar-width: thin; scrollbar-color: var(--surface-3) transparent;
      scroll-snap-type: x proximity; scroll-behavior: smooth;
    }
    .row-scroller.expanded {
      grid-auto-flow: row; grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); overflow-x: visible;
    }
    .row-scroller > .card { scroll-snap-align: start; }

    .related-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
      gap: 10px;
    }

    .section-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12px; gap: 12px; }
    .section-title { font-size: 1.12rem; font-weight: 800; }
    .result-meta { font-size: 0.8rem; color: var(--muted); }

    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(154px, 1fr)); gap: 12px; }
    .card {
      position: relative; background: var(--surface); border: 1px solid var(--border);
      border-radius: 8px; overflow: hidden; display: flex; flex-direction: column;
      transition: transform 0.2s var(--ease), border-color 0.2s var(--ease);
    }
    .card:hover { transform: scale(1.03); border-color: rgba(255, 255, 255, 0.36); z-index: 3; }
    .card-link-main { display: flex; flex-direction: column; flex: 1; }
    .poster-box { position: relative; aspect-ratio: 2 / 3; background: var(--surface-2); overflow: hidden; }
    .poster-box img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .soon-badge {
      position: absolute; bottom: 7px; left: 7px; right: 7px; background: var(--accent); color: #fff;
      padding: 3px 7px; border-radius: 4px; font-size: 0.67rem; font-weight: 800;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .rank-badge-large {
      position: absolute; bottom: 7px; left: 7px; background: rgba(5, 6, 8, 0.9);
      border: 1px solid var(--accent); color: #fff; padding: 2px 8px; border-radius: 4px;
      font-size: 0.76rem; font-weight: 900;
    }
    .rating-pill {
      position: absolute; top: 7px; left: 7px; background: rgba(5, 6, 8, 0.86);
      padding: 2px 6px; border-radius: 4px; font-size: 0.69rem; font-weight: 800; color: var(--gold);
    }
    .save-btn {
      position: absolute; top: 7px; right: 7px; z-index: 2; width: 27px; height: 27px;
      border-radius: 50%; background: rgba(5, 6, 8, 0.85); border: 1px solid rgba(255, 255, 255, 0.2);
      display: grid; place-items: center; font-size: 0.84rem;
    }
    .save-btn:hover, .save-btn.saved { background: var(--accent); border-color: var(--accent); color: #fff; }
    .card-body { padding: 8px 9px 9px; display: flex; flex-direction: column; gap: 3px; flex: 1; }
    .card-title { font-size: 0.82rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .card-sub { font-size: 0.7rem; color: var(--muted); display: flex; align-items: center; justify-content: space-between; gap: 6px; }
    .type-badge {
      text-transform: uppercase; font-size: 0.6rem; font-weight: 800;
      padding: 1px 5px; border-radius: 3px; background: rgba(255, 255, 255, 0.08); color: #d4dcee;
    }

    .crumbs { display: flex; flex-wrap: wrap; gap: 6px; font-size: 0.78rem; color: var(--muted); margin-bottom: 12px; }
    .crumbs a:hover { color: #fff; text-decoration: underline; }
    .detail-hero {
      display: grid; grid-template-columns: 210px 1fr; gap: 22px; align-items: start;
      background: var(--surface); border: 1px solid var(--border-strong); border-radius: 14px; padding: 20px;
      margin-bottom: 18px;
    }
    .detail-poster-wrap {
      width: 100%; max-width: 210px; aspect-ratio: 2 / 3;
      border-radius: 10px; overflow: hidden; background: var(--surface-2);
      border: 1px solid var(--border-strong); box-shadow: 0 12px 28px rgba(0, 0, 0, 0.7);
      flex-shrink: 0;
    }
    .detail-poster { width: 100%; height: 100%; object-fit: cover; display: block; }
    .detail-h1 { font-size: clamp(1.38rem, 3.2vw, 2.15rem); font-weight: 900; line-height: 1.15; margin-bottom: 9px; }
    .detail-pills { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; font-size: 0.78rem; }
    .dpill { background: var(--surface-2); border: 1px solid var(--border); padding: 4px 9px; border-radius: 6px; font-weight: 600; }
    .dpill.gold { color: var(--gold); font-weight: 800; }
    .dpill.soon { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 800; }
    .detail-overview { color: #dce3f2; font-size: 0.92rem; margin-bottom: 14px; }
    .detail-panel {
      background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
      padding: 16px 18px; margin-bottom: 18px;
    }
    .detail-panel h2 { font-size: 1.05rem; font-weight: 800; margin-bottom: 11px; }
    .provider-grid { display: flex; flex-wrap: wrap; gap: 8px; }
    .provider-btn {
      padding: 9px 13px; border-radius: 8px; background: var(--surface-2);
      border: 1px solid var(--border-strong); font-size: 0.83rem; font-weight: 700;
      display: inline-flex; align-items: center; gap: 6px;
    }
    .provider-btn:hover { background: var(--accent); border-color: var(--accent); color: #fff; }
    .provider-mode { font-size: 0.71rem; opacity: 0.82; font-weight: 600; }
    .trailer-frame { position: relative; aspect-ratio: 16 / 9; border-radius: 10px; overflow: hidden; background: #000; border: 1px solid var(--border); }
    .trailer-frame iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
    .cast-chips { display: flex; flex-wrap: wrap; gap: 7px; }
    .cast-chip { background: var(--surface-2); border: 1px solid var(--border); padding: 5px 10px; border-radius: 999px; font-size: 0.79rem; }

    footer {
      max-width: var(--max); margin: 0 auto; padding: 18px 16px;
      border-top: 1px solid var(--border); color: var(--muted); font-size: 0.79rem;
      display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px;
    }

    @media (max-width: 720px) {
      .spot-slide { grid-template-columns: 1fr; padding: 18px 16px; }
      .spot-poster-link { display: none; }
      .spot-actions { display: flex; flex-wrap: wrap; gap: 8px; }
      .detail-hero { grid-template-columns: 112px 1fr; gap: 14px; padding: 14px; }
      .detail-poster-wrap { max-width: 112px; }
      .row-arrow-btn { display: none; }
      .search-hero-banner { grid-template-columns: 84px 1fr; padding: 14px; gap: 12px; }
      .search-hero-poster { width: 84px; }
      .related-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 480px) {
      .search-row { grid-template-columns: 1fr auto; }
      .search-row .primary-btn { grid-column: 1 / -1; width: 100%; }
      .row-scroller { grid-auto-columns: minmax(130px, 144px); }
    }
  `;
}

function renderCardHtml(item, prefix = "", rankNum = 0) {
  const folder = item.media_type === "tv" ? "tv" : "movie";
  const href = `${prefix}${folder}/${item.slug}.html`;
  const soon = isComingSoon(item.releaseDate);
  const poster = item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : "";
  const badge = soon
    ? `<span class="soon-badge">Coming Soon • ${esc(formatDate(item.releaseDate))}</span>`
    : rankNum > 0
    ? `<span class="rank-badge-large">#${rankNum}</span>`
    : "";

  return `
    <article class="card">
      <a class="card-link-main" href="${esc(href)}">
        <div class="poster-box">
          <img src="${esc(poster)}" alt="${esc(item.title)} (${item.year})" loading="lazy" />
          ${!soon && item.rating > 0 ? `<span class="rating-pill">★ ${item.rating.toFixed(1)}</span>` : ""}
          ${badge}
        </div>
        <div class="card-body">
          <h3 class="card-title">${esc(item.title)}</h3>
          <div class="card-sub">
            <span>${soon ? esc(formatDate(item.releaseDate)) : esc(String(item.year))}</span>
            <span class="type-badge">${item.media_type === "tv" ? "Series" : "Movie"}</span>
          </div>
        </div>
      </a>
      <button class="save-btn" data-save-id="${esc(item.id)}" type="button" title="Save to My List">+</button>
    </article>`;
}

function buildDetailHtml(item, relatedList) {
  const isTv = item.media_type === "tv";
  const folder = isTv ? "tv" : "movie";
  const hubLabel = isTv ? "TV Series" : "Movies";
  const pageUrl = `${SITE_URL}/${folder}/${item.slug}.html`;
  const soon = isComingSoon(item.releaseDate);
  const prettyDate = formatDate(item.releaseDate);
  const posterUrl = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : `${SITE_URL}/favicon.svg`;
  const backdropUrl = item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : posterUrl;

  const topPlatforms = item.providers.slice(0, 2).map((p) => p.name).join(", ");
  const titleTag = soon
    ? `${item.title} (${item.year}) Release Date, Trailer & Cast | CineVault`
    : `${item.title} (${item.year}) — Where to Watch, Trailer & Cast | CineVault`;

  const metaDesc = soon
    ? `${item.title} (${item.year}) arrives ${prettyDate}. Watch the official trailer, check the cast, storyline, and streaming updates on CineVault.`
    : topPlatforms
    ? `Watch ${item.title} (${item.year}) on ${topPlatforms}. Check streaming options, official trailer, rating, and cast on CineVault.`
    : `Find out where to stream, rent, or buy ${item.title} (${item.year}). Watch the official trailer, view cast, and storyline on CineVault.`;

  const providersHtml = item.providers.length
    ? `<div class="provider-grid">${item.providers
        .map((p) => {
          const url = getProviderUrl(p.name, item.title);
          return `<a class="provider-btn" href="${esc(url)}" target="_blank" rel="noopener noreferrer sponsored">${esc(p.name)} <span class="provider-mode">(${esc(p.mode)})</span> ↗</a>`;
        })
        .join("")}</div>`
    : `<p style="color:var(--muted);font-size:0.87rem;">${
        soon
          ? `Releases ${esc(prettyDate)}. Streaming platform links will appear here once available.`
          : "No active streaming or rental platform listed right now."
      }</p>`;

  const trailerHtml = item.trailerKey
    ? `<div class="detail-panel" id="trailerSection">
        <h2>Official Trailer</h2>
        <div class="trailer-frame">
          <iframe src="https://www.youtube-nocookie.com/embed/${esc(item.trailerKey)}" title="${esc(item.title)} Trailer" allowfullscreen loading="lazy"></iframe>
        </div>
      </div>`
    : "";

  const castHtml = item.cast.length
    ? `<div class="detail-panel">
        <h2>Cast</h2>
        <div class="cast-chips">${item.cast.map((c) => `<span class="cast-chip">${esc(c)}</span>`).join("")}</div>
      </div>`
    : "";

  const relatedHtml = relatedList.slice(0, 10).map((rel) => renderCardHtml(rel, "../", 0)).join("");

  const detailSchema = {
    "@context": "https://schema.org",
    "@type": isTv ? "TVSeries" : "Movie",
    name: item.title,
    description: item.overview,
    image: backdropUrl,
    url: pageUrl,
    datePublished: item.releaseDate || undefined,
    genre: item.genreLabels,
    isPartOf: {
      "@type": "WebSite",
      name: "CineVault",
      url: `${SITE_URL}/`
    }
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(titleTag)}</title>
  <meta name="description" content="${esc(metaDesc)}" />
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
  <link rel="canonical" href="${esc(pageUrl)}" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="/favicon.svg" />
  <meta property="og:site_name" content="CineVault" />
  <meta property="og:title" content="${esc(titleTag)}" />
  <meta property="og:description" content="${esc(metaDesc)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${esc(pageUrl)}" />
  <meta property="og:image" content="${esc(backdropUrl)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(titleTag)}" />
  <meta name="twitter:image" content="${esc(backdropUrl)}" />
  <style>${sharedStyles()}</style>
  <script type="application/ld+json">${JSON.stringify(detailSchema)}</script>
</head>
<body>
  <header>
    <div class="nav-wrap">
      <div class="nav-left">
        <a class="brand" href="../index.html"><span class="brand-mark">▶</span><span>CineVault</span></a>
        <nav class="nav-links">
          <a class="nav-link" href="../index.html">Home</a>
          <a class="nav-link" href="../index.html#row-coming-soon">Coming Soon</a>
          <a class="nav-link" href="../index.html#row-series">TV Shows</a>
          <a class="nav-link" href="../index.html#row-anime">Anime</a>
          <a class="nav-link" href="../guides.html">Guides</a>
        </nav>
      </div>
      <a class="pill-btn" href="../index.html">← Browse</a>
    </div>
  </header>

  <main>
    <nav class="crumbs" aria-label="Breadcrumb">
      <a href="../index.html">Home</a>
      <span>/</span>
      <a href="../index.html#row-${isTv ? "series" : "trending"}">${esc(hubLabel)}</a>
      <span>/</span>
      <span>${esc(item.title)}</span>
    </nav>

    <section class="detail-hero" style="${backdropUrl ? `background-image:linear-gradient(120deg,rgba(18,22,32,0.96),rgba(18,22,32,0.92)),url('${esc(backdropUrl)}');background-size:cover;background-position:center;` : ""}">
      <div class="detail-poster-wrap">
        <img class="detail-poster" src="${esc(posterUrl)}" alt="${esc(item.title)} (${item.year}) poster" fetchpriority="high" />
      </div>
      <div>
        <h1 class="detail-h1">${esc(item.title)}</h1>
        <div class="detail-pills">
          ${soon ? `<span class="dpill soon">Coming Soon • ${esc(prettyDate)}</span>` : `<span class="dpill">${esc(prettyDate)}</span>`}
          ${!soon && item.rating > 0 ? `<span class="dpill gold">★ ${item.rating.toFixed(1)}</span>` : ""}
          <span class="dpill">${esc(item.runtime)}</span>
          <span class="dpill">${esc(item.genreLabels.slice(0, 3).join(" • "))}</span>
        </div>
        <p class="detail-overview">${esc(item.overview)}</p>
        <div class="spot-actions">
          <a class="primary-btn" href="#watchSection">▶ Where to Watch</a>
          <button class="secondary-btn" id="detailListBtn" type="button">+ My List</button>
        </div>
      </div>
    </section>

    <section class="detail-panel" id="watchSection">
      <h2>Where to Watch</h2>
      ${providersHtml}
    </section>

    ${trailerHtml}
    ${castHtml}

    <section class="detail-panel">
      <h2>Related Titles</h2>
      <div class="related-grid">${relatedHtml}</div>
    </section>
  </main>

  <footer>
    <span>CineVault</span>
    <span><a href="../index.html">Home</a> · <a href="../guides.html">Guides</a> · <a href="../sitemap.xml">Sitemap</a></span>
  </footer>

  <script>
    (function () {
      const KEY = "cinevault_watchlist_v2";
      const itemData = {
        id: ${JSON.stringify(item.id)},
        tmdbId: ${JSON.stringify(item.tmdbId)},
        media_type: ${JSON.stringify(item.media_type)},
        slug: ${JSON.stringify(item.slug)},
        title: ${JSON.stringify(item.title)},
        releaseDate: ${JSON.stringify(item.releaseDate)},
        year: ${JSON.stringify(item.year)},
        rating: ${JSON.stringify(item.rating)},
        popularity: ${JSON.stringify(item.popularity)},
        poster_path: ${JSON.stringify(item.poster_path)},
        genres: ${JSON.stringify(item.genres)},
        genreLabels: ${JSON.stringify(item.genreLabels)},
        overview: ${JSON.stringify(item.overview)}
      };
      function readList() {
        try { const r = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(r) ? r : []; } catch { return []; }
      }
      function writeList(arr) {
        try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch {}
      }
      const btn = document.getElementById("detailListBtn");
      function syncBtn() {
        if (!btn) return;
        btn.textContent = readList().some((x) => x.id === itemData.id) ? "✓ In My List" : "+ My List";
      }
      if (btn) {
        btn.addEventListener("click", () => {
          const cur = readList();
          const exists = cur.some((x) => x.id === itemData.id);
          writeList(exists ? cur.filter((x) => x.id !== itemData.id) : [itemData, ...cur]);
          syncBtn();
        });
        syncBtn();
      }
    })();
  </script>
</body>
</html>`;
}

function buildHomeHtml(rowsMap, allItems) {
  const rowDefs = [
    { key: "trending", id: "row-trending", title: "Top 10 Trending Today", ranked: true },
    { key: "comingSoon", id: "row-coming-soon", title: "Coming Soon", ranked: false },
    { key: "action", id: "row-action", title: "Blockbuster Action & Thrillers", ranked: false },
    { key: "series", id: "row-series", title: "Binge-Worthy TV Shows", ranked: false },
    { key: "scifi", id: "row-scifi", title: "Mind-Bending Sci-Fi & Fantasy", ranked: false },
    { key: "anime", id: "row-anime", title: "Anime Hits", ranked: false },
    { key: "crime", id: "row-crime", title: "Crime, Mystery & Suspense", ranked: false },
    { key: "comedy", id: "row-comedy", title: "Laugh-Out-Loud Comedies", ranked: false },
    { key: "drama", id: "row-drama", title: "Critically Acclaimed Dramas", ranked: false },
    { key: "horror", id: "row-horror", title: "Late-Night Horror", ranked: false },
    { key: "family", id: "row-family", title: "Family & Animated Adventures", ranked: false },
    { key: "romance", id: "row-romance", title: "Romantic Favorites", ranked: false }
  ];

  const featured = (rowsMap.trending || allItems).slice(0, 6);
  const heroLead = featured[0] || {};
  const heroThumbUrl = heroLead.backdrop_path
    ? `https://image.tmdb.org/t/p/w1280${heroLead.backdrop_path}`
    : heroLead.poster_path
    ? `https://image.tmdb.org/t/p/w500${heroLead.poster_path}`
    : `${SITE_URL}/favicon.svg`;

  const homeSchema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: "CineVault",
        alternateName: ["CineVault Space", "Cine Vault"],
        url: `${SITE_URL}/`,
        potentialAction: {
          "@type": "SearchAction",
          target: `${SITE_URL}/?q={search_term_string}`,
          "query-input": "required name=search_term_string"
        }
      },
      {
        "@type": "WebPage",
        "@id": `${SITE_URL}/#webpage`,
        url: `${SITE_URL}/`,
        name: "CineVault — Where to Watch Movies, Series & Coming Soon",
        isPartOf: { "@id": `${SITE_URL}/#website` },
        primaryImageOfPage: {
          "@type": "ImageObject",
          url: heroThumbUrl
        }
      }
    ]
  };

  const spotlightHtml = featured
    .map((item, idx) => {
      const folder = item.media_type === "tv" ? "tv" : "movie";
      const href = `${folder}/${item.slug}.html`;
      const soon = isComingSoon(item.releaseDate);
      const poster = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "";
      const backdrop = item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : poster;
      const heading = idx === 0 ? "h1" : "h2";

      return `
        <article class="spot-slide" style="background-image:url('${esc(backdrop)}')">
          <div class="spot-body">
            <div class="spot-badge-row">
              <span class="spot-rank-big">#${idx + 1} IN CINEVAULT TODAY</span>
              ${soon ? `<span class="spot-soon-pill">Coming Soon • ${esc(formatDate(item.releaseDate))}</span>` : ""}
            </div>
            <${heading}><a href="${esc(href)}">${esc(item.title)}</a></${heading}>
            <div class="spot-tags">
              ${!soon && item.rating > 0 ? `<span class="spot-gold">★ ${item.rating.toFixed(1)}</span>` : ""}
              <span>${soon ? `Release: ${esc(formatDate(item.releaseDate))}` : esc(String(item.year))}</span>
              <span>${item.media_type === "tv" ? "Series" : "Movie"}</span>
              <span>${esc(item.genreLabels.slice(0, 2).join(" • "))}</span>
            </div>
            <p class="spot-desc">${esc(item.overview)}</p>
            <div class="spot-actions">
              <a class="primary-btn" href="${esc(href)}">▶ Trailer &amp; Details</a>
              <button class="secondary-btn" data-spot-save="${esc(item.id)}" type="button">+ My List</button>
            </div>
          </div>
          <a class="spot-poster-link" href="${esc(href)}" title="${esc(item.title)}">
            <img src="${esc(poster)}" alt="${esc(item.title)} poster" loading="eager" />
          </a>
        </article>`;
    })
    .join("");

  const rowsHtml = rowDefs
    .map((def) => {
      const list = rowsMap[def.key] || [];
      if (!list.length) return "";
      const trackId = `track-${def.key}`;
      return `
        <div class="row-block" id="${esc(def.id)}">
          <div class="row-header">
            <div class="row-title-wrap">
              <h2 class="row-title">${esc(def.title)}</h2>
              <span class="row-count">${list.length}</span>
            </div>
            <div class="row-controls">
              <button class="row-arrow-btn" data-scroll="${trackId}" data-dir="-1" type="button">‹</button>
              <button class="row-arrow-btn" data-scroll="${trackId}" data-dir="1" type="button">›</button>
              <button class="row-expand-btn" data-expand="${trackId}" type="button">Show All</button>
            </div>
          </div>
          <div class="row-scroller" id="${trackId}">
            ${list.map((it, i) => renderCardHtml(it, "", def.ranked && i < 10 ? i + 1 : 0)).join("")}
          </div>
        </div>`;
    })
    .join("");

  const catalogJson = JSON.stringify(
    allItems.map((x) => ({
      id: x.id,
      media_type: x.media_type,
      slug: x.slug,
      title: x.title,
      releaseDate: x.releaseDate,
      year: x.year,
      rating: x.rating,
      popularity: x.popularity,
      poster_path: x.poster_path,
      genres: x.genres,
      genreLabels: x.genreLabels,
      overview: x.overview
    }))
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CineVault — Where to Watch Movies, Series &amp; Coming Soon</title>
  <meta name="description" content="Browse trending movies, TV shows, anime, and upcoming releases. Check official trailers, release dates, cast, and streaming platforms on CineVault." />
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
  <link rel="canonical" href="${SITE_URL}/" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="/favicon.svg" />
  <meta property="og:site_name" content="CineVault" />
  <meta property="og:title" content="CineVault — Where to Watch Movies, Series &amp; Coming Soon" />
  <meta property="og:description" content="Browse trending movies, TV shows, anime, and upcoming releases. Check official trailers, release dates, cast, and streaming platforms on CineVault." />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${SITE_URL}/" />
  <meta property="og:image" content="${esc(heroThumbUrl)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="CineVault — Where to Watch Movies, Series &amp; Coming Soon" />
  <meta name="twitter:image" content="${esc(heroThumbUrl)}" />
  <style>${sharedStyles()}</style>
  <script type="application/ld+json">${JSON.stringify(homeSchema)}</script>
</head>
<body>
  <header>
    <div class="nav-wrap">
      <div class="nav-left">
        <a class="brand" href="#top" id="homeLink"><span class="brand-mark">▶</span><span>CineVault</span></a>
        <nav class="nav-links" aria-label="Categories">
          <a class="nav-link active" href="#top" id="navHome">Home</a>
          <a class="nav-link" href="#row-trending">Trending</a>
          <a class="nav-link" href="#row-coming-soon">Coming Soon</a>
          <a class="nav-link" href="#row-series">TV Shows</a>
          <a class="nav-link" href="#row-anime">Anime</a>
          <a class="nav-link" href="guides.html">Guides</a>
        </nav>
      </div>
      <button class="pill-btn" id="myListBtn" type="button">My List <span class="count-tag" id="listCount">0</span></button>
    </div>
  </header>

  <main id="top">
    <section class="spotlight-strip" id="spotlightStrip">${spotlightHtml}</section>

    <section class="control-bar" aria-label="Search and Filters">
      <form class="search-row" id="searchForm" role="search">
        <div class="search-input-wrap">
          <input class="search-input" id="searchInput" type="search" placeholder="Search movies, series, anime..." autocomplete="off" />
          <button class="clear-btn" id="clearBtn" type="button" title="Clear">✕</button>
        </div>
        <button class="filter-toggle-btn" id="filterToggle" type="button">Filters ▾</button>
        <button class="primary-btn" type="submit" style="padding:9px 15px;">Search</button>
      </form>
      <div class="filter-drawer collapsed" id="filterDrawer">
        <div class="filter-row">
          <div class="chip-group" id="typeChips">
            <button class="chip active" data-type="all" type="button">All</button>
            <button class="chip" data-type="movie" type="button">Movies</button>
            <button class="chip" data-type="tv" type="button">Series</button>
          </div>
          <select class="sort-select" id="sortSelect">
            <option value="popular">Sort: Popular</option>
            <option value="rating">Sort: Top Rated</option>
            <option value="year">Sort: Newest</option>
            <option value="title">Sort: A–Z</option>
          </select>
        </div>
        <div class="chip-group" id="genreChips">
          <button class="chip active" data-genre="all" type="button">All Genres</button>
          <button class="chip" data-genre="action" type="button">Action</button>
          <button class="chip" data-genre="scifi" type="button">Sci-Fi &amp; Fantasy</button>
          <button class="chip" data-genre="crime" type="button">Crime &amp; Mystery</button>
          <button class="chip" data-genre="thriller" type="button">Thriller</button>
          <button class="chip" data-genre="drama" type="button">Drama</button>
          <button class="chip" data-genre="comedy" type="button">Comedy</button>
          <button class="chip" data-genre="anime" type="button">Anime</button>
          <button class="chip" data-genre="horror" type="button">Horror</button>
          <button class="chip" data-genre="family" type="button">Family</button>
          <button class="chip" data-genre="romance" type="button">Romance</button>
        </div>
      </div>
    </section>

    <section class="search-hero-banner" id="searchHeroBanner" aria-live="polite"></section>
    <section class="structured-table-wrap" id="structuredTableWrap" aria-label="Structured Search Results"></section>

    <div class="section-head" id="resultHead" style="display:none;">
      <h2 class="section-title" id="resultTitle">Results</h2>
      <span class="result-meta" id="resultMeta"></span>
    </div>
    <section class="grid" id="resultGrid" style="display:none;"></section>

    <section class="netflix-rows" id="rowsContainer">${rowsHtml}</section>
  </main>

  <footer>
    <span>CineVault • Last synced ${TODAY_ISO}</span>
    <span><a href="guides.html">Guides</a> · <a href="sitemap.xml">Sitemap</a> · <a href="robots.txt">Robots</a></span>
  </footer>

  <script>
    (function () {
      const CATALOG = ${catalogJson};
      const TODAY = ${JSON.stringify(TODAY_ISO)};
      const KEY = "cinevault_watchlist_v2";
      const byId = new Map(CATALOG.map((x) => [x.id, x]));
      const state = { mode: "explore", q: "", type: "all", genre: "all", sort: "popular" };

      const spotlightStrip = document.getElementById("spotlightStrip");
      const searchHeroBanner = document.getElementById("searchHeroBanner");
      const structuredTableWrap = document.getElementById("structuredTableWrap");
      const rowsContainer = document.getElementById("rowsContainer");
      const resultHead = document.getElementById("resultHead");
      const resultGrid = document.getElementById("resultGrid");
      const resultTitle = document.getElementById("resultTitle");
      const resultMeta = document.getElementById("resultMeta");
      const listCountEl = document.getElementById("listCount");

      function getList() {
        try { const r = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(r) ? r : []; } catch { return []; }
      }
      function setList(arr) {
        try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch {}
      }
      function updateCount() { listCountEl.textContent = String(getList().length); }

      function toggleItem(item) {
        if (!item) return;
        const cur = getList();
        const exists = cur.some((x) => x.id === item.id);
        setList(exists ? cur.filter((x) => x.id !== item.id) : [item, ...cur]);
        updateCount();
        syncButtons();
        if (state.mode === "list") renderFiltered();
      }

      function syncButtons() {
        const savedIds = new Set(getList().map((x) => x.id));
        document.querySelectorAll("[data-save-id]").forEach((btn) => {
          const on = savedIds.has(btn.getAttribute("data-save-id"));
          btn.textContent = on ? "✓" : "+";
          btn.classList.toggle("saved", on);
        });
      }

      function cardHtml(item) {
        const folder = item.media_type === "tv" ? "tv" : "movie";
        const href = folder + "/" + item.slug + ".html";
        const soon = item.releaseDate && item.releaseDate > TODAY;
        const poster = item.poster_path ? "https://image.tmdb.org/t/p/w342" + item.poster_path : "";
        return (
          '<article class="card"><a class="card-link-main" href="' + href + '"><div class="poster-box">' +
          '<img src="' + poster + '" alt="' + item.title.replace(/"/g, "&quot;") + '" loading="lazy" />' +
          (!soon && item.rating > 0 ? '<span class="rating-pill">★ ' + Number(item.rating).toFixed(1) + '</span>' : '') +
          (soon ? '<span class="soon-badge">Coming Soon • ' + item.releaseDate + '</span>' : '') +
          '</div><div class="card-body"><h3 class="card-title">' + item.title + '</h3>' +
          '<div class="card-sub"><span>' + (soon ? item.releaseDate : (item.year || "—")) + '</span><span class="type-badge">' + (item.media_type === "tv" ? "Series" : "Movie") + '</span></div></div></a>' +
          '<button class="save-btn" data-save-id="' + item.id + '" type="button" title="Save">+</button></article>'
        );
      }

      function renderSearchHero(matches, rawTerm) {
        if (!rawTerm || !matches.length) {
          searchHeroBanner.classList.remove("active");
          searchHeroBanner.innerHTML = "";
          spotlightStrip.style.display = "";
          return;
        }
        const top = matches[0];
        const folder = top.media_type === "tv" ? "tv" : "movie";
        const href = folder + "/" + top.slug + ".html";
        const poster = top.poster_path ? "https://image.tmdb.org/t/p/w342" + top.poster_path : "";
        const soon = top.releaseDate && top.releaseDate > TODAY;
        spotlightStrip.style.display = "none";
        searchHeroBanner.classList.add("active");
        searchHeroBanner.innerHTML =
          '<a class="search-hero-poster" href="' + href + '"><img src="' + poster + '" alt="' + top.title.replace(/"/g, "&quot;") + '" /></a>' +
          '<div>' +
          '<div class="search-hero-kicker">Top Match for "' + rawTerm + '" • ' + matches.length + ' Found</div>' +
          '<h1 class="search-hero-title"><a href="' + href + '">' + top.title + '</a></h1>' +
          '<div class="search-hero-meta">' +
          '<span>' + (soon ? "Coming Soon: " + top.releaseDate : (top.year || "—")) + '</span>' +
          '<span>' + (top.media_type === "tv" ? "TV Series" : "Movie") + '</span>' +
          (top.rating > 0 ? '<span>★ ' + Number(top.rating).toFixed(1) + '</span>' : '') +
          '<span>' + (top.genreLabels || []).slice(0, 3).join(", ") + '</span>' +
          '</div>' +
          '<p class="search-hero-desc">' + (top.overview || "") + '</p>' +
          '<div class="spot-actions"><a class="primary-btn" href="' + href + '">▶ Open Full Details &amp; Where to Watch</a>' +
          '<button class="secondary-btn" data-save-id="' + top.id + '" type="button">+ My List</button></div>' +
          '</div>';
      }

      function renderStructuredTable(matches, rawTerm) {
        if (!rawTerm || !matches.length) {
          structuredTableWrap.classList.remove("active");
          structuredTableWrap.innerHTML = "";
          return;
        }
        const rows = matches.slice(0, 12).map((item, idx) => {
          const folder = item.media_type === "tv" ? "tv" : "movie";
          const href = folder + "/" + item.slug + ".html";
          const status = item.releaseDate && item.releaseDate > TODAY ? "Coming Soon (" + item.releaseDate + ")" : (item.year || "—");
          return (
            '<tr>' +
            '<td>#' + (idx + 1) + '</td>' +
            '<td><a href="' + href + '">' + item.title + '</a></td>' +
            '<td>' + (item.media_type === "tv" ? "Series" : "Movie") + '</td>' +
            '<td>' + status + '</td>' +
            '<td>' + (item.rating > 0 ? "★ " + Number(item.rating).toFixed(1) : "—") + '</td>' +
            '<td>' + (item.genreLabels || []).slice(0, 2).join(", ") + '</td>' +
            '</tr>'
          );
        }).join("");

        structuredTableWrap.classList.add("active");
        structuredTableWrap.innerHTML =
          '<h2 class="structured-table-title">Structured Match Index for "' + rawTerm + '"</h2>' +
          '<table class="cv-table"><thead><tr><th>Rank</th><th>Title</th><th>Type</th><th>Year / Release</th><th>Rating</th><th>Genres</th></tr></thead><tbody>' +
          rows + '</tbody></table>';
      }

      function activeFilter() {
        return state.mode === "list" || Boolean(state.q.trim()) || state.type !== "all" || state.genre !== "all" || state.sort !== "popular";
      }

      function renderFiltered() {
        if (!activeFilter()) {
          spotlightStrip.style.display = "";
          searchHeroBanner.classList.remove("active");
          searchHeroBanner.innerHTML = "";
          structuredTableWrap.classList.remove("active");
          structuredTableWrap.innerHTML = "";
          rowsContainer.style.display = "flex";
          resultHead.style.display = "none";
          resultGrid.style.display = "none";
          return;
        }

        rowsContainer.style.display = "none";
        resultHead.style.display = "flex";
        resultGrid.style.display = "grid";

        const base = state.mode === "list" ? getList() : CATALOG.slice();
        const rawTerm = state.q.trim();
        const term = rawTerm.toLowerCase();

        const filtered = base.filter((x) => {
          if (state.type !== "all" && x.media_type !== state.type) return false;
          if (state.genre !== "all" && !(x.genres || []).includes(state.genre)) return false;
          if (term) {
            const hay = (x.title + " " + (x.overview || "") + " " + (x.genreLabels || []).join(" ") + " " + (x.year || "")).toLowerCase();
            if (!hay.includes(term)) return false;
          }
          return true;
        });

        filtered.sort((a, b) => {
          if (state.sort === "rating") return (b.rating || 0) - (a.rating || 0);
          if (state.sort === "year") return (b.year || 0) - (a.year || 0);
          if (state.sort === "title") return String(a.title || "").localeCompare(String(b.title || ""));
          return (b.popularity || 0) - (a.popularity || 0);
        });

        renderSearchHero(filtered, rawTerm);
        renderStructuredTable(filtered, rawTerm);

        resultTitle.textContent = state.mode === "list" ? "My List" : (rawTerm ? 'All Matches for "' + rawTerm + '"' : "Filtered Titles");
        resultMeta.textContent = filtered.length + " titles";
        resultGrid.innerHTML = filtered.length ? filtered.map(cardHtml).join("") : '<div style="grid-column:1/-1;padding:24px;text-align:center;">No titles found</div>';
        bindSaveClicks();
        syncButtons();
      }

      function bindSaveClicks() {
        document.querySelectorAll("[data-save-id]").forEach((btn) => {
          btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); toggleItem(byId.get(btn.getAttribute("data-save-id"))); };
        });
      }

      document.querySelectorAll("[data-scroll]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const track = document.getElementById(btn.getAttribute("data-scroll"));
          if (track) track.scrollBy({ left: Number(btn.getAttribute("data-dir") || 1) * 420, behavior: "smooth" });
        });
      });

      document.querySelectorAll("[data-expand]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const track = document.getElementById(btn.getAttribute("data-expand"));
          if (!track) return;
          const open = track.classList.toggle("expanded");
          btn.textContent = open ? "Collapse" : "Show All";
        });
      });

      document.querySelectorAll("[data-spot-save]").forEach((btn) => {
        btn.addEventListener("click", () => toggleItem(byId.get(btn.getAttribute("data-spot-save"))));
      });

      const searchInput = document.getElementById("searchInput");
      document.getElementById("searchForm").addEventListener("submit", (e) => { e.preventDefault(); state.q = searchInput.value; renderFiltered(); });
      searchInput.addEventListener("input", () => { state.q = searchInput.value; renderFiltered(); });
      document.getElementById("clearBtn").addEventListener("click", () => { searchInput.value = ""; state.q = ""; renderFiltered(); });

      const drawer = document.getElementById("filterDrawer");
      document.getElementById("filterToggle").addEventListener("click", () => drawer.classList.toggle("collapsed"));

      document.querySelectorAll("#typeChips .chip").forEach((ch) => {
        ch.addEventListener("click", () => {
          document.querySelectorAll("#typeChips .chip").forEach((x) => x.classList.remove("active"));
          ch.classList.add("active"); state.type = ch.getAttribute("data-type") || "all"; renderFiltered();
        });
      });

      document.querySelectorAll("#genreChips .chip").forEach((ch) => {
        ch.addEventListener("click", () => {
          document.querySelectorAll("#genreChips .chip").forEach((x) => x.classList.remove("active"));
          ch.classList.add("active"); state.genre = ch.getAttribute("data-genre") || "all"; renderFiltered();
        });
      });

      document.getElementById("sortSelect").addEventListener("change", (e) => { state.sort = e.target.value; renderFiltered(); });

      const myListBtn = document.getElementById("myListBtn");
      const navHome = document.getElementById("navHome");
      myListBtn.addEventListener("click", () => {
        state.mode = state.mode === "list" ? "explore" : "list";
        myListBtn.classList.toggle("active", state.mode === "list");
        navHome.classList.toggle("active", state.mode !== "list");
        renderFiltered();
      });

      document.getElementById("homeLink").addEventListener("click", () => {
        state.mode = "explore"; state.q = ""; state.type = "all"; state.genre = "all"; state.sort = "popular";
        searchInput.value = ""; myListBtn.classList.remove("active"); navHome.classList.add("active"); renderFiltered();
      });

      bindSaveClicks(); updateCount(); syncButtons();
    })();
  </script>
</body>
</html>`;
}

async function main() {
  await fs.mkdir("movie", { recursive: true });
  await fs.mkdir("tv", { recursive: true });

  const p1 = PAGE_OFFSET + 1;
  const p2 = PAGE_OFFSET + 2;

  const sources = [
    { key: "trending", type: "movie", list: await fetchPages("/trending/movie/week", [p1, p2]) },
    { key: "trendingTv", type: "tv", list: await fetchPages("/trending/tv/week", [p1]) },
    { key: "comingSoon", type: "movie", list: await fetchPages("/movie/upcoming", [1, 2], { region: "US" }) },
    { key: "action", type: "movie", list: await fetchPages("/discover/movie", [p1], { with_genres: "28,53", sort_by: "popularity.desc" }) },
    { key: "series", type: "tv", list: await fetchPages("/tv/popular", [p1, p2]) },
    { key: "scifi", type: "movie", list: await fetchPages("/discover/movie", [p1], { with_genres: "878,14", sort_by: "popularity.desc" }) },
    { key: "anime", type: "tv", list: await fetchPages("/discover/tv", [p1, p2], { with_genres: "16", with_original_language: "ja", sort_by: "popularity.desc" }) },
    { key: "crime", type: "movie", list: await fetchPages("/discover/movie", [p1], { with_genres: "80,9648", sort_by: "popularity.desc" }) },
    { key: "comedy", type: "movie", list: await fetchPages("/discover/movie", [p1], { with_genres: "35", sort_by: "popularity.desc" }) },
    { key: "drama", type: "movie", list: await fetchPages("/discover/movie", [p1], { with_genres: "18", "vote_count.gte": 150, sort_by: "vote_average.desc" }) },
    { key: "horror", type: "movie", list: await fetchPages("/discover/movie", [p1], { with_genres: "27", sort_by: "popularity.desc" }) },
    { key: "family", type: "movie", list: await fetchPages("/discover/movie", [p1], { with_genres: "16,10751", sort_by: "popularity.desc" }) },
    { key: "romance", type: "movie", list: await fetchPages("/discover/movie", [p1], { with_genres: "10749", sort_by: "popularity.desc" }) }
  ];

  const candidates = [];
  const seenCandidates = new Set();
  for (const src of sources) {
    for (const raw of src.list) {
      if (!raw || !raw.id || !raw.poster_path) continue;
      const uid = `${src.type}-${raw.id}`;
      if (!seenCandidates.has(uid)) {
        seenCandidates.add(uid);
        candidates.push({ mediaType: src.type, raw, rowKey: src.key });
      }
    }
  }

  const batch = candidates.slice(0, BATCH_LIMIT);
  const hydrated = (await runPool(batch, 5, (c) => hydrateTitle(c.mediaType, c.raw, c.rowKey))).filter(Boolean);

  const hydratedById = new Map(hydrated.map((x) => [x.id, x]));
  const rowsMap = {};

  for (const src of sources) {
    const items = [];
    for (const raw of src.list) {
      const hit = hydratedById.get(`${src.type}-${raw.id}`);
      if (hit) items.push(hit);
    }
    const targetKey = src.key === "trendingTv" ? "series" : src.key;
    rowsMap[targetKey] = Array.from(new Map([...(rowsMap[targetKey] || []), ...items].map((x) => [x.id, x])).values());
  }

  const trendingCombined = [];
  const trendSeen = new Set();
  for (const item of [...(rowsMap.trending || []), ...(rowsMap.series || []).slice(0, 8)]) {
    if (!trendSeen.has(item.id)) {
      trendSeen.add(item.id);
      trendingCombined.push(item);
    }
  }
  rowsMap.trending = trendingCombined;

  const allCurrent = Array.from(new Map(hydrated.map((x) => [x.id, x])).values());
  for (const item of allCurrent) {
    const folder = item.media_type === "tv" ? "tv" : "movie";
    const pool = allCurrent.filter((x) => x.id !== item.id);
    const sameGenre = pool.filter((x) => x.genres.some((g) => item.genres.includes(g)));
    const related = sameGenre.length >= 6 ? sameGenre : [...sameGenre, ...pool];
    await fs.writeFile(path.join(folder, `${item.slug}.html`), buildDetailHtml(item, related), "utf8");
  }

  const movieFiles = (await fs.readdir("movie")).filter((f) => f.endsWith(".html"));
  const tvFiles = (await fs.readdir("tv")).filter((f) => f.endsWith(".html"));

  const sitemapUrls = [
    `${SITE_URL}/`,
    `${SITE_URL}/guides.html`,
    ...movieFiles.map((f) => `${SITE_URL}/movie/${f}`),
    ...tvFiles.map((f) => `${SITE_URL}/tv/${f}`)
  ];

  const sitemapXml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...sitemapUrls.map(
      (loc) =>
        `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${TODAY_ISO}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>${loc === `${SITE_URL}/` ? "1.0" : "0.8"}</priority>\n  </url>`
    ),
    "</urlset>",
    ""
  ].join("\n");

  const robotsTxt = `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;

  await fs.writeFile("index.html", buildHomeHtml(rowsMap, allCurrent), "utf8");
  await fs.writeFile("sitemap.xml", sitemapXml, "utf8");
  await fs.writeFile("robots.txt", robotsTxt, "utf8");

  console.log(`Synced ${allCurrent.length} batch titles | Total pages: ${movieFiles.length + tvFiles.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
