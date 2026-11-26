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

function formatDate(iso) {
  if (!iso) return "Coming Soon";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  });
}

function isFuture(dateStr) {
  return Boolean(dateStr && dateStr > TODAY);
}

async function tmdb(endpoint) {
  const sep = endpoint.includes("?") ? "&" : "?";
  const res = await fetch(`https://api.themoviedb.org/3${endpoint}${sep}api_key=${TMDB_KEY}`);
  if (!res.ok) throw new Error(`TMDB ${res.status} on ${endpoint}`);
  return res.json();
}

async function fetchPages(baseEndpoint, pages = [1, 2]) {
  const results = [];
  for (const p of pages) {
    const sep = baseEndpoint.includes("?") ? "&" : "?";
    const data = await tmdb(`${baseEndpoint}${sep}page=${p}`);
    if (Array.isArray(data.results)) {
      results.push(...data.results);
    }
  }
  return results;
}

function providersText(watchResults, regionCode, releaseDate) {
  const r = watchResults?.[regionCode];
  const soon = isFuture(releaseDate);
  if (!r) {
    return soon
      ? `Coming Soon (${formatDate(releaseDate)}) — streaming & VOD announced after release.`
      : "Available on regional streaming & VOD platforms.";
  }
  const flat = (r.flatrate || []).map((x) => x.provider_name);
  const rb = [...(r.rent || []), ...(r.buy || [])]
    .map((x) => x.provider_name)
    .filter((v, i, a) => a.indexOf(v) === i);
  const out = [];
  if (flat.length) out.push(`Stream: ${flat.slice(0, 4).join(", ")}`);
  if (rb.length) out.push(`Rent/Buy: ${rb.slice(0, 3).join(", ")}`);
  if (out.length) return out.join(" • ");
  return soon
    ? `Coming Soon (${formatDate(releaseDate)}) — release date ${formatDate(releaseDate)}.`
    : "Check local digital catalogs.";
}

