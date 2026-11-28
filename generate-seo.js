// generate-seo.js (Node.js 20+ with built-in fetch)
import fs from "node:fs";
import path from "node:path";

const SITE_URL = "https://cinevault.space";
const API_KEY = process.env.TMDB_API_KEY;
const BATCH_LIMIT = Math.max(10, Math.min(100, Number(process.env.BATCH_LIMIT || 40)));

if (!API_KEY) {
  console.error("Missing TMDB_API_KEY environment variable.");
  process.exit(1);
}

const GENRE_HUBS = [
  { slug: "trending", label: "Trending Now", kind: "trending" },
  { slug: "coming-soon", label: "Coming Soon", kind: "upcoming" },
  { slug: "shows", label: "Popular Shows", kind: "shows" },
  { slug: "anime", label: "Anime", kind: "tv", genreId: 16, lang: "ja" },
  { slug: "action", label: "Action", kind: "movie", genreId: 28 },
  { slug: "sci-fi", label: "Sci-Fi & Fantasy", kind: "movie", genreId: 878 },
  { slug: "thrillers", label: "Thrillers", kind: "movie", genreId: 53 },
  { slug: "crime", label: "Crime Series", kind: "tv", genreId: 80 },
  { slug: "drama", label: "Drama", kind: "movie", genreId: 18 },
  { slug: "comedy", label: "Comedy", kind: "movie", genreId: 35 },
  { slug: "horror", label: "Horror", kind: "movie", genreId: 27 },
  { slug: "documentaries", label: "Documentaries", kind: "movie", genreId: 99 }
];

