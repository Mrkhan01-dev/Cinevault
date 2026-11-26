const fs = require("fs/promises");
const path = require("path");

const SITE_URL = "https://cinevault.space";
const TMDB_KEY = process.env.TMDB_API_KEY || "45bfb471ba5d77a724bbdc3f147bb1b3";
const TODAY = new Date().toISOString().split("T")[0];

const REGIONS = [
  { code: "US", name: "United States (US)" },
  { code: "GB", name: "United Kingdom (UK)" },
  { code: "CA", name: "Canada (CA)" },
  { code: "PK", name: "Pakistan (PK)" },
  { code: "IN", name: "India (IN)" },
  { code: "AU", name: "Australia (AU)" }
];

function slugify(str) {
  return (
    String(str || "title")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "title"
  );
}

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatPrettyDate(isoDate) {
  if (!isoDate) return "TBA 2026";
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  });
}

function isComingSoon(releaseDate) {
  if (!releaseDate) return false;
  return releaseDate > TODAY;
}

async function tmdb(endpoint) {
  const sep = endpoint.includes("?") ? "&" : "?";
  const res = await fetch(`https://api.themoviedb.org/3${endpoint}${sep}api_key=${TMDB_KEY}`);
  if (!res.ok) throw new Error(`TMDB HTTP ${res.status} for ${endpoint}`);
  return res.json();
}

function formatProviders(watchResults, regionCode, releaseDate) {
  const entry = watchResults?.[regionCode];
  const upcoming = isComingSoon(releaseDate);
  if (!entry) {
    return upcoming
      ? `Coming Soon (${formatPrettyDate(releaseDate)}) — theatrical release first; streaming & digital VOD follow.`
      : `Check regional digital VOD & subscription catalogs.`;
  }
  const stream = (entry.flatrate || []).map((p) => p.provider_name);
  const rentBuy = [...(entry.rent || []), ...(entry.buy || [])]
    .map((p) => p.provider_name)
    .filter((v, i, a) => a.indexOf(v) === i);

  const parts = [];
  if (stream.length) parts.push(`Stream: ${stream.slice(0, 4).join(", ")}`);
  if (rentBuy.length) parts.push(`Rent/Buy: ${rentBuy.slice(0, 3).join(", ")}`);
  if (parts.length) return parts.join(" • ");
  return upcoming
    ? `Coming Soon (${formatPrettyDate(releaseDate)}) — digital & streaming windows announced post-premiere.`
    : `Available via regional digital storefronts.`;
}