function netflixCss() {
  return `
    :root {
      --bg: #040406;
      --card-bg: #11131a;
      --panel-bg: #0c0e14;
      --text: #ffffff;
      --sub: #b3b9c9;
      --red: #e50914;
      --red-hi: #f40612;
      --gold: #f5c518;
      --border: rgba(255,255,255,0.1);
      --max: 1360px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: "Netflix Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }
    a { color: inherit; text-decoration: none; }

    /* Netflix Top Header */
    .nf-header {
      position: sticky; top: 0; z-index: 80;
      background: linear-gradient(180deg, rgba(4,4,6,0.96) 0%, rgba(4,4,6,0.78) 100%);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
    }
    .nf-nav {
      max-width: var(--max); margin: 0 auto; padding: 12px 20px;
      display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap;
    }
    .nf-logo {
      display: inline-flex; align-items: center; gap: 9px;
      color: var(--red-hi); font-size: 1.38rem; font-weight: 900;
      letter-spacing: 0.05em; text-transform: uppercase;
    }
    .nf-logo-box {
      width: 28px; height: 28px; border-radius: 5px;
      background: var(--red); color: #fff;
      display: grid; place-items: center; font-size: 0.85rem;
    }
    .nf-links { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
    .nf-link {
      padding: 6px 11px; border-radius: 4px;
      font-size: 0.82rem; font-weight: 700; color: #d4d9e6;
    }
    .nf-link:hover, .nf-link.active { color: #fff; background: rgba(255,255,255,0.1); }

    .nf-main { max-width: var(--max); margin: 0 auto; padding: 14px 20px 64px; }

    /* Netflix Billboard Hero */
    .billboard {
      position: relative; border-radius: 10px; overflow: hidden;
      min-height: 350px; display: flex; align-items: flex-end;
      border: 1px solid var(--border); margin-bottom: 20px; background: #090b10;
    }
    .billboard-bg {
      position: absolute; inset: 0;
      background-size: cover; background-position: center 22%;
      filter: brightness(0.5);
    }
    .billboard-overlay {
      position: relative; z-index: 2; width: 100%;
      padding: 36px 26px 26px;
      background: linear-gradient(0deg, rgba(4,4,6,0.98) 10%, rgba(4,4,6,0.65) 62%, transparent 100%);
    }
    .billboard-badge {
      display: inline-block; background: var(--red); color: #fff;
      font-size: 0.7rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;
      padding: 3px 9px; border-radius: 3px; margin-bottom: 10px;
    }
    .billboard h1 { font-size: clamp(1.55rem, 3.6vw, 2.55rem); font-weight: 900; line-height: 1.12; margin-bottom: 10px; }
    .billboard p { color: #d8dee9; font-size: 0.94rem; max-width: 720px; margin-bottom: 16px; }
    .billboard-btns { display: flex; gap: 10px; flex-wrap: wrap; }
    .btn-white {
      background: #fff; color: #040406; font-weight: 800; font-size: 0.88rem;
      padding: 9px 18px; border-radius: 4px; display: inline-flex; align-items: center; gap: 6px;
    }
    .btn-white:hover { background: #e5e7eb; }
    .btn-dark {
      background: rgba(109,109,110,0.65); color: #fff; font-weight: 700; font-size: 0.88rem;
      padding: 9px 16px; border-radius: 4px;
    }
    .btn-dark:hover { background: rgba(109,109,110,0.85); }

    /* Search & Category Bar */
    .filter-strip {
      background: var(--panel-bg); border: 1px solid var(--border);
      border-radius: 8px; padding: 12px 14px; margin-bottom: 26px;
      display: flex; flex-direction: column; gap: 10px;
    }
    .nf-search {
      width: 100%; padding: 10px 14px; border-radius: 4px;
      background: #050608; border: 1px solid rgba(255,255,255,0.18);
      color: #fff; font-size: 0.92rem; outline: none;
    }
    .nf-search:focus { border-color: #fff; }
    .cat-bar { display: flex; gap: 7px; flex-wrap: wrap; }
    .cat-jump {
      padding: 4px 11px; border-radius: 4px; font-size: 0.78rem; font-weight: 700;
      background: rgba(255,255,255,0.06); color: var(--sub); border: 1px solid transparent;
    }
    .cat-jump:hover { color: #fff; border-color: rgba(255,255,255,0.28); }

    /* Horizontal Netflix Rows */
    .nf-row { margin-bottom: 28px; }
    .nf-row-head {
      display: flex; align-items: center; justify-content: space-between;
      gap: 10px; flex-wrap: wrap; margin-bottom: 10px;
    }
    .nf-row-title { font-size: 1.12rem; font-weight: 800; letter-spacing: -0.01em; }
    .nf-row-meta { font-size: 0.75rem; color: var(--sub); margin-left: 8px; font-weight: 600; }
    .nf-row-right { display: flex; align-items: center; gap: 10px; }
    .nf-expand {
      cursor: pointer; background: transparent; color: var(--sub);
      border: 1px solid var(--border); border-radius: 4px;
      padding: 4px 10px; font-size: 0.76rem; font-weight: 700;
    }
    .nf-expand:hover { color: #fff; border-color: rgba(255,255,255,0.35); }
    .nf-see-all { font-size: 0.78rem; font-weight: 700; color: var(--red-hi); }
    .nf-see-all:hover { text-decoration: underline; }

    .nf-track {
      display: flex; gap: 10px; overflow-x: auto; padding-bottom: 8px;
      scroll-snap-type: x mandatory; scrollbar-width: thin;
    }
    .nf-track::-webkit-scrollbar { height: 5px; }
    .nf-track::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.22); border-radius: 999px; }
    .nf-track .nf-card { flex: 0 0 152px; scroll-snap-align: start; }
    @media (max-width: 600px) {
      .nf-track .nf-card { flex: 0 0 132px; }
    }
    .nf-track.expanded {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(146px, 1fr));
      overflow-x: visible;
    }
    .nf-track.expanded .nf-card { flex: unset; width: 100%; }

    .nf-card {
      display: flex; flex-direction: column; border-radius: 6px; overflow: hidden;
      background: var(--card-bg); border: 1px solid rgba(255,255,255,0.07);
      transition: transform 0.16s ease, border-color 0.16s ease;
    }
    .nf-card:hover { transform: scale(1.03); border-color: rgba(255,255,255,0.4); z-index: 3; }
    .nf-poster { position: relative; aspect-ratio: 2/3; background: #0c0e14; overflow: hidden; }
    .nf-poster img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .nf-soon {
      position: absolute; top: 6px; left: 6px;
      background: var(--red); color: #fff; font-size: 0.63rem; font-weight: 800;
      padding: 2px 6px; border-radius: 3px; text-transform: uppercase;
    }
    .nf-rate {
      position: absolute; bottom: 6px; right: 6px;
      background: rgba(4,4,6,0.88); color: var(--gold); font-size: 0.67rem; font-weight: 800;
      padding: 2px 6px; border-radius: 3px;
    }
    .nf-card-body { padding: 7px 8px 9px; }
    .nf-card-title {
      font-size: 0.81rem; font-weight: 700; line-height: 1.25;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .nf-card-sub { font-size: 0.7rem; color: var(--sub); margin-top: 2px; }

    /* Detail & Hub Pages */
    .nf-crumbs { display: flex; flex-wrap: wrap; gap: 6px; font-size: 0.78rem; color: var(--sub); margin-bottom: 14px; }
    .nf-crumbs a:hover { color: #fff; }
    .nf-detail-hero {
      display: grid; grid-template-columns: 220px 1fr; gap: 22px;
      background: var(--panel-bg); border: 1px solid var(--border);
      border-radius: 10px; padding: 20px; margin-bottom: 18px;
    }
    @media (max-width: 680px) {
      .nf-detail-hero { grid-template-columns: 1fr; padding: 15px; }
      .nf-detail-poster { max-width: 185px; margin: 0 auto; }
    }
    .nf-detail-poster { width: 100%; aspect-ratio: 2/3; object-fit: cover; border-radius: 6px; display: block; }
    .nf-detail-h1 { font-size: clamp(1.35rem, 3vw, 2rem); font-weight: 900; margin-bottom: 10px; }
    .nf-tags { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 12px; font-size: 0.78rem; }
    .nf-tag { background: rgba(255,255,255,0.08); padding: 4px 10px; border-radius: 4px; color: #e5e9f2; font-weight: 600; }
    .nf-tag.red { background: rgba(229,9,20,0.25); color: #ff949a; font-weight: 800; border: 1px solid rgba(229,9,20,0.5); }
    .nf-plot { color: #d4d9e6; font-size: 0.93rem; margin-bottom: 16px; }
    .nf-box {
      background: var(--panel-bg); border: 1px solid var(--border);
      border-radius: 10px; padding: 18px; margin-bottom: 18px;
    }
    .nf-box-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
    .nf-box h2 { font-size: 1.06rem; font-weight: 800; }
    select.nf-select {
      background: #141822; color: #fff; border: 1px solid var(--border);
      padding: 6px 10px; border-radius: 4px; font-size: 0.8rem; font-weight: 700;
    }
    .nf-regions { display: grid; grid-template-columns: repeat(auto-fit, minmax(215px, 1fr)); gap: 10px; }
    .nf-reg-card { background: #12151f; border: 1px solid var(--border); border-radius: 6px; padding: 10px 12px; }
    .nf-reg-card.active { border-color: var(--red-hi); }
    .nf-reg-name { font-size: 0.82rem; font-weight: 800; margin-bottom: 3px; }
    .nf-reg-val { font-size: 0.79rem; color: var(--sub); }
    .nf-cast { display: flex; flex-wrap: wrap; gap: 7px; }
    .nf-cast-item { background: #12151f; border: 1px solid var(--border); padding: 5px 11px; border-radius: 999px; font-size: 0.8rem; font-weight: 600; }
    .nf-faq details { border-top: 1px solid var(--border); padding: 10px 0; }
    .nf-faq details:first-child { border-top: 0; padding-top: 0; }
    .nf-faq summary { font-weight: 700; font-size: 0.9rem; cursor: pointer; }
    .nf-faq p { margin-top: 5px; font-size: 0.85rem; color: var(--sub); }
    .nf-video { position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 8px; background: #000; }
    .nf-video iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
    .nf-ad {
      margin: 16px 0; padding: 10px 14px; background: var(--panel-bg);
      border: 1px solid var(--border); border-radius: 8px;
      display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;
    }
    .nf-ad-lbl { font-size: 0.64rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--sub); }
    .nf-footer {
      max-width: var(--max); margin: 0 auto; padding: 20px;
      border-top: 1px solid var(--border); color: var(--sub); font-size: 0.79rem;
      display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px;
    }
    .nf-footer a:hover { color: #fff; }
  `;
}

