const fs = require("fs");
const path = require("path");

const API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";
const SITE_URL = "https://cinevault.space";
const MOVIE_DIR = path.join(__dirname, "movie");
const TV_DIR = path.join(__dirname, "tv");

if (!API_KEY) {
  console.error("Missing TMDB_API_KEY environment variable.");
  process.exit(1);
}

function slugify(text) {
  return (
    String(text || "item")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "item"
  );
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function fetchJSON(endpoint) {
  const sep = endpoint.includes("?") ? "&" : "?";
  const url = `${TMDB_BASE}${endpoint}${sep}api_key=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} on ${TMDB_BASE}${endpoint}`);
  }
  return res.json();
}

function getProvidersForRegion(results, regionCode) {
  const region = results && results[regionCode];
  if (!region) return [];
  const combined = [
    ...(region.flatrate || []),
    ...(region.free || []),
    ...(region.ads || []),
    ...(region.rent || []),
  ];
  const seen = new Set();
  const names = [];
  for (const p of combined) {
    if (p && p.provider_name && !seen.has(p.provider_name)) {
      seen.add(p.provider_name);
      names.push(p.provider_name);
    }
  }
  return names.slice(0, 6);
}

function buildAdBannerHtml() {
  const adCode = `<script>atOptions={'key':'b570c351ca5a05131ca8916fc6b23f71','format':'iframe','height':50,'width':320,'params':{}};<\/script><script src="https://bancadeltempoidea.org/22/b570c351ca5a05131ca8916fc6b23f71"><\/script>`;
  const srcdoc = escapeHtml(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent;overflow:hidden;display:flex;justify-content:center;}</style></head><body>${adCode}</body></html>`
  );
  return `
  <div class="ad-strip" aria-label="Sponsored">
    <span class="ad-label">Sponsored</span>
    <iframe width="320" height="50" scrolling="no" frameborder="0" loading="lazy" style="border:0;max-width:100%;display:block;" srcdoc="${srcdoc}"></iframe>
  </div>`;
}

function getSharedStyles(backdropUrl) {
  return `
    :root {
      --bg: #090b10; --surface: #111520; --surface-2: #181e2e;
      --text: #f3f6fc; --muted: #9aa5be; --accent: #e50914;
      --gold: #f5b942; --border: rgba(255,255,255,0.09); --max: 980px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: radial-gradient(circle at top right, #181c2e 0%, var(--bg) 55%);
      color: var(--text);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.65;
    }
    a { color: inherit; text-decoration: none; }
    header {
      position: sticky; top: 0; z-index: 40;
      backdrop-filter: blur(14px); background: rgba(9,11,16,0.92);
      border-bottom: 1px solid var(--border);
    }
    .nav {
      max-width: var(--max); margin: 0 auto; padding: 14px 20px;
      display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;
    }
    .brand { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 1.15rem; }
    .badge {
      width: 30px; height: 30px; border-radius: 8px;
      background: linear-gradient(135deg, var(--accent), #99040c);
      display: grid; place-items: center; font-size: 0.85rem;
    }
    .nav-links { display: flex; gap: 8px; flex-wrap: wrap; }
    .nav-btn {
      padding: 7px 13px; border-radius: 999px; background: var(--surface-2);
      border: 1px solid var(--border); font-size: 0.82rem; font-weight: 600;
    }
    .nav-btn:hover { border-color: rgba(255,255,255,0.25); }
    main { max-width: var(--max); margin: 0 auto; padding: 24px 20px 60px; }
    .hero-grid {
      position: relative; overflow: hidden;
      display: grid; grid-template-columns: 220px 1fr; gap: 22px;
      background: ${
        backdropUrl
          ? `linear-gradient(135deg, rgba(9,11,16,0.94) 35%, rgba(17,21,32,0.84) 100%), url('${backdropUrl}') center/cover no-repeat`
          : "var(--surface)"
      };
      border: 1px solid var(--border);
      border-radius: 18px; padding: 24px; margin-bottom: 20px;
    }
    @media (max-width: 680px) {
      .hero-grid { grid-template-columns: 1fr; padding: 18px; }
      .poster { max-width: 200px; margin: 0 auto; }
    }
    .poster { width: 100%; border-radius: 12px; display: block; border: 1px solid var(--border); box-shadow: 0 12px 30px rgba(0,0,0,0.5); }
    .type-tag {
      display: inline-block; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.08em;
      text-transform: uppercase; color: #fff; background: var(--accent);
      padding: 3px 10px; border-radius: 6px; margin-bottom: 8px;
    }
    h1 { font-size: clamp(1.45rem, 3vw, 2.05rem); line-height: 1.22; margin-bottom: 10px; }
    .meta { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; font-size: 0.82rem; color: var(--gold); font-weight: 600; }
    .meta span { background: rgba(24,30,46,0.9); padding: 4px 10px; border-radius: 8px; border: 1px solid var(--border); }
    .overview { color: #e2e8f5; font-size: 0.95rem; margin-bottom: 16px; }
    .cta {
      display: inline-block; padding: 10px 18px; border-radius: 10px;
      background: var(--accent); color: #fff; font-weight: 700; font-size: 0.88rem;
    }
    .card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 16px; padding: 20px; margin-bottom: 18px;
    }
    .card h2 { font-size: 1.15rem; margin-bottom: 12px; }
    .region-row { margin-bottom: 12px; }
    .region-title { font-size: 0.85rem; font-weight: 700; color: var(--gold); margin-bottom: 6px; }
    .pills { display: flex; flex-wrap: wrap; gap: 8px; }
    .pill {
      background: var(--surface-2); border: 1px solid var(--border);
      padding: 5px 12px; border-radius: 999px; font-size: 0.84rem; font-weight: 600;
    }
    .seasons-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px;
    }
    .season-box {
      background: var(--surface-2); border: 1px solid var(--border);
      border-radius: 12px; padding: 10px 12px;
    }
    .season-box strong { display: block; font-size: 0.9rem; margin-bottom: 2px; }
    .season-box span { font-size: 0.78rem; color: var(--muted); }
    .related-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px;
    }
    .rel-card {
      background: var(--surface-2); border: 1px solid var(--border);
      border-radius: 12px; overflow: hidden; display: block; transition: transform 0.18s ease;
    }
    .rel-card:hover { transform: translateY(-3px); border-color: rgba(255,255,255,0.25); }
    .rel-card img { width: 100%; aspect-ratio: 2/3; object-fit: cover; display: block; }
    .rel-title { padding: 8px 10px; font-size: 0.82rem; font-weight: 700; line-height: 1.3; }
    .muted { color: var(--muted); font-size: 0.86rem; }
    .video-wrap { position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 12px; }
    .video-wrap iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; }
    .ad-strip {
      margin: 18px 0; padding: 12px 16px; background: rgba(17,21,32,0.92);
      border: 1px solid var(--border); border-radius: 14px;
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px;
    }
    .ad-label {
      font-size: 0.68rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--muted); background: var(--surface-2); border: 1px solid var(--border);
      padding: 3px 9px; border-radius: 999px;
    }
    footer {
      max-width: var(--max); margin: 0 auto; padding: 20px; border-top: 1px solid var(--border);
      color: var(--muted); font-size: 0.82rem; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px;
    }
  `;
}

function renderRelatedSection(items, headingText) {
  const valid = (items || []).filter((x) => x && x.poster_path && x.slugFile).slice(0, 6);
  if (!valid.length) return "";
  const cards = valid
    .map(
      (item) => `
      <a class="rel-card" href="${item.slugFile}">
        <img src="https://image.tmdb.org/t/p/w342${item.poster_path}" alt="${escapeHtml(item.title)}" loading="lazy" />
        <div class="rel-title">${escapeHtml(item.title)} (${escapeHtml(item.year)})</div>
      </a>`
    )
    .join("");
  return `
    <section class="card">
      <h2>${escapeHtml(headingText)}</h2>
      <div class="related-grid">${cards}</div>
    </section>`;
}

function renderMoviePage(movie, credits, videos, providers, slugFile, relatedMovies) {
  const title = movie.title || "Untitled Movie";
  const year = (movie.release_date || "").slice(0, 4) || "2026";
  const rating = movie.vote_average ? movie.vote_average.toFixed(1) : "N/A";
  const runtime = movie.runtime ? `${movie.runtime} min` : "Feature Film";
  const genres = (movie.genres || []).map((g) => g.name).join(", ") || "Movie";
  const overview =
    movie.overview ||
    `Discover where to watch ${title} (${year}), check cast details, and watch the official trailer on CineVault.`;
  const posterUrl = movie.poster_path
    ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
    : "";
  const backdropUrl = movie.backdrop_path
    ? `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}`
    : "";

  const trailer = (videos.results || []).find(
    (v) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser")
  );

  const castList = (credits.cast || [])
    .slice(0, 8)
    .map((c) => c.name)
    .filter(Boolean);

  const usProviders = getProvidersForRegion(providers.results, "US");
  const ukProviders = getProvidersForRegion(providers.results, "GB");
  const caProviders = getProvidersForRegion(providers.results, "CA");

  const canonical = `${SITE_URL}/movie/${slugFile}`;
  const pageTitle = `Where to Watch ${title} (${year}) — Streaming, Trailer & Cast | CineVault`;
  const metaDesc =
    `Find where to stream ${title} (${year}) online in the US, UK, and Canada. Watch the trailer, check cast & ratings on CineVault.`.slice(
      0,
      160
    );

  const schema = {
    "@context": "https://schema.org",
    "@type": "Movie",
    name: title,
    datePublished: movie.release_date || year,
    description: overview,
    image: posterUrl || undefined,
    genre: (movie.genres || []).map((g) => g.name),
    actor: castList.map((name) => ({ "@type": "Person", name })),
    aggregateRating: movie.vote_count
      ? {
          "@type": "AggregateRating",
          ratingValue: rating,
          bestRating: "10",
          ratingCount: movie.vote_count,
        }
      : undefined,
    url: canonical,
  };

  const renderPills = (list) =>
    list.length
      ? list.map((p) => `<span class="pill">${escapeHtml(p)}</span>`).join("")
      : `<span class="muted">Check local digital &amp; VOD listings</span>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(metaDesc)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${canonical}" />
  <meta property="og:title" content="${escapeHtml(pageTitle)}" />
  <meta property="og:description" content="${escapeHtml(metaDesc)}" />
  <meta property="og:type" content="video.movie" />
  <meta property="og:url" content="${canonical}" />
  ${posterUrl ? `<meta property="og:image" content="${posterUrl}" />` : ""}
  <style>${getSharedStyles(backdropUrl)}</style>
  <script type="application/ld+json">${JSON.stringify(schema)}</script>