function baseCss() {
  return `
    :root {
      --bg: #080a0f;
      --surface: #111520;
      --surface-2: #171d2c;
      --surface-3: #1f273b;
      --text: #f4f7fc;
      --muted: #9aa6c0;
      --accent: #e50914;
      --accent-hover: #ff1e2d;
      --gold: #f5b942;
      --cyan: #38bdf8;
      --border: rgba(255,255,255,0.09);
      --max: 1240px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body {
      background: radial-gradient(circle at 85% -10%, #1a2138 0%, var(--bg) 52%);
      color: var(--text);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }
    a { color: inherit; text-decoration: none; }
    header {
      position: sticky; top: 0; z-index: 50;
      backdrop-filter: blur(16px);
      background: rgba(8,10,15,0.92);
      border-bottom: 1px solid var(--border);
    }
    .nav {
      max-width: var(--max); margin: 0 auto; padding: 12px 18px;
      display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
    }
    .brand { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 1.18rem; letter-spacing: -0.01em; }
    .badge-icon {
      width: 32px; height: 32px; border-radius: 9px;
      background: linear-gradient(135deg, var(--accent-hover), #99040c);
      display: grid; place-items: center; font-size: 0.85rem; color: #fff;
      box-shadow: 0 4px 14px rgba(229,9,20,0.4);
    }
    .nav-links { display: flex; gap: 8px; flex-wrap: wrap; }
    .nav-btn {
      padding: 7px 13px; border-radius: 999px;
      background: var(--surface-2); border: 1px solid var(--border);
      font-size: 0.82rem; font-weight: 600; color: var(--text);
      transition: background 0.18s ease, border-color 0.18s ease;
    }
    .nav-btn:hover, .nav-btn.active { background: var(--surface-3); border-color: rgba(255,255,255,0.26); }
    main { max-width: var(--max); margin: 0 auto; padding: 18px 18px 64px; }

    /* Hero & Search Bar on Homepage */
    .home-hero {
      background: linear-gradient(135deg, rgba(22,29,48,0.92), rgba(13,17,27,0.96));
      border: 1px solid var(--border); border-radius: 20px;
      padding: 24px 22px; margin-bottom: 22px;
    }
    .home-hero h1 { font-size: clamp(1.45rem, 3.2vw, 2.15rem); line-height: 1.2; margin-bottom: 8px; }
    .home-hero p { color: var(--muted); font-size: 0.94rem; max-width: 760px; margin-bottom: 16px; }
    .search-bar-wrap {
      display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 14px;
    }
    .search-input {
      flex: 1 1 260px; padding: 11px 16px; border-radius: 12px;
      background: var(--bg); border: 1px solid rgba(255,255,255,0.16);
      color: var(--text); font-size: 0.94rem; outline: none;
    }
    .search-input:focus { border-color: var(--accent-hover); }
    .cat-pills { display: flex; gap: 8px; flex-wrap: wrap; }
    .cat-pill {
      padding: 6px 13px; border-radius: 999px; font-size: 0.8rem; font-weight: 700;
      background: var(--surface-2); border: 1px solid var(--border); color: var(--muted);
    }
    .cat-pill:hover { color: var(--text); border-color: rgba(255,255,255,0.28); }

    /* Horizontal Category Shelves */
    .shelf {
      margin-bottom: 28px; background: rgba(17,21,32,0.65);
      border: 1px solid var(--border); border-radius: 18px; padding: 18px 16px;
    }
    .shelf-head {
      display: flex; align-items: center; justify-content: space-between;
      gap: 10px; flex-wrap: wrap; margin-bottom: 14px;
    }
    .shelf-title-wrap { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .shelf-title { font-size: 1.18rem; font-weight: 800; }
    .shelf-count {
      font-size: 0.74rem; font-weight: 700; color: var(--muted);
      background: var(--surface-2); border: 1px solid var(--border);
      padding: 2px 9px; border-radius: 999px;
    }
    .shelf-actions { display: flex; align-items: center; gap: 8px; }
    .expand-btn {
      cursor: pointer; padding: 6px 13px; border-radius: 999px;
      background: var(--surface-2); border: 1px solid var(--border);
      color: var(--gold); font-size: 0.79rem; font-weight: 700;
    }
    .expand-btn:hover { background: var(--surface-3); border-color: var(--gold); }

    /* Horizontal Track (Default) & Expanded Grid Mode */
    .card-track {
      display: flex; gap: 14px; overflow-x: auto; padding-bottom: 8px;
      scroll-snap-type: x mandatory; scrollbar-width: thin;
    }
    .card-track::-webkit-scrollbar { height: 6px; }
    .card-track::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 999px; }
    .card-track .media-card { flex: 0 0 162px; scroll-snap-align: start; }
    @media (max-width: 600px) {
      .card-track .media-card { flex: 0 0 144px; }
    }
    .card-track.expanded {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(156px, 1fr));
      overflow-x: visible;
    }
    .card-track.expanded .media-card { flex: unset; width: 100%; }

    .media-card {
      position: relative; display: flex; flex-direction: column;
      background: var(--surface-2); border: 1px solid var(--border);
      border-radius: 13px; overflow: hidden;
      transition: transform 0.18s ease, border-color 0.18s ease;
    }
    .media-card:hover { transform: translateY(-4px); border-color: rgba(255,255,255,0.32); }
    .poster-box { position: relative; width: 100%; aspect-ratio: 2/3; background: #0d111b; overflow: hidden; }
    .poster-box img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .status-pill {
      position: absolute; top: 8px; left: 8px; right: 8px;
      padding: 3px 8px; border-radius: 7px; font-size: 0.69rem; font-weight: 800;
      letter-spacing: 0.02em; text-transform: uppercase;
      background: rgba(8,10,15,0.88); border: 1px solid rgba(255,255,255,0.15);
      color: var(--gold); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .status-pill.soon {
      background: rgba(229,9,20,0.94); color: #fff; border-color: rgba(255,255,255,0.28);
    }
    .card-body { padding: 9px 10px 11px; display: flex; flex-direction: column; gap: 4px; flex: 1; }
    .card-title {
      font-size: 0.85rem; font-weight: 700; line-height: 1.3;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .card-sub { font-size: 0.74rem; color: var(--muted); }

    /* Detail & Hub Page Elements */
    .breadcrumbs {
      display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
      font-size: 0.8rem; color: var(--muted); margin-bottom: 14px;
    }
    .breadcrumbs a:hover { color: var(--text); text-decoration: underline; }
    .hero-grid {
      position: relative; overflow: hidden;
      display: grid; grid-template-columns: 230px 1fr; gap: 24px;
      border: 1px solid var(--border); border-radius: 18px; padding: 24px; margin-bottom: 20px;
    }
    @media (max-width: 680px) {
      .hero-grid { grid-template-columns: 1fr; padding: 18px; gap: 18px; }
      .detail-poster { max-width: 195px; margin: 0 auto; }
    }
    .detail-poster {
      width: 100%; height: auto; aspect-ratio: 2/3;
      border-radius: 12px; display: block; border: 1px solid var(--border);
      box-shadow: 0 12px 30px rgba(0,0,0,0.6); background: var(--surface-2);
    }
    .type-tag {
      display: inline-block; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.08em;
      text-transform: uppercase; color: #fff; background: var(--accent);
      padding: 3px 10px; border-radius: 6px; margin-bottom: 8px; margin-right: 6px;
    }
    .type-tag.soon { background: #b91c1c; border: 1px solid rgba(255,255,255,0.28); }
    .detail-h1 { font-size: clamp(1.45rem, 3vw, 2.1rem); line-height: 1.22; margin-bottom: 10px; }
    .meta {
      display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px;
      font-size: 0.82rem; color: var(--gold); font-weight: 600;
    }
    .meta span {
      background: rgba(24,30,46,0.92); padding: 4px 10px;
      border-radius: 8px; border: 1px solid var(--border);
    }
    .overview { color: #e2e8f5; font-size: 0.96rem; margin-bottom: 16px; }
    .cta {
      display: inline-block; padding: 10px 18px; border-radius: 10px;
      background: var(--accent); color: #fff; font-weight: 700; font-size: 0.88rem;
    }
    .cta:hover { background: var(--accent-hover); }
    .card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 16px; padding: 20px; margin-bottom: 18px;
    }
    .card-head {
      display: flex; align-items: center; justify-content: space-between;
      gap: 10px; flex-wrap: wrap; margin-bottom: 12px;
    }
    .card h2 { font-size: 1.15rem; }
    .card-lead { color: #d5deef; font-size: 0.91rem; margin-bottom: 14px; }
    select.region-select {
      background: var(--surface-2); color: var(--text); border: 1px solid var(--border);
      padding: 6px 12px; border-radius: 8px; font-size: 0.84rem; font-weight: 600;
    }
    .region-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
    .region-box {
      background: var(--surface-2); border: 1px solid var(--border);
      border-radius: 12px; padding: 12px 14px;
    }
    .region-box.active-region { border-color: var(--gold); }
    .region-title { font-size: 0.85rem; font-weight: 700; color: var(--gold); margin-bottom: 4px; }
    .region-note { font-size: 0.83rem; color: var(--muted); }
    .pills { display: flex; flex-wrap: wrap; gap: 8px; }
    .pill {
      background: var(--surface-2); border: 1px solid var(--border);
      padding: 6px 12px; border-radius: 999px; font-size: 0.84rem; font-weight: 600;
    }
    .faq-item { border-top: 1px solid var(--border); padding: 12px 0; }
    .faq-item:first-of-type { border-top: 0; padding-top: 2px; }
    .faq-item:last-of-type { padding-bottom: 0; }
    .faq-item summary { font-weight: 700; font-size: 0.93rem; cursor: pointer; }
    .faq-item p { margin-top: 6px; font-size: 0.88rem; color: var(--muted); }
    .pager { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 18px; }
    .pager a {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 12px; padding: 12px 14px; font-size: 0.84rem; font-weight: 700;
    }
    .pager a:hover { border-color: rgba(255,255,255,0.28); }
    .video-wrap {
      position: relative; padding-bottom: 56.25%; height: 0;
      overflow: hidden; border-radius: 12px; background: #050608;
    }
    .video-wrap iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; }
    .ad-strip {
      margin: 18px auto; padding: 10px 14px; background: rgba(17,21,32,0.92);
      border: 1px solid var(--border); border-radius: 14px;
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px;
      min-height: 72px;
    }
    .ad-label {
      font-size: 0.66rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--muted); background: var(--surface-2); border: 1px solid var(--border);
      padding: 3px 9px; border-radius: 999px;
    }
    footer {
      max-width: var(--max); margin: 0 auto; padding: 22px 18px; border-top: 1px solid var(--border);
      color: var(--muted); font-size: 0.82rem; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px;
    }
    footer a:hover { color: var(--text); }
  `;
}