function renderNfCard(item, prefix = "") {
  const folder = item.mediaType === "movie" ? "movie" : "tv";
  const href = `${prefix}${folder}/${item.slug}.html`;
  const year = (item.releaseDate || "").slice(0, 4) || "2026";
  const soon = isFuture(item.releaseDate);
  const rating = !soon && item.voteAverage > 0 ? `★ ${item.voteAverage.toFixed(1)}` : "";
  const sub = soon
    ? `Coming ${formatDate(item.releaseDate)}`
    : `${year} • ${item.genres[0] || (item.mediaType === "movie" ? "Movie" : "Series")}`;

  return `
    <a class="nf-card" href="${esc(href)}" data-search="${esc(`${item.title} ${year} ${item.genres.join(" ")} ${item.categoryLabel || ""}`.toLowerCase())}">
      <div class="nf-poster">
        <img src="https://image.tmdb.org/t/p/w342${esc(item.posterPath)}" alt="${esc(item.title)} (${esc(year)})" loading="lazy" />
        ${soon ? `<span class="nf-soon">Soon • ${esc(formatDate(item.releaseDate))}</span>` : ""}
        ${rating ? `<span class="nf-rate">${esc(rating)}</span>` : ""}
      </div>
      <div class="nf-card-body">
        <div class="nf-card-title">${esc(item.title)}</div>
        <div class="nf-card-sub">${esc(sub)}</div>
      </div>
    </a>`;
}