</head>
<body>
  <header>
    <div class="nav">
      <a class="brand" href="../index.html"><span class="badge">▶</span><span>CineVault</span></a>
      <div class="nav-links">
        <a class="nav-btn" href="../index.html">Home</a>
        <a class="nav-btn" href="index.html">Movies</a>
        <a class="nav-btn" href="../tv/index.html">TV Series</a>
        <a class="nav-btn" href="../guides.html">Guides</a>
      </div>
    </div>
  </header>

  <main>
    <section class="hero-grid">
      ${posterUrl ? `<img class="poster" src="${posterUrl}" alt="${escapeHtml(title)} poster" loading="lazy" />` : ""}
      <div>
        <span class="type-tag">Movie</span>
        <h1>Where to Watch ${escapeHtml(title)} (${escapeHtml(year)})</h1>
        <div class="meta">
          <span>★ ${escapeHtml(rating)}</span>
          <span>${escapeHtml(year)}</span>
          <span>${escapeHtml(runtime)}</span>
          <span>${escapeHtml(genres)}</span>
        </div>
        <p class="overview">${escapeHtml(overview)}</p>
        <a class="cta" href="../index.html?q=${encodeURIComponent(title)}">Open in CineVault Interactive App →</a>
      </div>
    </section>

    ${buildAdBannerHtml()}

    <section class="card">
      <h2>Streaming Availability by Region</h2>
      <div class="region-row">
        <div class="region-title">United States (US)</div>
        <div class="pills">${renderPills(usProviders)}</div>
      </div>
      <div class="region-row">
        <div class="region-title">United Kingdom (UK)</div>
        <div class="pills">${renderPills(ukProviders)}</div>
      </div>
      <div class="region-row">
        <div class="region-title">Canada (CA)</div>
        <div class="pills">${renderPills(caProviders)}</div>
      </div>
    </section>

    ${
      trailer
        ? `<section class="card">
      <h2>Official Trailer</h2>
      <div class="video-wrap">
        <iframe src="https://www.youtube.com/embed/${escapeHtml(trailer.key)}" title="${escapeHtml(title)} Trailer" allowfullscreen loading="lazy"></iframe>
      </div>
    </section>`
        : ""
    }

    ${
      castList.length
        ? `<section class="card">
      <h2>Top Cast</h2>
      <div class="pills">${castList.map((c) => `<span class="pill">${escapeHtml(c)}</span>`).join("")}</div>
    </section>`
        : ""
    }

    ${buildAdBannerHtml()}

    ${renderRelatedSection(relatedMovies, "More Trending Movies to Stream")}
  </main>

  <footer>
    <span>CineVault Streaming Discovery</span>
    <span><a href="../index.html">Home</a> · <a href="index.html">Movies</a> · <a href="../tv/index.html">TV Series</a> · <a href="../guides.html">Guides</a></span>
  </footer>