function renderMediaCard(item, prefix = "") {
  const folder = item.mediaType === "movie" ? "movie" : "tv";
  const href = `${prefix}${folder}/${item.slug}.html`;
  const year = (item.releaseDate || "").slice(0, 4) || "2026";
  const upcoming = isComingSoon(item.releaseDate);
  const pillText = upcoming
    ? `Coming Soon • ${formatPrettyDate(item.releaseDate)}`
    : item.voteAverage > 0
    ? `★ ${item.voteAverage.toFixed(1)} • ${year}`
    : `${formatPrettyDate(item.releaseDate)}`;
  const subText = upcoming
    ? `${item.mediaType === "movie" ? "Movie" : "Series"} • Releases ${formatPrettyDate(item.releaseDate)}`
    : `${item.mediaType === "movie" ? "Movie" : "TV Series"} • ${item.genres.slice(0, 2).join(", ") || year}`;

  return `
    <a class="media-card" href="${esc(href)}" data-search="${esc(`${item.title} ${year} ${item.genres.join(" ")}`.toLowerCase())}">
      <div class="poster-box">
        <img src="https://image.tmdb.org/t/p/w342${esc(item.posterPath)}" alt="${esc(item.title)} (${esc(year)}) poster" loading="lazy" />
        <span class="status-pill${upcoming ? " soon" : ""}">${esc(pillText)}</span>
      </div>
      <div class="card-body">
        <div class="card-title">${esc(item.title)} (${esc(year)})</div>
        <div class="card-sub">${esc(subText)}</div>
      </div>
    </a>`;
}