const STREAM_URLS = {
  "Netflix": "https://www.netflix.com/",
  "Amazon Prime Video": "https://www.primevideo.com/",
  "Apple TV+": "https://tv.apple.com/",
  "Apple TV": "https://tv.apple.com/",
  "Disney Plus": "https://www.disneyplus.com/",
  "Crunchyroll": "https://www.crunchyroll.com/",
  "Max": "https://www.max.com/",
  "Hulu": "https://www.hulu.com/"
};

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

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function tmdb(endpoint, params = {}) {
  const url = new URL(`https://api.themoviedb.org/3${endpoint}`);
  url.searchParams.set("api_key", API_KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB ${endpoint} -> ${res.status}`);
  return res.json();
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function hubNavHtml(activeSlug = "") {
  return GENRE_HUBS.map((h) => {
    const cls = h.slug === activeSlug ? ' class="hub-chip active"' : ' class="hub-chip"';
    return `<a href="/category/${esc(h.slug)}.html"${cls}>${esc(h.label)}</a>`;
  }).join("\n        ");
}

function renderTitlePage(item, relatedItems, primaryHub) {
  const folder = item.media_type === "tv" ? "tv" : "movie";
  const slug = `${slugify(item.title)}-${item.id}`;
  const canonical = `${SITE_URL}/${folder}/${slug}.html`;
  const poster = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "";
  const backdrop = item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : poster;
  const dateStr = item.release_date || item.first_air_date || "Upcoming";
  const year = dateStr.slice(0, 4) || "2026";
  const trailer = (item.videos?.results || []).find((v) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser"));
  const cast = (item.credits?.cast || []).slice(0, 8);

  const providerSet = new Map();
  for (const block of Object.values(item["watch/providers"]?.results || {})) {
    for (const p of [...(block.flatrate || []), ...(block.free || []), ...(block.rent || []), ...(block.buy || [])]) {
      if (p.provider_name && !providerSet.has(p.provider_name)) {
        providerSet.set(p.provider_name, STREAM_URLS[p.provider_name] || `https://www.google.com/search?q=${encodeURIComponent(`watch ${item.title} on ${p.provider_name}`)}`);
      }
    }
  }
  if (!providerSet.size) {
    providerSet.set("Netflix", "https://www.netflix.com/");
    providerSet.set("Amazon Prime Video", "https://www.primevideo.com/");
    providerSet.set("Apple TV", "https://tv.apple.com/");
  }

  const streamButtons = Array.from(providerSet.entries())
    .slice(0, 6)
    .map(([name, href]) => `<a class="stream-btn" href="${esc(href)}" target="_blank" rel="noopener noreferrer sponsored">${esc(name)} ↗</a>`)
    .join("\n          ");

  const relatedHtml = relatedItems.slice(0, 6).map((rel) => {
    const rFolder = rel.media_type === "tv" ? "tv" : "movie";
    const rSlug = `${slugify(rel.title || rel.name)}-${rel.id}`;
    const rPoster = rel.poster_path ? `https://image.tmdb.org/t/p/w342${rel.poster_path}` : "";
    return `<a class="rel-card" href="/${rFolder}/${rSlug}.html">${rPoster ? `<img src="${esc(rPoster)}" alt="${esc(rel.title || rel.name)} poster" loading="lazy" />` : ""}<span>${esc(rel.title || rel.name)}</span></a>`;
  }).join("\n          ");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": item.media_type === "tv" ? "TVSeries" : "Movie",
    name: item.title || item.name,
    description: item.overview || "",
    image: poster || undefined,
    datePublished: item.release_date || item.first_air_date || undefined,
    url: canonical
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(item.title || item.name)} (${esc(year)}) — Where to Watch &amp; Details | CineVault</title>
  <meta name="description" content="${esc((item.overview || `Watch ${item.title || item.name} (${year}) on CineVault.`).slice(0, 158))}" />
  <link rel="canonical" href="${esc(canonical)}" />
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  <style>
    :root { --bg:#050608; --surface:#131722; --surface-2:#1b2130; --text:#f6f8fc; --muted:#a4afc6; --accent:#e50914; --gold:#f5c518; --border:rgba(255,255,255,0.1); --max:1200px; }
    * { box-sizing:border-box; margin:0; padding:0; }
    body { background:var(--bg); color:var(--text); font-family:system-ui,-apple-system,sans-serif; line-height:1.55; }
    a { color:inherit; text-decoration:none; }
    header { position:sticky; top:0; z-index:20; background:rgba(5,6,8,0.94); backdrop-filter:blur(12px); border-bottom:1px solid var(--border); }
    .nav { max-width:var(--max); margin:0 auto; padding:12px 18px; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
    .brand { font-weight:900; font-size:1.2rem; text-transform:uppercase; }
    .brand span { color:var(--accent); }
    main { max-width:var(--max); margin:0 auto; padding:20px 18px 56px; }
    .crumb { font-size:0.82rem; color:var(--muted); margin-bottom:14px; display:flex; gap:6px; flex-wrap:wrap; }
    .crumb a:hover { color:#fff; text-decoration:underline; }
    .hero { display:grid; grid-template-columns:180px 1fr; gap:22px; background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:18px; margin-bottom:20px; }
    .poster { width:100%; aspect-ratio:2/3; object-fit:cover; border-radius:10px; background:var(--surface-2); }
    h1 { font-size:clamp(1.5rem,3vw,2.2rem); font-weight:900; line-height:1.15; }
    .meta { display:flex; gap:10px; flex-wrap:wrap; margin:8px 0 12px; font-size:0.84rem; color:var(--muted); }
    .gold { color:var(--gold); font-weight:700; }
    .streams { display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; }
    .stream-btn { padding:8px 14px; border-radius:8px; background:var(--accent); color:#fff; font-size:0.84rem; font-weight:700; }
    .box { background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:16px; margin-bottom:18px; }
    .box h2 { font-size:1.05rem; font-weight:800; margin-bottom:10px; }
    .rel-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(135px,1fr)); gap:12px; }
    .rel-card { background:var(--surface-2); border:1px solid var(--border); border-radius:9px; overflow:hidden; display:flex; flex-direction:column; font-size:0.8rem; font-weight:700; }
    .rel-card img { width:100%; aspect-ratio:2/3; object-fit:cover; }
    .rel-card span { padding:7px 8px; }
    .hub-bar { display:flex; flex-wrap:wrap; gap:7px; }
    .hub-chip { padding:5px 11px; border-radius:999px; background:var(--surface-2); border:1px solid var(--border); font-size:0.78rem; font-weight:600; }
    .hub-chip.active { background:var(--accent); border-color:var(--accent); color:#fff; }
    iframe.yt { width:100%; aspect-ratio:16/9; max-width:680px; border:0; border-radius:10px; background:#000; }
    @media (max-width:640px) { .hero { grid-template-columns:104px 1fr; gap:14px; padding:14px; } .rel-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
  </style>
</head>
<body>
  <header>
    <div class="nav">
      <a class="brand" href="/"><span>▶</span> CineVault</a>
      <nav><a href="/">Home</a> • <a href="/category/shows.html">Shows</a> • <a href="/category/coming-soon.html">Coming Soon</a></nav>
    </div>
  </header>
  <main>
    <nav class="crumb" aria-label="Breadcrumb">
      <a href="/">Home</a> <span>/</span>
      <a href="/category/${esc(primaryHub.slug)}.html">${esc(primaryHub.label)}</a> <span>/</span>
      <span>${esc(item.title || item.name)}</span>
    </nav>
    <section class="hero">
      ${poster ? `<img class="poster" src="${esc(poster)}" alt="${esc(item.title || item.name)} poster" />` : `<div class="poster"></div>`}
      <div>
        <h1>${esc(item.title || item.name)}</h1>
        <div class="meta">
          <span class="gold">★ ${Number(item.vote_average || 0).toFixed(1)}</span>
          <span>${esc(dateStr)}</span>
          <span>${item.media_type === "tv" ? "TV Show" : "Movie"}</span>
        </div>
        <p>${esc(item.overview || "Synopsis coming soon.")}</p>
        <div class="streams">${streamButtons}</div>
      </div>
    </section>
    ${trailer ? `<section class="box"><h2>Official Trailer</h2><iframe class="yt" src="https://www.youtube.com/embed/${esc(trailer.key)}" allowfullscreen loading="lazy" title="${esc(item.title || item.name)} trailer"></iframe></section>` : ""}
    ${cast.length ? `<section class="box"><h2>Cast</h2><p>${cast.map((c) => esc(c.name)).join(" • ")}</p></section>` : ""}
    <section class="box">
      <h2>More in ${esc(primaryHub.label)}</h2>
      <div class="rel-grid">${relatedHtml}</div>
    </section>
    <section class="box">
      <h2>Browse All Categories</h2>
      <div class="hub-bar">${hubNavHtml(primaryHub.slug)}</div>
    </section>
  </main>
</body>
</html>`;
}

function renderCategoryHubPage(hub, items) {
  const canonical = `${SITE_URL}/category/${hub.slug}.html`;
  const cards = items.map((it) => {
    const folder = it.media_type === "tv" ? "tv" : "movie";
    const slug = `${slugify(it.title || it.name)}-${it.id}`;
    const poster = it.poster_path ? `https://image.tmdb.org/t/p/w342${it.poster_path}` : "";
    return `<a class="card" href="/${folder}/${slug}.html">${poster ? `<img src="${esc(poster)}" alt="${esc(it.title || it.name)} poster" loading="lazy" />` : ""}<div class="body"><h3>${esc(it.title || it.name)}</h3><span>${esc((it.release_date || it.first_air_date || "2026").slice(0, 4))}</span></div></a>`;
  }).join("\n        ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(hub.label)} — Movies &amp; Shows | CineVault</title>
  <meta name="description" content="Explore ${esc(hub.label)} titles on CineVault with streaming platforms, release dates, and reviews." />
  <link rel="canonical" href="${esc(canonical)}" />
  <style>
    :root { --bg:#050608; --surface:#131722; --surface-2:#1b2130; --text:#f6f8fc; --muted:#a4afc6; --accent:#e50914; --border:rgba(255,255,255,0.1); --max:1280px; }
    * { box-sizing:border-box; margin:0; padding:0; }
    body { background:var(--bg); color:var(--text); font-family:system-ui,-apple-system,sans-serif; }
    a { color:inherit; text-decoration:none; }
    header { position:sticky; top:0; background:rgba(5,6,8,0.94); border-bottom:1px solid var(--border); }
    .nav { max-width:var(--max); margin:0 auto; padding:12px 18px; display:flex; align-items:center; justify-content:space-between; gap:12px; }
    .brand { font-weight:900; font-size:1.2rem; text-transform:uppercase; }
    .brand span { color:var(--accent); }
    main { max-width:var(--max); margin:0 auto; padding:20px 18px 56px; }
    h1 { font-size:1.7rem; font-weight:900; margin-bottom:12px; }
    .hub-bar { display:flex; flex-wrap:wrap; gap:7px; margin-bottom:20px; }
    .hub-chip { padding:6px 12px; border-radius:999px; background:var(--surface); border:1px solid var(--border); font-size:0.8rem; font-weight:600; }
    .hub-chip.active { background:var(--accent); border-color:var(--accent); color:#fff; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:14px; }
    .card { background:var(--surface); border:1px solid var(--border); border-radius:10px; overflow:hidden; display:flex; flex-direction:column; }
    .card img { width:100%; aspect-ratio:2/3; object-fit:cover; }
    .body { padding:9px 10px; }
    .body h3 { font-size:0.86rem; font-weight:700; line-height:1.25; }
    .body span { font-size:0.74rem; color:var(--muted); }
    @media (max-width:640px) { .grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; } }
  </style>
</head>
<body>
  <header>
    <div class="nav">
      <a class="brand" href="/"><span>▶</span> CineVault</a>
      <a href="/">← Back to Home</a>
    </div>
  </header>
  <main>
    <h1>${esc(hub.label)}</h1>
    <div class="hub-bar">${hubNavHtml(hub.slug)}</div>
    <section class="grid">${cards}</section>
  </main>
</body>
</html>`;
}

async function run() {
  ensureDir("movie");
  ensureDir("tv");
  ensureDir("category");

  const hubLists = {};
  const collected = new Map();

  for (const hub of GENRE_HUBS) {
    try {
      let data;
      if (hub.kind === "trending") data = await tmdb("/trending/all/week", { page: 1 });
      else if (hub.kind === "upcoming") data = await tmdb("/movie/upcoming", { page: 1 });
      else if (hub.kind === "shows") data = await tmdb("/tv/popular", { page: 1 });
      else data = await tmdb(`/discover/${hub.kind}`, { page: 1, with_genres: hub.genreId, ...(hub.lang ? { with_original_language: hub.lang } : {}), sort_by: "popularity.desc" });

      const rows = (data.results || [])
        .filter((r) => r && r.media_type !== "person" && (r.title || r.name))
        .map((r) => ({ ...r, media_type: hub.kind === "tv" || hub.kind === "shows" ? "tv" : r.media_type || (r.name && !r.title ? "tv" : "movie"), primaryHub: hub }));

      hubLists[hub.slug] = rows;
      for (const item of rows) {
        const key = `${item.media_type}-${item.id}`;
        if (!collected.has(key)) collected.set(key, item);
      }
    } catch (err) {
      console.warn(`Hub fetch warning (${hub.slug}):`, err.message);
      hubLists[hub.slug] = [];
    }
  }

  for (const hub of GENRE_HUBS) {
    fs.writeFileSync(path.join("category", `${hub.slug}.html`), renderCategoryHubPage(hub, hubLists[hub.slug] || []), "utf8");
  }

  const urls = [`${SITE_URL}/`, ...GENRE_HUBS.map((h) => `${SITE_URL}/category/${h.slug}.html`)];
  const batch = Array.from(collected.values()).slice(0, BATCH_LIMIT);

  for (const baseItem of batch) {
    try {
      const detail = await tmdb(`/${baseItem.media_type}/${baseItem.id}`, {
        append_to_response: "videos,credits,watch/providers"
      });
      const fullItem = { ...baseItem, ...detail, media_type: baseItem.media_type };
      const folder = fullItem.media_type === "tv" ? "tv" : "movie";
      const fileName = `${slugify(fullItem.title || fullItem.name)}-${fullItem.id}.html`;
      const related = (hubLists[baseItem.primaryHub.slug] || []).filter((x) => x.id !== fullItem.id);
      fs.writeFileSync(path.join(folder, fileName), renderTitlePage(fullItem, related, baseItem.primaryHub), "utf8");
      urls.push(`${SITE_URL}/${folder}/${fileName}`);
    } catch (err) {
      console.warn(`Detail fetch skipped (${baseItem.id}):`, err.message);
    }
  }

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${esc(u)}</loc></url>`).join("\n")}\n</urlset>\n`;
  fs.writeFileSync("sitemap.xml", sitemap, "utf8");
  fs.writeFileSync("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`, "utf8");
  console.log(`Generated ${urls.length} URLs (categories + titles).`);
}

run();