</body>
</html>`;
}

function renderTvPage(show, credits, videos, providers, slugFile, relatedShows) {
  const title = show.name || "Untitled Series";
  const year = (show.first_air_date || "").slice(0, 4) || "2026";
  const rating = show.vote_average ? show.vote_average.toFixed(1) : "N/A";
  const seasonsCount = show.number_of_seasons
    ? `${show.number_of_seasons} Season${show.number_of_seasons > 1 ? "s" : ""}`
    : "TV Series";
  const episodesCount = show.number_of_episodes
    ? `${show.number_of_episodes} Episodes`
    : "";
  const genres = (show.genres || []).map((g) => g.name).join(", ") || "Series";
  const overview =
    show.overview ||
    `Find where to stream ${title} (${year}) all seasons online, watch the official trailer, and explore cast & episode details on CineVault.`;
  const posterUrl = show.poster_path
    ? `https://image.tmdb.org/t/p/w500${show.poster_path}`
    : "";
  const backdropUrl = show.backdrop_path
    ? `https://image.tmdb.org/t/p/w1280${show.backdrop_path}`
    : "";

  const trailer = (videos.results || []).find(
    (v) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser")
  );

  const castList = (credits.cast || [])
    .slice(0, 8)
    .map((c) => c.name)
    .filter(Boolean);

  const validSeasons = (show.seasons || [])
    .filter((s) => s && s.season_number > 0)
    .slice(0, 12);

  const usProviders = getProvidersForRegion(providers.results, "US");
  const ukProviders = getProvidersForRegion(providers.results, "GB");
  const caProviders = getProvidersForRegion(providers.results, "CA");

  const canonical = `${SITE_URL}/tv/${slugFile}`;
  const pageTitle = `Where to Watch ${title} (${year}) — All Seasons, Streaming & Trailer | CineVault`;
  const metaDesc =
    `Stream ${title} (${year}) online in the US, UK, and Canada. Check ${seasonsCount}, watch the official trailer, and view cast on CineVault.`.slice(
      0,
      160
    );

  const schema = {
    "@context": "https://schema.org",
    "@type": "TVSeries",
    name: title,
    startDate: show.first_air_date || year,
    numberOfSeasons: show.number_of_seasons || undefined,
    numberOfEpisodes: show.number_of_episodes || undefined,
    description: overview,
    image: posterUrl || undefined,
    genre: (show.genres || []).map((g) => g.name),
    actor: castList.map((name) => ({ "@type": "Person", name })),
    aggregateRating: show.vote_count
      ? {
          "@type": "AggregateRating",
          ratingValue: rating,
          bestRating: "10",
          ratingCount: show.vote_count,
        }
      : undefined,
    url: canonical,
  };

  const renderPills = (list) =>
    list.length
      ? list.map((p) => `<span class="pill">${escapeHtml(p)}</span>`).join("")
      : `<span class="muted">Check local streaming &amp; network listings</span>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(metaDesc)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${canonical}" />
  <meta property="og:title" content="${escapeHtml(pageTitle)}" />
  <meta property="og:description" content="${escapeHtml(metaDesc)}" />
  <meta property="og:type" content="video.tv_show" />
  <meta property="og:url" content="${canonical}" />
  ${posterUrl ? `<meta property="og:image" content="${posterUrl}" />` : ""}
  <style>${getSharedStyles(backdropUrl)}</style>
  <script type="application/ld+json">${JSON.stringify(schema)}</script>
</head>
<body>
  <header>
    <div class="nav">
      <a class="brand" href="../index.html"><span class="badge">▶</span><span>CineVault</span></a>
      <div class="nav-links">
        <a class="nav-btn" href="../index.html">Home</a>
        <a class="nav-btn" href="../movie/index.html">Movies</a>
        <a class="nav-btn" href="index.html">TV Series</a>
        <a class="nav-btn" href="../guides.html">Guides</a>
      </div>
    </div>
  </header>

  <main>
    <section class="hero-grid">
      ${posterUrl ? `<img class="poster" src="${posterUrl}" alt="${escapeHtml(title)} poster" loading="lazy" />` : ""}
      <div>
        <span class="type-tag">TV Series</span>
        <h1>Where to Watch ${escapeHtml(title)} (${escapeHtml(year)})</h1>
        <div class="meta">
          <span>★ ${escapeHtml(rating)}</span>
          <span>${escapeHtml(year)}</span>
          <span>${escapeHtml(seasonsCount)}</span>
          ${episodesCount ? `<span>${escapeHtml(episodesCount)}</span>` : ""}
          <span>${escapeHtml(genres)}</span>
        </div>
        <p class="overview">${escapeHtml(overview)}</p>
        <a class="cta" href="../index.html?q=${encodeURIComponent(title)}">Open in CineVault Interactive App →</a>
      </div>
    </section>

    ${buildAdBannerHtml()}

    <section class="card">
      <h2>Streaming Availability by Region</h2>
      <div class="region-row">
        <div class="region-title">United States (US)</div>
        <div class="pills">${renderPills(usProviders)}</div>
      </div>
      <div class="region-row">
        <div class="region-title">United Kingdom (UK)</div>
        <div class="pills">${renderPills(ukProviders)}</div>
      </div>
      <div class="region-row">
        <div class="region-title">Canada (CA)</div>
        <div class="pills">${renderPills(caProviders)}</div>
      </div>
    </section>

    ${
      validSeasons.length
        ? `<section class="card">
      <h2>Seasons &amp; Episodes Guide</h2>
      <div class="seasons-grid">
        ${validSeasons
          .map(
            (s) => `<div class="season-box">
          <strong>${escapeHtml(s.name || `Season ${s.season_number}`)}</strong>
          <span>${s.episode_count || 0} Episodes${s.air_date ? ` · ${escapeHtml(s.air_date.slice(0, 4))}` : ""}</span>
        </div>`
          )
          .join("")}
      </div>
    </section>`
        : ""
    }

    ${
      trailer
        ? `<section class="card">
      <h2>Official Series Trailer</h2>
      <div class="video-wrap">
        <iframe src="https://www.youtube.com/embed/${escapeHtml(trailer.key)}" title="${escapeHtml(title)} Trailer" allowfullscreen loading="lazy"></iframe>
      </div>
    </section>`
        : ""
    }

    ${
      castList.length
        ? `<section class="card">
      <h2>Series Cast</h2>
      <div class="pills">${castList.map((c) => `<span class="pill">${escapeHtml(c)}</span>`).join("")}</div>
    </section>`
        : ""
    }

    ${buildAdBannerHtml()}

    ${renderRelatedSection(relatedShows, "More Trending TV Series to Binge")}
  </main>

  <footer>
    <span>CineVault Streaming Discovery</span>
    <span><a href="../index.html">Home</a> · <a href="../movie/index.html">Movies</a> · <a href="index.html">TV Series</a> · <a href="../guides.html">Guides</a></span>
  </footer>
</body>
</html>`;
}