function buildHomePage(categories, allMovies, allTv) {
  const allUnique = Array.from(
    new Map([...allMovies, ...allTv].map((x) => [`${x.mediaType}-${x.id}`, x])).values()
  );

  const itemListSchema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: "CineVault",
        url: `${SITE_URL}/`,
        potentialAction: {
          "@type": "SearchAction",
          target: `${SITE_URL}/?q={search_term_string}`,
          "query-input": "required name=search_term_string"
        }
      },
      {
        "@type": "ItemList",
        name: "CineVault Featured Movies, Coming Soon, Anime, Hollywood & Bollywood",
        numberOfItems: allUnique.length,
        itemListElement: allUnique.slice(0, 50).map((item, idx) => ({
          "@type": "ListItem",
          position: idx + 1,
          name: `${item.title} (${(item.releaseDate || "2026").slice(0, 4)})`,
          url: `${SITE_URL}/${item.mediaType === "movie" ? "movie" : "tv"}/${item.slug}.html`
        }))
      }
    ]
  };

  const shelvesHtml = categories
    .filter((cat) => cat.items.length > 0)
    .map(
      (cat) => `
      <section class="shelf" id="${esc(cat.id)}" aria-labelledby="heading-${esc(cat.id)}">
        <div class="shelf-head">
          <div class="shelf-title-wrap">
            <h2 class="shelf-title" id="heading-${esc(cat.id)}">${esc(cat.label)}</h2>
            <span class="shelf-count">${cat.items.length} Titles</span>
          </div>
          <div class="shelf-actions">
            <button type="button" class="expand-btn" data-target="track-${esc(cat.id)}">Expand All (${cat.items.length})</button>
            <a class="nav-btn" href="${esc(cat.hubHref)}">Browse Hub →</a>
          </div>
        </div>
        <div class="card-track" id="track-${esc(cat.id)}">
          ${cat.items.map((item) => renderMediaCard(item, "")).join("")}
        </div>
      </section>`
    )
    .join("\n");

  const catPillsHtml = categories
    .filter((cat) => cat.items.length > 0)
    .map((cat) => `<a class="cat-pill" href="#${esc(cat.id)}">${esc(cat.shortLabel)} (${cat.items.length})</a>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CineVault — Stream Trailers, Coming Soon Movies, Anime, Hollywood &amp; Bollywood</title>
  <meta name="description" content="Explore Trending Movies, Coming Soon release dates, Anime, Hollywood, Bollywood, and Netflix series on CineVault. Click any title for full streaming availability, trailers, and cast." />
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
  <link rel="icon" type="image/svg+xml" href="favicon.svg" />
  <link rel="apple-touch-icon" href="favicon.svg" />
  <link rel="canonical" href="${SITE_URL}/" />
  <meta property="og:site_name" content="CineVault" />
  <meta property="og:title" content="CineVault — Trending Movies, Coming Soon, Anime, Hollywood &amp; Bollywood" />
  <meta property="og:description" content="Discover where to stream trending movies, upcoming releases, anime, Hollywood, and Bollywood titles with official trailers and regional streaming guides." />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${SITE_URL}/" />
  <meta name="twitter:card" content="summary_large_image" />
  <style>${baseCss()}</style>
  <script type="application/ld+json">${JSON.stringify(itemListSchema)}</script>
</head>
<body>
  <header>
    <div class="nav">
      <a class="brand" href="index.html"><span class="badge-icon">▶</span><span>CineVault</span></a>
      <nav class="nav-links" aria-label="Main Navigation">
        <a class="nav-btn active" href="index.html">Home</a>
        <a class="nav-btn" href="movie/index.html">Movies (${allMovies.length})</a>
        <a class="nav-btn" href="tv/index.html">TV &amp; Anime (${allTv.length})</a>
        <a class="nav-btn" href="guides.html">Guides</a>
      </nav>
    </div>
  </header>

  <main>
    <section class="home-hero">
      <h1>Discover Movies, Coming Soon Releases, Anime &amp; Series</h1>
      <p>Scroll horizontally across curated rows or expand any category to explore full streaming availability, official trailers, release dates, and cast—every title opens directly to its complete guide.</p>
      <div class="search-bar-wrap">
        <input id="liveSearch" class="search-input" type="search" placeholder="Search movies, anime, Bollywood, Hollywood, or year..." aria-label="Filter titles on page" />
      </div>
      <div class="cat-pills" aria-label="Jump to category">
        ${catPillsHtml}
      </div>
    </section>

    <div class="ad-strip" aria-label="Sponsored">
      <span class="ad-label">Sponsored</span>
      <iframe width="320" height="50" scrolling="no" frameborder="0" loading="lazy" style="border:0;max-width:100%;display:block;" srcdoc="&lt;!DOCTYPE html&gt;&lt;html&gt;&lt;head&gt;&lt;meta charset=&quot;utf-8&quot;&gt;&lt;style&gt;html,body{margin:0;padding:0;background:transparent;overflow:hidden;display:flex;justify-content:center;}&lt;/style&gt;&lt;/head&gt;&lt;body&gt;&lt;script&gt;atOptions={&#39;key&#39;:&#39;b570c351ca5a05131ca8916fc6b23f71&#39;,&#39;format&#39;:&#39;iframe&#39;,&#39;height&#39;:50,&#39;width&#39;:320,&#39;params&#39;:{}};&lt;/script&gt;&lt;script src=&quot;https://bancadeltempoidea.org/22/b570c351ca5a05131ca8916fc6b23f71&quot;&gt;&lt;/script&gt;&lt;/body&gt;&lt;/html&gt;"></iframe>
    </div>

    ${shelvesHtml}
  </main>

  <footer>
    <span>CineVault Streaming Discovery • Updated ${TODAY} (${allUnique.length} Titles Indexed)</span>
    <span><a href="index.html">Home</a> · <a href="movie/index.html">Movies</a> · <a href="tv/index.html">TV &amp; Anime</a> · <a href="guides.html">Guides</a> · <a href="sitemap.xml">Sitemap</a></span>
  </footer>

  <script>
    (function () {
      // Expand / Collapse horizontal shelves cleanly without reloads
      document.querySelectorAll(".expand-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const track = document.getElementById(btn.dataset.target);
          if (!track) return;
          const isExpanded = track.classList.toggle("expanded");
          const count = track.children.length;
          btn.textContent = isExpanded ? "Collapse Row" : "Expand All (" + count + ")";
        });
      });

      // Instant live filter across all shelves + ?q= URL parameter support
      const input = document.getElementById("liveSearch");
      function filterCards(q) {
        const term = (q || "").trim().toLowerCase();
        document.querySelectorAll(".shelf").forEach((shelf) => {
          let visible = 0;
          shelf.querySelectorAll(".media-card").forEach((card) => {
            const match = !term || (card.dataset.search || "").includes(term);
            card.style.display = match ? "" : "none";
            if (match) visible++;
          });
          shelf.style.display = visible > 0 ? "" : "none";
        });
      }
      if (input) {
        input.addEventListener("input", () => filterCards(input.value));
        const params = new URLSearchParams(window.location.search);
        const initialQ = params.get("q");
        if (initialQ) {
          input.value = initialQ;
          filterCards(initialQ);
        }
      }
    })();
  </script>
</body>
</html>`;
}