function buildHome(categories, allMovies, allTv, billboard) {
  const uniqueItems = Array.from(
    new Map([...allMovies, ...allTv].map((x) => [`${x.mediaType}-${x.id}`, x])).values()
  );
  const bFolder = billboard.mediaType === "movie" ? "movie" : "tv";
  const bHref = `${bFolder}/${billboard.slug}.html`;
  const bYear = (billboard.releaseDate || "").slice(0, 4) || "2026";
  const bSoon = isFuture(billboard.releaseDate);

  const schema = {
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
        name: "CineVault Catalog",
        numberOfItems: uniqueItems.length,
        itemListElement: uniqueItems.slice(0, 100).map((item, idx) => ({
          "@type": "ListItem",
          position: idx + 1,
          name: `${item.title} (${(item.releaseDate || "2026").slice(0, 4)})`,
          url: `${SITE_URL}/${item.mediaType === "movie" ? "movie" : "tv"}/${item.slug}.html`
        }))
      }
    ]
  };

  const rowsHtml = categories
    .filter((c) => c.items.length > 0)
    .map(
      (c) => `
      <section class="nf-row" id="${esc(c.id)}" aria-labelledby="h-${esc(c.id)}">
        <div class="nf-row-head">
          <div>
            <h2 class="nf-row-title" id="h-${esc(c.id)}" style="display:inline;">${esc(c.title)}</h2>
            <span class="nf-row-meta">${c.items.length} titles</span>
          </div>
          <div class="nf-row-right">
            <button type="button" class="nf-expand" data-track="tr-${esc(c.id)}">Show All</button>
            <a class="nf-see-all" href="${esc(c.hubHref)}">Browse All →</a>
          </div>
        </div>
        <div class="nf-track" id="tr-${esc(c.id)}">
          ${c.items.map((x) => renderNfCard(x, "")).join("")}
        </div>
      </section>`
    )
    .join("\n");

  const jumpsHtml = categories
    .filter((c) => c.items.length > 0)
    .map((c) => `<a class="cat-jump" href="#${esc(c.id)}">${esc(c.shortTitle)}</a>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CineVault — Movies, Series, Coming Soon, Anime &amp; Streaming Guide</title>
  <meta name="description" content="Stream discovery on CineVault: Trending Now, Coming Soon release dates, Action, Sci-Fi, Comedy, Horror, Drama, Anime, and TV Series with trailers and cast." />
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
  <link rel="icon" type="image/svg+xml" href="favicon.svg" />
  <link rel="apple-touch-icon" href="favicon.svg" />
  <link rel="canonical" href="${SITE_URL}/" />
  <meta property="og:site_name" content="CineVault" />
  <meta property="og:title" content="CineVault — Movies, Series, Coming Soon &amp; Streaming Guide" />
  <meta property="og:description" content="Explore horizontal rows of movies, series, coming soon releases, and anime on CineVault." />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${SITE_URL}/" />
  <meta name="twitter:card" content="summary_large_image" />
  <style>${netflixCss()}</style>
  <script type="application/ld+json">${JSON.stringify(schema)}</script>
</head>
<body>
  <header class="nf-header">
    <div class="nf-nav">
      <a class="nf-logo" href="index.html"><span class="nf-logo-box">▶</span><span>CINEVAULT</span></a>
      <nav class="nf-links" aria-label="Main Menu">
        <a class="nf-link active" href="index.html">Home</a>
        <a class="nf-link" href="#trending-now">Trending</a>
        <a class="nf-link" href="#coming-soon">Coming Soon</a>
        <a class="nf-link" href="movie/index.html">Movies</a>
        <a class="nf-link" href="tv/index.html">TV Shows</a>
        <a class="nf-link" href="#anime">Anime</a>
        <a class="nf-link" href="guides.html">Guides</a>
      </nav>
    </div>
  </header>

  <main class="nf-main">
    <section class="billboard">
      <div class="billboard-bg" style="background-image:url('https://image.tmdb.org/t/p/w1280${esc(billboard.backdropPath || billboard.posterPath)}');"></div>
      <div class="billboard-overlay">
        <span class="billboard-badge">${bSoon ? `Coming Soon • ${esc(formatDate(billboard.releaseDate))}` : "Featured on CineVault"}</span>
        <h1>${esc(billboard.title)} (${esc(bYear)})</h1>
        <p>${esc(billboard.overview)}</p>
        <div class="billboard-btns">
          <a class="btn-white" href="${esc(bHref)}">▶ Watch Trailer &amp; Details</a>
          <a class="btn-dark" href="#coming-soon">Coming Soon</a>
        </div>
      </div>
    </section>

    <section class="filter-strip" aria-label="Search and Categories">
      <input id="nfSearch" class="nf-search" type="search" placeholder="Search across all movies, series, genres, or years..." aria-label="Search titles" />
      <div class="cat-bar">${jumpsHtml}</div>
    </section>

    <div class="nf-ad" aria-label="Sponsored">
      <span class="nf-ad-lbl">Sponsored</span>
      <iframe width="320" height="50" scrolling="no" frameborder="0" loading="lazy" style="border:0;max-width:100%;display:block;" srcdoc="&lt;!DOCTYPE html&gt;&lt;html&gt;&lt;head&gt;&lt;meta charset=&quot;utf-8&quot;&gt;&lt;style&gt;html,body{margin:0;padding:0;background:transparent;overflow:hidden;display:flex;justify-content:center;}&lt;/style&gt;&lt;/head&gt;&lt;body&gt;&lt;script&gt;atOptions={&#39;key&#39;:&#39;b570c351ca5a05131ca8916fc6b23f71&#39;,&#39;format&#39;:&#39;iframe&#39;,&#39;height&#39;:50,&#39;width&#39;:320,&#39;params&#39;:{}};&lt;/script&gt;&lt;script src=&quot;https://bancadeltempoidea.org/22/b570c351ca5a05131ca8916fc6b23f71&quot;&gt;&lt;/script&gt;&lt;/body&gt;&lt;/html&gt;"></iframe>
    </div>

    ${rowsHtml}
  </main>

  <footer class="nf-footer">
    <span>CineVault • Updated ${TODAY} • ${uniqueItems.length} Pages</span>
    <span><a href="index.html">Home</a> · <a href="movie/index.html">Movies</a> · <a href="tv/index.html">TV Shows</a> · <a href="guides.html">Guides</a> · <a href="sitemap.xml">Sitemap</a></span>
  </footer>

  <script>
    (function () {
      document.querySelectorAll(".nf-expand").forEach((btn) => {
        btn.addEventListener("click", () => {
          const track = document.getElementById(btn.dataset.track);
          if (!track) return;
          const open = track.classList.toggle("expanded");
          btn.textContent = open ? "Collapse" : "Show All";
        });
      });

      const input = document.getElementById("nfSearch");
      function filterAll(q) {
        const term = (q || "").trim().toLowerCase();
        document.querySelectorAll(".nf-row").forEach((row) => {
          let count = 0;
          row.querySelectorAll(".nf-card").forEach((card) => {
            const match = !term || (card.dataset.search || "").includes(term);
            card.style.display = match ? "" : "none";
            if (match) count++;
          });
          row.style.display = count > 0 ? "" : "none";
        });
      }
      if (input) {
        input.addEventListener("input", () => filterAll(input.value));
        const q = new URLSearchParams(window.location.search).get("q");
        if (q) {
          input.value = q;
          filterAll(q);
        }
      }
    })();
  </script>
</body>
</html>`;
}