function renderDirectoryIndex({ entries, heading, subtitle, metaTitle, metaDesc, canonicalUrl, switchHref, switchLabel }) {
  const items = entries
    .map(
      (e) =>
        `<li><a href="${e.file}">${escapeHtml(e.title)} (${escapeHtml(e.year)})</a></li>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(metaTitle)}</title>
  <meta name="description" content="${escapeHtml(metaDesc)}" />
  <link rel="canonical" href="${canonicalUrl}" />
  <style>
    body { background: #090b10; color: #f3f6fc; font-family: system-ui, sans-serif; line-height: 1.7; padding: 24px 20px; max-width: 960px; margin: 0 auto; }
    a { color: #9ec5ff; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .top-bar { display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 14px; font-weight: 600; font-size: 0.9rem; }
    h1 { margin-bottom: 8px; }
    p.sub { color: #9aa5be; margin-bottom: 16px; }
    ul { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px 18px; list-style: none; margin-top: 18px; }
    li { background: #111520; border: 1px solid rgba(255,255,255,0.09); padding: 10px 14px; border-radius: 10px; }
  </style>
</head>
<body>
  <div class="top-bar">
    <a href="../index.html">← CineVault Home</a>
    <a href="${switchHref}">${escapeHtml(switchLabel)}</a>
    <a href="../guides.html">Streaming Guides</a>
  </div>
  <h1>${escapeHtml(heading)}</h1>
  <p class="sub">${escapeHtml(subtitle)}</p>
  <ul>${items}</ul>
</body>
</html>`;
}

async function run() {
  fs.mkdirSync(MOVIE_DIR, { recursive: true });
  fs.mkdirSync(TV_DIR, { recursive: true });

  const [trendingMovies, popularMovies, trendingTv, popularTv] = await Promise.all([
    fetchJSON("/trending/movie/week?page=1"),
    fetchJSON("/movie/popular?page=1"),
    fetchJSON("/trending/tv/week?page=1"),
    fetchJSON("/tv/popular?page=1"),
  ]);

  // 1. Process Movies
  const movieMap = new Map();
  for (const m of [...(trendingMovies.results || []), ...(popularMovies.results || [])]) {
    if (m && m.id && !movieMap.has(m.id)) {
      movieMap.set(m.id, m);
    }
  }
  const movies = Array.from(movieMap.values()).slice(0, 25);
  const movieRecords = [];

  for (const basic of movies) {
    try {
      const [details, credits, videos, providers] = await Promise.all([
        fetchJSON(`/movie/${basic.id}`),
        fetchJSON(`/movie/${basic.id}/credits`),
        fetchJSON(`/movie/${basic.id}/videos`),
        fetchJSON(`/movie/${basic.id}/watch/providers`),
      ]);
      const slugFile = `${slugify(details.title)}-${details.id}.html`;
      movieRecords.push({
        slugFile,
        title: details.title || basic.title,
        year: (details.release_date || "").slice(0, 4) || "2026",
        poster_path: details.poster_path || basic.poster_path,
        details,
        credits,
        videos,
        providers,
      });
    } catch (err) {
      console.warn(`Skipping movie ${basic.id}: ${err.message}`);
    }
  }

  for (let i = 0; i < movieRecords.length; i++) {
    const rec = movieRecords[i];
    const related = movieRecords.filter((_, idx) => idx !== i).slice(0, 6);
    const html = renderMoviePage(rec.details, rec.credits, rec.videos, rec.providers, rec.slugFile, related);
    fs.writeFileSync(path.join(MOVIE_DIR, rec.slugFile), html, "utf8");
  }

  // 2. Process TV Series
  const tvMap = new Map();
  for (const s of [...(trendingTv.results || []), ...(popularTv.results || [])]) {
    if (s && s.id && !tvMap.has(s.id)) {
      tvMap.set(s.id, s);
    }
  }
  const shows = Array.from(tvMap.values()).slice(0, 25);
  const tvRecords = [];

  for (const basic of shows) {
    try {
      const [details, credits, videos, providers] = await Promise.all([
        fetchJSON(`/tv/${basic.id}`),
        fetchJSON(`/tv/${basic.id}/credits`),
        fetchJSON(`/tv/${basic.id}/videos`),
        fetchJSON(`/tv/${basic.id}/watch/providers`),
      ]);
      const slugFile = `${slugify(details.name)}-${details.id}.html`;
      tvRecords.push({
        slugFile,
        title: details.name || basic.name,
        year: (details.first_air_date || "").slice(0, 4) || "2026",
        poster_path: details.poster_path || basic.poster_path,
        details,
        credits,
        videos,
        providers,
      });
    } catch (err) {
      console.warn(`Skipping TV show ${basic.id}: ${err.message}`);
    }
  }

  for (let i = 0; i < tvRecords.length; i++) {
    const rec = tvRecords[i];
    const related = tvRecords.filter((_, idx) => idx !== i).slice(0, 6);
    const html = renderTvPage(rec.details, rec.credits, rec.videos, rec.providers, rec.slugFile, related);
    fs.writeFileSync(path.join(TV_DIR, rec.slugFile), html, "utf8");
  }

  // 3. Build Directory Indexes
  const buildEntriesList = (dir, recentRecords) => {
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".html") && f !== "index.html")
      .sort();
    const entries = files.map((file) => {
      const found = recentRecords.find((g) => g.slugFile === file);
      if (found) return { file, title: found.title, year: found.year };
      const cleanTitle = file
        .replace(/-\d+\.html$/, "")
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      return { file, title: cleanTitle, year: "2026" };
    });
    return { files, entries };
  };

  const movieIndexData = buildEntriesList(MOVIE_DIR, movieRecords);
  const tvIndexData = buildEntriesList(TV_DIR, tvRecords);

  fs.writeFileSync(
    path.join(MOVIE_DIR, "index.html"),
    renderDirectoryIndex({
      entries: movieIndexData.entries,
      heading: "CineVault Movie Streaming Directory",
      subtitle: "Direct streaming availability, official trailers, and cast pages updated daily.",
      metaTitle: "Movies Directory — Where to Watch & Trailers | CineVault",
      metaDesc: "Browse individual movie streaming pages, official trailers, and where to watch online on CineVault.",
      canonicalUrl: `${SITE_URL}/movie/`,
      switchHref: "../tv/index.html",
      switchLabel: "Browse TV Series →",
    }),
    "utf8"
  );

  fs.writeFileSync(
    path.join(TV_DIR, "index.html"),
    renderDirectoryIndex({
      entries: tvIndexData.entries,
      heading: "CineVault TV Series & Web Shows Directory",
      subtitle: "Find where to binge trending series, check seasons & episodes, and watch official trailers.",
      metaTitle: "TV Series Directory — Where to Stream Shows & Seasons | CineVault",
      metaDesc: "Browse TV series streaming availability, seasons & episode counts, and official trailers on CineVault.",
      canonicalUrl: `${SITE_URL}/tv/`,
      switchHref: "../movie/index.html",
      switchLabel: "Browse Movies →",
    }),
    "utf8"
  );

  // 4. Update Sitemap
  const today = new Date().toISOString().slice(0, 10);
  const corePages = [
    { loc: `${SITE_URL}/`, priority: "1.0", freq: "daily" },
    { loc: `${SITE_URL}/guides.html`, priority: "0.9", freq: "weekly" },
    { loc: `${SITE_URL}/sci-fi-guides.html`, priority: "0.8", freq: "weekly" },
    { loc: `${SITE_URL}/crime-thrillers.html`, priority: "0.8", freq: "weekly" },
    { loc: `${SITE_URL}/movie/`, priority: "0.85", freq: "daily" },
    { loc: `${SITE_URL}/tv/`, priority: "0.85", freq: "daily" },
  ];

  const urlNodes = [
    ...corePages.map(
      (p) => `  <url>
    <loc>${p.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.freq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`
    ),
    ...movieIndexData.files.map(
      (file) => `  <url>
    <loc>${SITE_URL}/movie/${file}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`
    ),
    ...tvIndexData.files.map(
      (file) => `  <url>
    <loc>${SITE_URL}/tv/${file}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`
    ),
  ];

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlNodes.join("\n")}
</urlset>
`;

  fs.writeFileSync(path.join(__dirname, "sitemap.xml"), sitemapXml, "utf8");
  console.log(
    `Generated ${movieRecords.length} movies & ${tvRecords.length} TV series. Total indexed: ${
      movieIndexData.files.length + tvIndexData.files.length
    } pages.`
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