function buildDetailPage(item, allOfSameType, indexInList, crossCategoryLinks) {
  const isMovie = item.mediaType === "movie";
  const folder = isMovie ? "movie" : "tv";
  const hubLabel = isMovie ? "Movies" : "TV & Anime";
  const schemaType = isMovie ? "Movie" : "TVSeries";
  const pageUrl = `${SITE_URL}/${folder}/${item.slug}.html`;
  const year = (item.releaseDate || "").slice(0, 4) || "2026";
  const upcoming = isComingSoon(item.releaseDate);
  const prettyRelease = formatPrettyDate(item.releaseDate);
  const hasRating = !upcoming && item.voteAverage > 0 && item.voteCount > 0;

  const statusBadge = upcoming
    ? `Coming Soon • ${prettyRelease}`
    : hasRating
    ? `★ ${item.voteAverage.toFixed(1)} (${item.voteCount.toLocaleString()} votes)`
    : `Released ${prettyRelease}`;

  const runtimeLabel = isMovie
    ? item.runtime ? `${item.runtime} min` : ""
    : item.seasonsCount ? `${item.seasonsCount} Season${item.seasonsCount > 1 ? "s" : ""}` : "";

  const genresText = item.genres.join(", ") || "Entertainment";
  const topCast = item.cast.slice(0, 10);
  const castLead = topCast.slice(0, 4).join(", ");

  const regionCardsHtml = REGIONS.map(
    (r) => `
      <div class="region-box" data-region="${r.code}">
        <div class="region-title">${esc(r.name)}</div>
        <p class="region-note">${esc(formatProviders(item.watchProviders, r.code, item.releaseDate))}</p>
      </div>`
  ).join("");

  const prevItem = allOfSameType[(indexInList - 1 + allOfSameType.length) % allOfSameType.length];
  const nextItem = allOfSameType[(indexInList + 1) % allOfSameType.length];

  const related = allOfSameType
    .filter((x) => x.id !== item.id)
    .slice(0, 8)
    .map((r) => renderMediaCard(r, "../"))
    .join("");

  const crossLinksHtml = crossCategoryLinks
    .slice(0, 6)
    .map((c) => renderMediaCard(c, "../"))
    .join("");

  const pageTitle = upcoming
    ? `${item.title} (${year}) Release Date (${prettyRelease}), Trailer & Cast | CineVault`
    : `Where to Watch ${item.title} (${year}) — Streaming, Trailer & Cast | CineVault`;

  const metaDesc = upcoming
    ? `${item.title} (${year}) is coming soon on ${prettyRelease}. Watch the official trailer, check cast details, plot overview, and streaming updates on CineVault.`
    : `Find where to stream ${item.title} (${year}) online, watch the official trailer, and explore full cast, release date (${prettyRelease}), and ratings on CineVault.`;

  const graph = [
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: hubLabel, item: `${SITE_URL}/${folder}/` },
        { "@type": "ListItem", position: 3, name: `${item.title} (${year})`, item: pageUrl }
      ]
    },
    {
      "@type": schemaType,
      name: item.title,
      datePublished: item.releaseDate || undefined,
      description: item.overview,
      image: `https://image.tmdb.org/t/p/w500${item.posterPath}`,
      genre: item.genres,
      ...(hasRating
        ? {
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: item.voteAverage.toFixed(1),
              bestRating: "10",
              ratingCount: item.voteCount
            }
          }
        : {}),
      actor: topCast.map((name) => ({ "@type": "Person", name })),
      ...(item.trailerKey
        ? {
            trailer: {
              "@type": "VideoObject",
              name: `${item.title} Official Trailer`,
              description: `Official trailer for ${item.title} (${year}).`,
              thumbnailUrl: `https://image.tmdb.org/t/p/w1280${item.backdropPath || item.posterPath}`,
              embedUrl: `https://www.youtube.com/embed/${item.trailerKey}`,
              uploadDate: item.releaseDate || TODAY
            }
          }
        : {}),
      url: pageUrl
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: upcoming
            ? `When does ${item.title} (${year}) release?`
            : `Where can I watch ${item.title} (${year}) online?`,
          acceptedAnswer: {
            "@type": "Answer",
            text: upcoming
              ? `${item.title} is scheduled to release on ${prettyRelease}. Streaming and digital availability follow after premiere.`
              : `${formatProviders(item.watchProviders, "US", item.releaseDate)}`
          }
        },
        {
          "@type": "Question",
          name: `What genre is ${item.title}?`,
          acceptedAnswer: {
            "@type": "Answer",
            text: `${item.title} (${year}) falls under ${genresText}${runtimeLabel ? ` (${runtimeLabel})` : ""}.`
          }
        },
        {
          "@type": "Question",
          name: `Who is in the cast of ${item.title}?`,
          acceptedAnswer: {
            "@type": "Answer",
            text: castLead ? `Featured cast includes ${castLead}.` : `Cast and production credits are updated automatically on CineVault.`
          }
        }
      ]
    }
  ];

  const heroBg = item.backdropPath
    ? `linear-gradient(135deg, rgba(8,10,15,0.95) 38%, rgba(17,21,32,0.84) 100%), url('https://image.tmdb.org/t/p/w1280${item.backdropPath}') center/cover no-repeat`
    : `linear-gradient(135deg, #0d1220 0%, #171e31 100%)`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(pageTitle)}</title>
  <meta name="description" content="${esc(metaDesc)}" />
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
  <link rel="icon" type="image/svg+xml" href="../favicon.svg" />
  <link rel="apple-touch-icon" href="../favicon.svg" />
  <link rel="canonical" href="${esc(pageUrl)}" />
  <meta property="og:site_name" content="CineVault" />
  <meta property="og:title" content="${esc(pageTitle)}" />
  <meta property="og:description" content="${esc(item.overview)}" />
  <meta property="og:type" content="${isMovie ? "video.movie" : "video.tv_show"}" />
  <meta property="og:url" content="${esc(pageUrl)}" />
  <meta property="og:image" content="https://image.tmdb.org/t/p/w500${esc(item.posterPath)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <style>${baseCss()}</style>
  <script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph })}</script>