function buildDetail(item, sameTypeList, idx, crossList) {
  const isMovie = item.mediaType === "movie";
  const folder = isMovie ? "movie" : "tv";
  const hubName = isMovie ? "Movies" : "TV Shows";
  const schemaType = isMovie ? "Movie" : "TVSeries";
  const url = `${SITE_URL}/${folder}/${item.slug}.html`;
  const year = (item.releaseDate || "").slice(0, 4) || "2026";
  const soon = isFuture(item.releaseDate);
  const prettyDate = formatDate(item.releaseDate);
  const rated = !soon && item.voteAverage > 0 && item.voteCount > 0;
  const castTop = item.cast.slice(0, 10);
  const castBrief = castTop.slice(0, 4).join(", ");
  const genresStr = item.genres.join(", ") || "Entertainment";

  const prev = sameTypeList[(idx - 1 + sameTypeList.length) % sameTypeList.length];
  const next = sameTypeList[(idx + 1) % sameTypeList.length];

  const relHtml = sameTypeList
    .filter((x) => x.id !== item.id)
    .slice(0, 10)
    .map((x) => renderNfCard(x, "../"))
    .join("");

  const crossHtml = crossList.slice(0, 8).map((x) => renderNfCard(x, "../")).join("");

  const regionHtml = REGIONS.map(
    (r) => `
      <div class="nf-reg-card" data-cc="${r.code}">
        <div class="nf-reg-name">${esc(r.name)}</div>
        <p class="nf-reg-val">${esc(providersText(item.watchProviders, r.code, item.releaseDate))}</p>
      </div>`
  ).join("");

  const titleStr = soon
    ? `${item.title} (${year}) Release Date (${prettyDate}), Trailer & Cast | CineVault`
    : `${item.title} (${year}) — Streaming, Trailer, Release Date & Cast | CineVault`;

  const descStr = soon
    ? `${item.title} (${year}) is coming soon on ${prettyDate}. Watch the official trailer, check cast, overview, and streaming updates on CineVault.`
    : `Find where to watch ${item.title} (${year}), watch the official trailer, and view cast, release date (${prettyDate}), and ratings on CineVault.`;

  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
          { "@type": "ListItem", position: 2, name: hubName, item: `${SITE_URL}/${folder}/` },
          { "@type": "ListItem", position: 3, name: `${item.title} (${year})`, item: url }
        ]
      },
      {
        "@type": schemaType,
        name: item.title,
        datePublished: item.releaseDate || undefined,
        description: item.overview,
        image: `https://image.tmdb.org/t/p/w500${item.posterPath}`,
        genre: item.genres,
        ...(rated
          ? {
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: item.voteAverage.toFixed(1),
                bestRating: "10",
                ratingCount: item.voteCount
              }
            }
          : {}),
        actor: castTop.map((name) => ({ "@type": "Person", name })),
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
        url
      },
      {
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: soon ? `When does ${item.title} (${year}) release?` : `Where can I watch ${item.title} (${year})?`,
            acceptedAnswer: {
              "@type": "Answer",
              text: soon
                ? `${item.title} releases on ${prettyDate}.`
                : providersText(item.watchProviders, "US", item.releaseDate)
            }
          },
          {
            "@type": "Question",
            name: `What is ${item.title} (${year}) about?`,
            acceptedAnswer: {
              "@type": "Answer",
              text: `${item.overview}${castBrief ? ` Cast: ${castBrief}.` : ""}`
            }
          }
        ]
      }
    ]
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(titleStr)}</title>
  <meta name="description" content="${esc(descStr)}" />
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
  <link rel="icon" type="image/svg+xml" href="../favicon.svg" />
  <link rel="apple-touch-icon" href="../favicon.svg" />
  <link rel="canonical" href="${esc(url)}" />
  <meta property="og:site_name" content="CineVault" />
  <meta property="og:title" content="${esc(titleStr)}" />
  <meta property="og:description" content="${esc(item.overview)}" />
  <meta property="og:type" content="${isMovie ? "video.movie" : "video.tv_show"}" />
  <meta property="og:url" content="${esc(url)}" />
  <meta property="og:image" content="https://image.tmdb.org/t/p/w500${esc(item.posterPath)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <style>${netflixCss()}</style>
  <script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body>
  <header class="nf-header">
    <div class="nf-nav">
      <a class="nf-logo" href="../index.html"><span class="nf-logo-box">▶</span><span>CINEVAULT</span></a>
      <nav class="nf-links">
        <a class="nf-link" href="../index.html">Home</a>
        <a class="nf-link" href="../index.html#coming-soon">Coming Soon</a>
        <a class="nf-link" href="../movie/index.html">Movies</a>
        <a class="nf-link" href="../tv/index.html">TV Shows</a>
        <a class="nf-link" href="../index.html#anime">Anime</a>
        <a class="nf-link" href="../guides.html">Guides</a>
      </nav>
    </div>
  </header>

  <main class="nf-main">
    <nav class="nf-crumbs">
      <a href="../index.html">Home</a><span>/</span>
      <a href="index.html">${esc(hubName)}</a><span>/</span>
      <span>${esc(item.title)} (${esc(year)})</span>
    </nav>

    <section class="nf-detail-hero">
      <img class="nf-detail-poster" src="https://image.tmdb.org/t/p/w500${esc(item.posterPath)}" alt="${esc(item.title)} (${esc(year)})" width="500" height="750" fetchpriority="high" />
      <div>
        <div class="nf-tags">
          <span class="nf-tag red">${soon ? `COMING SOON • ${esc(prettyDate)}` : esc(item.categoryLabel || hubName)}</span>
          <span class="nf-tag">${esc(prettyDate)}</span>
          ${rated ? `<span class="nf-tag">★ ${item.voteAverage.toFixed(1)}</span>` : ""}
          <span class="nf-tag">${esc(genresStr)}</span>
        </div>
        <h1 class="nf-detail-h1">${esc(item.title)} (${esc(year)})</h1>
        <p class="nf-plot">${esc(item.overview)}</p>
        <a class="btn-white" href="../index.html">← Back to Browse</a>
      </div>
    </section>

    <section class="nf-box">
      <div class="nf-box-head">
        <h2>${soon ? "Release &amp; Streaming Status by Country" : "Where to Watch by Country"}</h2>
        <select id="regSel" class="nf-select" aria-label="Select country">
          ${REGIONS.map((r) => `<option value="${r.code}">${esc(r.name)}</option>`).join("")}
        </select>
      </div>
      <div class="nf-regions" id="regGrid">${regionHtml}</div>
    </section>

    ${
      item.trailerKey
        ? `<section class="nf-box">
            <h2>Official Trailer</h2>
            <div class="nf-video">
              <iframe src="https://www.youtube-nocookie.com/embed/${esc(item.trailerKey)}" title="${esc(item.title)} Trailer" allowfullscreen loading="lazy"></iframe>
            </div>
          </section>`
        : ""
    }

    <div class="nf-ad" aria-label="Sponsored">
      <span class="nf-ad-lbl">Sponsored</span>
      <iframe width="320" height="50" scrolling="no" frameborder="0" loading="lazy" style="border:0;max-width:100%;display:block;" srcdoc="&lt;!DOCTYPE html&gt;&lt;html&gt;&lt;head&gt;&lt;meta charset=&quot;utf-8&quot;&gt;&lt;style&gt;html,body{margin:0;padding:0;background:transparent;overflow:hidden;display:flex;justify-content:center;}&lt;/style&gt;&lt;/head&gt;&lt;body&gt;&lt;script&gt;atOptions={&#39;key&#39;:&#39;b570c351ca5a05131ca8916fc6b23f71&#39;,&#39;format&#39;:&#39;iframe&#39;,&#39;height&#39;:50,&#39;width&#39;:320,&#39;params&#39;:{}};&lt;/script&gt;&lt;script src=&quot;https://bancadeltempoidea.org/22/b570c351ca5a05131ca8916fc6b23f71&quot;&gt;&lt;/script&gt;&lt;/body&gt;&lt;/html&gt;"></iframe>
    </div>

    ${
      castTop.length
        ? `<section class="nf-box">
            <h2>Cast</h2>
            <div class="nf-cast">${castTop.map((c) => `<span class="nf-cast-item">${esc(c)}</span>`).join("")}</div>
          </section>`
        : ""
    }

    <section class="nf-box nf-faq">
      <h2>Quick FAQ</h2>
      <details open>
        <summary>${soon ? `When does ${esc(item.title)} (${esc(year)}) release?` : `Where can I watch ${esc(item.title)} (${esc(year)})?`}</summary>
        <p>${soon ? `Scheduled for ${esc(prettyDate)}.` : esc(providersText(item.watchProviders, "US", item.releaseDate))}</p>
      </details>
      <details>
        <summary>Who stars in ${esc(item.title)}?</summary>
        <p>${esc(castBrief ? `Featuring ${castBrief}.` : "Full credits available on CineVault.")}</p>
      </details>
    </section>

    <section class="nf-box">
      <div class="nf-box-head">
        <h2>More ${esc(hubName)}</h2>
        <a class="nf-see-all" href="index.html">All ${esc(hubName)} →</a>
      </div>
      <div class="nf-track expanded">${relHtml}</div>
    </section>

    ${
      crossHtml
        ? `<section class="nf-box">
            <div class="nf-box-head">
              <h2>Trending Across CineVault</h2>
              <a class="nf-see-all" href="../index.html">Home →</a>
            </div>
            <div class="nf-track expanded">${crossHtml}</div>
          </section>`
        : ""
    }

    <div class="nf-box" style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;">
      <a class="nf-see-all" href="${esc(prev.slug)}.html">← ${esc(prev.title)}</a>
      <a class="nf-see-all" href="${esc(next.slug)}.html">${esc(next.title)} →</a>
    </div>
  </main>

  <footer class="nf-footer">
    <span>CineVault • Updated ${TODAY}</span>
    <span><a href="../index.html">Home</a> · <a href="../movie/index.html">Movies</a> · <a href="../tv/index.html">TV Shows</a> · <a href="../guides.html">Guides</a> · <a href="../sitemap.xml">Sitemap</a></span>
  </footer>

  <script>
    (function () {
      const sel = document.getElementById("regSel");
      const grid = document.getElementById("regGrid");
      if (!sel || !grid) return;
      const lang = (navigator.language || "en-US").toUpperCase();
      const code = ["PK", "GB", "CA", "IN", "AU"].find((c) => lang.endsWith("-" + c)) || "US";
      function apply(c) {
        sel.value = c;
        const cards = Array.from(grid.children);
        cards.forEach((el) => el.classList.toggle("active", el.dataset.cc === c));
        const active = cards.find((el) => el.dataset.cc === c);
        if (active) grid.prepend(active);
      }
      sel.addEventListener("change", () => apply(sel.value));
      apply(code);
    })();
  </script>