</head>
<body>
  <header>
    <div class="nav">
      <a class="brand" href="../index.html"><span class="badge-icon">▶</span><span>CineVault</span></a>
      <nav class="nav-links" aria-label="Main Navigation">
        <a class="nav-btn" href="../index.html">Home</a>
        <a class="nav-btn" href="../index.html#coming-soon">Coming Soon</a>
        <a class="nav-btn" href="../index.html#anime">Anime</a>
        <a class="nav-btn" href="../movie/index.html">Movies</a>
        <a class="nav-btn" href="../tv/index.html">TV Series</a>
        <a class="nav-btn" href="../guides.html">Guides</a>
      </nav>
    </div>
  </header>

  <main>
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="../index.html">Home</a><span>/</span>
      <a href="index.html">${esc(hubLabel)}</a><span>/</span>
      <span>${esc(item.title)} (${esc(year)})</span>
    </nav>

    <section class="hero-grid" style="background:${heroBg};">
      <img class="detail-poster" src="https://image.tmdb.org/t/p/w500${esc(item.posterPath)}" alt="${esc(item.title)} (${esc(year)}) poster" width="500" height="750" fetchpriority="high" />
      <div>
        <span class="type-tag">${esc(item.categoryTag || (isMovie ? "Movie" : "TV Series"))}</span>
        ${upcoming ? `<span class="type-tag soon">Coming Soon • ${esc(prettyRelease)}</span>` : ""}
        <h1 class="detail-h1">${upcoming ? `${esc(item.title)} (${esc(year)}) — Release Date, Trailer &amp; Cast` : `Where to Watch ${esc(item.title)} (${esc(year)})`}</h1>
        <div class="meta">
          <span>${esc(statusBadge)}</span>
          <span>${esc(prettyRelease)}</span>
          ${runtimeLabel ? `<span>${esc(runtimeLabel)}</span>` : ""}
          <span>${esc(genresText)}</span>
        </div>
        <p class="overview">${esc(item.overview)}</p>
        <a class="cta" href="../index.html">← Back to All Categories</a>
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <h2>${upcoming ? "Release &amp; Streaming Schedule by Country" : "Streaming Availability by Country"}</h2>
        <select id="regionSelect" class="region-select" aria-label="Select your country">
          ${REGIONS.map((r) => `<option value="${r.code}">${esc(r.name)}</option>`).join("")}
        </select>
      </div>
      <p class="card-lead">Regional watch status for <strong>${esc(item.title)} (${esc(year)})</strong>:</p>
      <div class="region-grid" id="regionGrid">${regionCardsHtml}</div>
    </section>

    ${
      item.trailerKey
        ? `<section class="card">
            <h2>Official Trailer</h2>
            <div class="video-wrap">
              <iframe src="https://www.youtube-nocookie.com/embed/${esc(item.trailerKey)}" title="${esc(item.title)} Trailer" allowfullscreen loading="lazy"></iframe>
            </div>
          </section>`
        : ""
    }

    <div class="ad-strip" aria-label="Sponsored">
      <span class="ad-label">Sponsored</span>
      <iframe width="320" height="50" scrolling="no" frameborder="0" loading="lazy" style="border:0;max-width:100%;display:block;" srcdoc="&lt;!DOCTYPE html&gt;&lt;html&gt;&lt;head&gt;&lt;meta charset=&quot;utf-8&quot;&gt;&lt;style&gt;html,body{margin:0;padding:0;background:transparent;overflow:hidden;display:flex;justify-content:center;}&lt;/style&gt;&lt;/head&gt;&lt;body&gt;&lt;script&gt;atOptions={&#39;key&#39;:&#39;b570c351ca5a05131ca8916fc6b23f71&#39;,&#39;format&#39;:&#39;iframe&#39;,&#39;height&#39;:50,&#39;width&#39;:320,&#39;params&#39;:{}};&lt;/script&gt;&lt;script src=&quot;https://bancadeltempoidea.org/22/b570c351ca5a05131ca8916fc6b23f71&quot;&gt;&lt;/script&gt;&lt;/body&gt;&lt;/html&gt;"></iframe>
    </div>

    ${
      topCast.length
        ? `<section class="card">
            <h2>Main Cast &amp; Stars</h2>
            <div class="pills">${topCast.map((c) => `<span class="pill">${esc(c)}</span>`).join("")}</div>
          </section>`
        : ""
    }

    <section class="card">
      <h2>Frequently Asked Questions</h2>
      <details class="faq-item" open>
        <summary>${upcoming ? `When is ${esc(item.title)} (${esc(year)}) coming out?` : `Where can I watch ${esc(item.title)} (${esc(year)}) online?`}</summary>
        <p>${upcoming ? `${esc(item.title)} has a scheduled release date of ${esc(prettyRelease)}.` : `${esc(formatProviders(item.watchProviders, "US", item.releaseDate))} Use the selector above for your country.`}</p>
      </details>
      <details class="faq-item">
        <summary>What genres and runtime does ${esc(item.title)} have?</summary>
        <p>${esc(item.title)} is categorized under ${esc(genresText)}${runtimeLabel ? ` with a runtime of ${esc(runtimeLabel)}` : ""}.</p>
      </details>
      <details class="faq-item">
        <summary>Who stars in ${esc(item.title)}?</summary>
        <p>${esc(castLead ? `The main cast features ${castLead}.` : `Cast and production credits are synced automatically from TMDB.`)}</p>
      </details>
    </section>

    <nav class="pager" aria-label="Previous and Next Title">
      <a href="${esc(prevItem.slug)}.html">← ${esc(prevItem.title)}</a>
      <a href="${esc(nextItem.slug)}.html" style="text-align:right;">${esc(nextItem.title)} →</a>
    </nav>

    <section class="card">
      <div class="card-head">
        <h2>More ${esc(hubLabel)} to Explore</h2>
        <a class="nav-btn" href="index.html">View All ${esc(hubLabel)} →</a>
      </div>
      <div class="card-track expanded">${related}</div>
    </section>

    ${
      crossLinksHtml
        ? `<section class="card">
            <div class="card-head">
              <h2>Trending Across Other Categories</h2>
              <a class="nav-btn" href="../index.html">All Categories →</a>
            </div>
            <div class="card-track expanded">${crossLinksHtml}</div>
          </section>`
        : ""
    }
  </main>

  <footer>
    <span>CineVault Streaming Discovery • Updated ${TODAY}</span>
    <span><a href="../index.html">Home</a> · <a href="../movie/index.html">Movies</a> · <a href="../tv/index.html">TV &amp; Anime</a> · <a href="../guides.html">Guides</a> · <a href="../sitemap.xml">Sitemap</a></span>
  </footer>

  <script>
    (function () {
      const sel = document.getElementById("regionSelect");
      const grid = document.getElementById("regionGrid");
      if (!sel || !grid) return;
      const lang = (navigator.language || "en-US").toUpperCase();
      const detected = ["PK", "GB", "CA", "IN", "AU"].find((c) => lang.endsWith("-" + c)) || "US";
      function applyRegion(code) {
        sel.value = code;
        const boxes = Array.from(grid.children);
        boxes.forEach((b) => b.classList.toggle("active-region", b.dataset.region === code));
        const active = boxes.find((b) => b.dataset.region === code);
        if (active) grid.prepend(active);
      }
      sel.addEventListener("change", () => applyRegion(sel.value));
      applyRegion(detected);
    })();
  </script>
</body>
</html>`;
}

function buildDirectoryPage(mediaType, items) {
  const isMovie = mediaType === "movie";
  const title = isMovie ? "All Movies Directory — Hollywood, Bollywood & Coming Soon" : "All TV Series & Anime Directory";
  const folder = isMovie ? "movie" : "tv";
  const cardsHtml = items.map((item) => renderMediaCard(item, "../")).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)} | CineVault</title>
  <meta name="description" content="Browse all ${items.length} ${isMovie ? "movies" : "TV series and anime"} on CineVault with direct streaming guides, coming soon dates, trailers, and cast." />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <link rel="icon" type="image/svg+xml" href="../favicon.svg" />
  <link rel="canonical" href="${SITE_URL}/${folder}/index.html" />
  <style>${baseCss()}</style>
</head>
<body>
  <header>
    <div class="nav">
      <a class="brand" href="../index.html"><span class="badge-icon">▶</span><span>CineVault</span></a>
      <nav class="nav-links">
        <a class="nav-btn" href="../index.html">Home</a>
        <a class="nav-btn${isMovie ? " active" : ""}" href="../movie/index.html">Movies</a>
        <a class="nav-btn${!isMovie ? " active" : ""}" href="../tv/index.html">TV &amp; Anime</a>
        <a class="nav-btn" href="../guides.html">Guides</a>
      </nav>
    </div>
  </header>
  <main>
    <nav class="breadcrumbs"><a href="../index.html">Home</a><span>/</span><span>${esc(title)}</span></nav>
    <section class="card">
      <h1>${esc(title)} (${items.length})</h1>
      <p class="card-lead">Click any title below to open its full streaming availability, release date, official trailer, and cast page.</p>
      <div class="card-track expanded">${cardsHtml}</div>
    </section>
  </main>
  <footer>
    <span>CineVault Streaming Discovery • Updated ${TODAY}</span>
    <span><a href="../index.html">Home</a> · <a href="../movie/index.html">Movies</a> · <a href="../tv/index.html">TV &amp; Anime</a> · <a href="../guides.html">Guides</a></span>
  </footer>
</body>
</html>`;
}

async function fetchFullItem(mediaType, raw, categoryTag) {
  const details = await tmdb(`/${mediaType}/${raw.id}?append_to_response=credits,videos,watch/providers`);
  const title = details.title || details.name || raw.title || raw.name;
  const releaseDate = details.release_date || details.first_air_date || "";
  const videos = details.videos?.results || [];
  const trailer =
    videos.find((v) => v.site === "YouTube" && v.type === "Trailer" && v.official) ||
    videos.find((v) => v.site === "YouTube" && v.type === "Trailer") ||
    videos.find((v) => v.site === "YouTube");

  return {
    id: raw.id,
    mediaType,
    categoryTag,
    title,
    slug: `${slugify(title)}-${raw.id}`,
    releaseDate,
    overview: (
      details.overview ||
      `Discover streaming availability, official trailer, release dates, and full cast for ${title} on CineVault.`
    ).trim(),
    posterPath: details.poster_path || raw.poster_path,
    backdropPath: details.backdrop_path || raw.backdrop_path || "",
    voteAverage: Number(details.vote_average || 0),
    voteCount: Number(details.vote_count || 0),
    runtime: Number(details.runtime || 0),
    seasonsCount: Number(details.number_of_seasons || 0),
    genres: (details.genres || []).map((g) => g.name),
    cast: (details.credits?.cast || []).slice(0, 10).map((c) => c.name),
    trailerKey: trailer ? trailer.key : "",
    watchProviders: details["watch/providers"]?.results || {}
  };
}

function dedupeRaw(arr, limit) {
  const map = new Map();
  for (const item of arr) {
    if (item?.id && item?.poster_path && !map.has(item.id)) {
      map.set(item.id, item);
      if (map.size >= limit) break;
    }
  }
  return Array.from(map.values());
}