</body>
</html>`;
}

function buildHub(mediaType, items) {
  const isMovie = mediaType === "movie";
  const folder = isMovie ? "movie" : "tv";
  const title = isMovie ? "All Movies Catalog" : "All TV Shows & Series Catalog";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)} | CineVault</title>
  <meta name="description" content="Browse ${items.length} ${isMovie ? "movies" : "TV series"} on CineVault with trailers, release dates, cast, and streaming details." />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <link rel="icon" type="image/svg+xml" href="../favicon.svg" />
  <link rel="canonical" href="${SITE_URL}/${folder}/index.html" />
  <style>${netflixCss()}</style>
</head>
<body>
  <header class="nf-header">
    <div class="nf-nav">
      <a class="nf-logo" href="../index.html"><span class="nf-logo-box">▶</span><span>CINEVAULT</span></a>
      <nav class="nf-links">
        <a class="nf-link" href="../index.html">Home</a>
        <a class="nf-link${isMovie ? " active" : ""}" href="../movie/index.html">Movies</a>
        <a class="nf-link${!isMovie ? " active" : ""}" href="../tv/index.html">TV Shows</a>
        <a class="nf-link" href="../guides.html">Guides</a>
      </nav>
    </div>
  </header>
  <main class="nf-main">
    <nav class="nf-crumbs"><a href="../index.html">Home</a><span>/</span><span>${esc(title)}</span></nav>
    <section class="nf-box">
      <h1 style="font-size:1.3rem;font-weight:900;margin-bottom:14px;">${esc(title)} (${items.length})</h1>
      <div class="nf-track expanded">${items.map((x) => renderNfCard(x, "../")).join("")}</div>
    </section>
  </main>
  <footer class="nf-footer">
    <span>CineVault • Updated ${TODAY}</span>
    <span><a href="../index.html">Home</a> · <a href="../movie/index.html">Movies</a> · <a href="../tv/index.html">TV Shows</a> · <a href="../guides.html">Guides</a></span>
  </footer>
</body>
</html>`;
}

async function fetchDetails(mediaType, raw, categoryLabel) {
  const d = await tmdb(`/${mediaType}/${raw.id}?append_to_response=credits,videos,watch/providers`);
  const title = d.title || d.name || raw.title || raw.name;
  const releaseDate = d.release_date || d.first_air_date || "";
  const vids = d.videos?.results || [];
  const trailer =
    vids.find((v) => v.site === "YouTube" && v.type === "Trailer" && v.official) ||
    vids.find((v) => v.site === "YouTube" && v.type === "Trailer") ||
    vids.find((v) => v.site === "YouTube");

  return {
    id: raw.id,
    mediaType,
    categoryLabel,
    title,
    slug: `${slugify(title)}-${raw.id}`,
    releaseDate,
    overview: (
      d.overview ||
      `Explore streaming guide, official trailer, release date, and cast for ${title} on CineVault.`
    ).trim(),
    posterPath: d.poster_path || raw.poster_path,
    backdropPath: d.backdrop_path || raw.backdrop_path || "",
    voteAverage: Number(d.vote_average || 0),
    voteCount: Number(d.vote_count || 0),
    genres: (d.genres || []).map((g) => g.name),
    cast: (d.credits?.cast || []).slice(0, 10).map((c) => c.name),
    trailerKey: trailer ? trailer.key : "",
    watchProviders: d["watch/providers"]?.results || {}
  };
}

function uniqueRaw(list, limit) {
  const map = new Map();
  for (const x of list) {
    if (x?.id && x?.poster_path && !map.has(x.id)) {
      map.set(x.id, x);
      if (map.size >= limit) break;
    }
  }
  return Array.from(map.values());
}

async function runPool(items, concurrency, worker) {
  const results = [];
  let i = 0;
  async function next() {
    while (i < items.length) {
      const idx = i++;
      results.push(await worker(items[idx]));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next));
  return results;
}