async function main() {
  await fs.mkdir("movie", { recursive: true });
  await fs.mkdir("tv", { recursive: true });

  // 1. Crisp square brand favicon (red rounded badge + white play icon)
  const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ff1e2d"/><stop offset="100%" stop-color="#99040c"/></linearGradient></defs><rect width="96" height="96" rx="22" fill="url(#g)"/><polygon points="38,28 72,48 38,68" fill="#ffffff"/></svg>`;
  await fs.writeFile("favicon.svg", faviconSvg, "utf8");

  // 2. Fetch distinct category feeds from TMDB
  const [
    mTrending,
    mUpcoming,
    mHollywood,
    mBollywood,
    tvAnime,
    tvNetflix,
    tvTrending
  ] = await Promise.all([
    tmdb("/trending/movie/week"),
    tmdb(`/movie/upcoming?region=US`),
    tmdb("/discover/movie?with_original_language=en&sort_by=popularity.desc"),
    tmdb("/discover/movie?with_original_language=hi&sort_by=popularity.desc"),
    tmdb("/discover/tv?with_genres=16&with_original_language=ja&sort_by=popularity.desc"),
    tmdb("/discover/tv?with_networks=213&sort_by=popularity.desc"),
    tmdb("/trending/tv/week")
  ]);

  const movieCache = new Map();
  const tvCache = new Map();

  async function resolveBatch(mediaType, rawList, tag) {
    const cache = mediaType === "movie" ? movieCache : tvCache;
    const out = [];
    for (const raw of rawList) {
      if (!cache.has(raw.id)) {
        const full = await fetchFullItem(mediaType, raw, tag);
        cache.set(raw.id, full);
      }
      out.push(cache.get(raw.id));
    }
    return out;
  }

  const trendingMovies = await resolveBatch("movie", dedupeRaw(mTrending.results || [], 18), "Trending");
  const trendingTv = await resolveBatch("tv", dedupeRaw(tvTrending.results || [], 10), "Trending");

  const rawUpcomingFiltered = (mUpcoming.results || []).filter(
    (m) => m.release_date && m.release_date > TODAY
  );
  const upcomingPool = rawUpcomingFiltered.length >= 6 ? rawUpcomingFiltered : (mUpcoming.results || []);
  const comingSoonItems = await resolveBatch("movie", dedupeRaw(upcomingPool, 18), "Coming Soon");

  const animeItems = await resolveBatch("tv", dedupeRaw(tvAnime.results || [], 20), "Anime");
  const hollywoodItems = await resolveBatch("movie", dedupeRaw(mHollywood.results || [], 18), "Hollywood");
  const bollywoodItems = await resolveBatch("movie", dedupeRaw(mBollywood.results || [], 18), "Bollywood");
  const netflixItems = await resolveBatch("tv", dedupeRaw(tvNetflix.results || [], 16), "Netflix & Streaming");

  const allMovies = Array.from(movieCache.values());
  const allTv = Array.from(tvCache.values());

  // Guarantee Coming Soon shelf also catches any future-dated title from other feeds
  const comingSoonAll = Array.from(
    new Map(
      [...comingSoonItems, ...allMovies.filter((m) => isComingSoon(m.releaseDate))].map((x) => [x.id, x])
    ).values()
  );

  const categories = [
    {
      id: "trending",
      shortLabel: "Trending",
      label: "🔥 Trending Movies & Series",
      hubHref: "movie/index.html",
      items: [...trendingMovies.slice(0, 14), ...trendingTv.slice(0, 8)]
    },
    {
      id: "coming-soon",
      shortLabel: "Coming Soon",
      label: "🗓️ Coming Soon — Upcoming Release Dates",
      hubHref: "movie/index.html",
      items: comingSoonAll
    },
    {
      id: "anime",
      shortLabel: "Anime",
      label: "⚡ Anime Series & Popular Shonen",
      hubHref: "tv/index.html",
      items: animeItems
    },
    {
      id: "hollywood",
      shortLabel: "Hollywood",
      label: "🎬 Hollywood Blockbusters",
      hubHref: "movie/index.html",
      items: hollywoodItems
    },
    {
      id: "bollywood",
      shortLabel: "Bollywood",
      label: "🇮🇳 Bollywood Hits & New Releases",
      hubHref: "movie/index.html",
      items: bollywoodItems
    },
    {
      id: "netflix-series",
      shortLabel: "Netflix & Streaming",
      label: "📺 Netflix & Top Streaming Series",
      hubHref: "tv/index.html",
      items: netflixItems
    }
  ];

  // 3. Write individual movie & TV detail pages
  for (let i = 0; i < allMovies.length; i++) {
    await fs.writeFile(
      path.join("movie", `${allMovies[i].slug}.html`),
      buildDetailPage(allMovies[i], allMovies, i, animeItems.slice(0, 6)),
      "utf8"
    );
  }
  for (let i = 0; i < allTv.length; i++) {
    await fs.writeFile(
      path.join("tv", `${allTv[i].slug}.html`),
      buildDetailPage(allTv[i], allTv, i, trendingMovies.slice(0, 6)),
      "utf8"
    );
  }

  // 4. Write directory hubs & single-page categorized index.html
  await fs.writeFile(path.join("movie", "index.html"), buildDirectoryPage("movie", allMovies), "utf8");
  await fs.writeFile(path.join("tv", "index.html"), buildDirectoryPage("tv", allTv), "utf8");
  await fs.writeFile("index.html", buildHomePage(categories, allMovies, allTv), "utf8");

  // 5. Ensure clean robots.txt
  const robotsTxt = `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`;
  await fs.writeFile("robots.txt", robotsTxt, "utf8");

  // 6. Write complete sitemap.xml
  const urls = [
    { loc: `${SITE_URL}/`, priority: "1.0", changefreq: "daily" },
    { loc: `${SITE_URL}/guides.html`, priority: "0.9", changefreq: "weekly" },
    { loc: `${SITE_URL}/movie/index.html`, priority: "0.9", changefreq: "daily" },
    { loc: `${SITE_URL}/tv/index.html`, priority: "0.9", changefreq: "daily" },
    ...allMovies.map((m) => ({
      loc: `${SITE_URL}/movie/${m.slug}.html`,
      priority: isComingSoon(m.releaseDate) ? "0.85" : "0.8",
      changefreq: "weekly"
    })),
    ...allTv.map((t) => ({
      loc: `${SITE_URL}/tv/${t.slug}.html`,
      priority: "0.8",
      changefreq: "weekly"
    }))
  ];

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map(
      (u) =>
        `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
    )
    .join("\n")}\n</urlset>\n`;
  await fs.writeFile("sitemap.xml", sitemapXml, "utf8");

  console.log(
    `Success: ${allMovies.length} movies, ${allTv.length} TV/Anime, ${urls.length} sitemap URLs generated.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