async function main() {
  await fs.mkdir("movie", { recursive: true });
  await fs.mkdir("tv", { recursive: true });

  // Brand favicon (red square + crisp white play icon)
  const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="20" fill="#e50914"/><polygon points="38,27 72,48 38,69" fill="#ffffff"/></svg>`;
  await fs.writeFile("favicon.svg", favicon, "utf8");

  const [
    trendMovRaw,
    trendTvRaw,
    upcomingRaw,
    topRatedMovRaw,
    actionMovRaw,
    scifiMovRaw,
    comedyMovRaw,
    horrorMovRaw,
    dramaMovRaw,
    popTvRaw,
    netflixTvRaw,
    animeTvRaw
  ] = await Promise.all([
    fetchPages("/trending/movie/week", [1, 2]),
    fetchPages("/trending/tv/week", [1, 2]),
    fetchPages("/movie/upcoming?region=US", [1, 2]),
    fetchPages("/movie/top_rated?without_genres=16", [1, 2]),
    fetchPages("/discover/movie?with_genres=28&sort_by=popularity.desc&without_genres=16", [1, 2]),
    fetchPages("/discover/movie?with_genres=878&sort_by=popularity.desc", [1, 2]),
    fetchPages("/discover/movie?with_genres=35&sort_by=popularity.desc&without_genres=16", [1, 2]),
    fetchPages("/discover/movie?with_genres=27&sort_by=popularity.desc", [1, 2]),
    fetchPages("/discover/movie?with_genres=18&sort_by=popularity.desc&without_genres=16", [1, 2]),
    fetchPages("/tv/popular?without_genres=16", [1, 2]),
    fetchPages("/discover/tv?with_networks=213&sort_by=popularity.desc&without_genres=16", [1, 2]),
    fetchPages("/discover/tv?with_genres=16&with_original_language=ja&sort_by=popularity.desc", [1, 2])
  ]);

  const movieMap = new Map();
  const tvMap = new Map();

  async function hydrate(mediaType, rawList, tag) {
    const cache = mediaType === "movie" ? movieMap : tvMap;
    const missing = rawList.filter((x) => !cache.has(x.id));
    if (missing.length) {
      const built = await runPool(missing, 6, (r) => fetchDetails(mediaType, r, tag));
      for (const item of built) {
        cache.set(item.id, item);
      }
    }
    return rawList.map((r) => cache.get(r.id)).filter(Boolean);
  }

  const trendingMov = await hydrate("movie", uniqueRaw(trendMovRaw, 24), "Trending Now");
  const trendingTv = await hydrate("tv", uniqueRaw(trendTvRaw, 20), "Trending Now");
  const soonFuture = upcomingRaw.filter((m) => isFuture(m.release_date));
  const comingSoon = await hydrate("movie", uniqueRaw(soonFuture.length ? soonFuture : upcomingRaw, 24), "Coming Soon");
  const topRated = await hydrate("movie", uniqueRaw(topRatedMovRaw, 24), "Critically Acclaimed");
  const actionMov = await hydrate("movie", uniqueRaw(actionMovRaw, 24), "Action & Thrillers");
  const scifiMov = await hydrate("movie", uniqueRaw(scifiMovRaw, 24), "Sci-Fi & Fantasy");
  const comedyMov = await hydrate("movie", uniqueRaw(comedyMovRaw, 24), "Comedies");
  const horrorMov = await hydrate("movie", uniqueRaw(horrorMovRaw, 24), "Horror & Suspense");
  const dramaMov = await hydrate("movie", uniqueRaw(dramaMovRaw, 24), "Dramas");
  const popTv = await hydrate("tv", uniqueRaw(popTvRaw, 24), "Popular TV Shows");
  const netflixTv = await hydrate("tv", uniqueRaw(netflixTvRaw, 24), "Netflix Originals");
  const animeTv = await hydrate("tv", uniqueRaw(animeTvRaw, 24), "Anime");

  const allMovies = Array.from(movieMap.values());
  const allTv = Array.from(tvMap.values());

  const comingSoonAll = Array.from(
    new Map(
      [...comingSoon, ...allMovies.filter((m) => isFuture(m.releaseDate))].map((x) => [x.id, x])
    ).values()
  );

  const billboard = trendingMov[0] || comingSoonAll[0] || allMovies[0];

  const categories = [
    { id: "trending-now", shortTitle: "Trending Now", title: "Trending Now", hubHref: "movie/index.html", items: [...trendingMov.slice(0, 14), ...trendingTv.slice(0, 10)] },
    { id: "coming-soon", shortTitle: "Coming Soon", title: "Coming Soon", hubHref: "movie/index.html", items: comingSoonAll },
    { id: "popular-tv", shortTitle: "TV Shows", title: "Popular TV Shows", hubHref: "tv/index.html", items: popTv },
    { id: "netflix-originals", shortTitle: "Netflix", title: "Netflix Originals & Series", hubHref: "tv/index.html", items: netflixTv },
    { id: "action-thrillers", shortTitle: "Action", title: "Action & Thrillers", hubHref: "movie/index.html", items: actionMov },
    { id: "scifi-fantasy", shortTitle: "Sci-Fi", title: "Sci-Fi & Fantasy", hubHref: "movie/index.html", items: scifiMov },
    { id: "comedies", shortTitle: "Comedy", title: "Comedies", hubHref: "movie/index.html", items: comedyMov },
    { id: "horror-suspense", shortTitle: "Horror", title: "Horror & Suspense", hubHref: "movie/index.html", items: horrorMov },
    { id: "dramas", shortTitle: "Drama", title: "Dramas", hubHref: "movie/index.html", items: dramaMov },
    { id: "top-rated", shortTitle: "Top Rated", title: "Top Rated Movies", hubHref: "movie/index.html", items: topRated },
    { id: "anime", shortTitle: "Anime", title: "Anime", hubHref: "tv/index.html", items: animeTv }
  ];

  await runPool(allMovies, 12, async (m) => {
    const idx = allMovies.indexOf(m);
    await fs.writeFile(path.join("movie", `${m.slug}.html`), buildDetail(m, allMovies, idx, trendingTv.slice(0, 8)), "utf8");
  });

  await runPool(allTv, 12, async (t) => {
    const idx = allTv.indexOf(t);
    await fs.writeFile(path.join("tv", `${t.slug}.html`), buildDetail(t, allTv, idx, trendingMov.slice(0, 8)), "utf8");
  });

  await fs.writeFile(path.join("movie", "index.html"), buildHub("movie", allMovies), "utf8");
  await fs.writeFile(path.join("tv", "index.html"), buildHub("tv", allTv), "utf8");
  await fs.writeFile("index.html", buildHome(categories, allMovies, allTv, billboard), "utf8");
  await fs.writeFile("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`, "utf8");

  const urls = [
    { loc: `${SITE_URL}/`, priority: "1.0", changefreq: "daily" },
    { loc: `${SITE_URL}/guides.html`, priority: "0.9", changefreq: "weekly" },
    { loc: `${SITE_URL}/movie/index.html`, priority: "0.9", changefreq: "daily" },
    { loc: `${SITE_URL}/tv/index.html`, priority: "0.9", changefreq: "daily" },
    ...allMovies.map((m) => ({
      loc: `${SITE_URL}/movie/${m.slug}.html`,
      priority: isFuture(m.releaseDate) ? "0.85" : "0.8",
      changefreq: "weekly"
    })),
    ...allTv.map((t) => ({
      loc: `${SITE_URL}/tv/${t.slug}.html`,
      priority: "0.8",
      changefreq: "weekly"
    }))
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map(
      (u) =>
        `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
    )
    .join("\n")}\n</urlset>\n`;
  await fs.writeFile("sitemap.xml", xml, "utf8");

  console.log(`Generated ${allMovies.length} movies + ${allTv.length} TV shows (${urls.length} sitemap URLs).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
