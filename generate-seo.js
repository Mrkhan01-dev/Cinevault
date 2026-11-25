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
  return String(str || "title")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "title";
}

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function tmdb(endpoint) {
  const sep = endpoint.includes("?") ? "&" : "?";
  const res = await fetch(`https://api.themoviedb.org/3${endpoint}${sep}api_key=${TMDB_KEY}`);
  if (!res.ok) throw new Error(`TMDB HTTP ${res.status} for ${endpoint}`);
  return res.json();
}

function formatProviders(watchResults, regionCode, releaseDate) {
  const entry = watchResults?.[regionCode];
  if (!entry) {
    return releaseDate && releaseDate > TODAY
      ? `Scheduled for release (${releaseDate}); streaming & VOD follow.`
      : `Check local digital VOD & subscription listings.`;
  }
  const stream = (entry.flatrate || []).map((p) => p.provider_name);
  const rentBuy = [...(entry.rent || []), ...(entry.buy || [])]
    .map((p) => p.provider_name)
    .filter((v, i, a) => a.indexOf(v) === i);

  const parts = [];
  if (stream.length) parts.push(`Stream: ${stream.slice(0, 4).join(", ")}`);
  if (rentBuy.length) parts.push(`Rent/Buy: ${rentBuy.slice(0, 3).join(", ")}`);
  return parts.length ? parts.join(" • ") : `Available via regional digital storefronts.`;
}

function sharedStyles() {
  return `
    :root{--bg:#090b10;--surface:#111520;--surface-2:#181e2e;--text:#f3f6fc;--muted:#a3aec6;--accent:#e50914;--accent-hover:#ff1e2d;--gold:#f5b942;--border:rgba(255,255,255,.1);--max:1020px}
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:radial-gradient(circle at top right,#181c2e 0%,var(--bg) 55%);color:var(--text);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1.65;-webkit-font-smoothing:antialiased}
    a{color:inherit;text-decoration:none}
    header{position:sticky;top:0;z-index:40;backdrop-filter:blur(14px);background:rgba(9,11,16,.94);border-bottom:1px solid var(--border)}
    .nav{max-width:var(--max);margin:0 auto;padding:13px 20px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
    .brand{display:flex;align-items:center;gap:10px;font-weight:800;font-size:1.15rem}
    .badge{width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,var(--accent),#99040c);display:grid;place-items:center;font-size:.85rem;color:#fff}
    .nav-links{display:flex;gap:8px;flex-wrap:wrap}
    .nav-btn{padding:7px 13px;border-radius:999px;background:var(--surface-2);border:1px solid var(--border);font-size:.82rem;font-weight:600}
    .nav-btn:hover{border-color:rgba(255,255,255,.28);background:#20283d}
    main{max-width:var(--max);margin:0 auto;padding:18px 20px 60px}
    .breadcrumbs{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:.8rem;color:var(--muted);margin-bottom:14px}
    .breadcrumbs a:hover{color:var(--text);text-decoration:underline}
    .hero-grid{position:relative;overflow:hidden;display:grid;grid-template-columns:220px 1fr;gap:24px;border:1px solid var(--border);border-radius:18px;padding:24px;margin-bottom:20px}
    @media(max-width:680px){.hero-grid{grid-template-columns:1fr;padding:18px;gap:18px}.poster{max-width:195px;margin:0 auto}}
    .poster{width:100%;height:auto;aspect-ratio:2/3;border-radius:12px;display:block;border:1px solid var(--border);box-shadow:0 12px 30px rgba(0,0,0,.55);background:var(--surface-2)}
    .type-tag{display:inline-block;font-size:.72rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#fff;background:var(--accent);padding:3px 10px;border-radius:6px;margin-bottom:8px}
    h1{font-size:clamp(1.45rem,3vw,2.05rem);line-height:1.22;margin-bottom:10px}
    .meta{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;font-size:.82rem;color:var(--gold);font-weight:600}
    .meta span{background:rgba(24,30,46,.92);padding:4px 10px;border-radius:8px;border:1px solid var(--border)}
    .overview{color:#e2e8f5;font-size:.95rem;margin-bottom:16px}
    .cta{display:inline-block;padding:10px 18px;border-radius:10px;background:var(--accent);color:#fff;font-weight:700;font-size:.88rem}
    .card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:20px;margin-bottom:18px}
    .card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px}
    .card h2{font-size:1.15rem}
    .card-lead{color:#d5deef;font-size:.91rem;margin-bottom:14px}
    select.region-select{background:var(--surface-2);color:var(--text);border:1px solid var(--border);padding:6px 12px;border-radius:8px;font-size:.84rem;font-weight:600}
    .region-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
    .region-box{background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:12px 14px}
    .region-box.active-region{border-color:var(--gold)}
    .region-title{font-size:.85rem;font-weight:700;color:var(--gold);margin-bottom:4px}
    .region-note{font-size:.83rem;color:var(--muted)}
    .pills{display:flex;flex-wrap:wrap;gap:8px}
    .pill{background:var(--surface-2);border:1px solid var(--border);padding:6px 12px;border-radius:999px;font-size:.84rem;font-weight:600}
    .faq-item{border-top:1px solid var(--border);padding:12px 0}
    .faq-item:first-of-type{border-top:0;padding-top:2px}
    .faq-item:last-of-type{padding-bottom:0}
    .faq-item summary{font-weight:700;font-size:.93rem;cursor:pointer}
    .faq-item p{margin-top:6px;font-size:.88rem;color:var(--muted)}
    .related-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(145px,1fr));gap:12px}
    .rel-card{background:var(--surface-2);border:1px solid var(--border);border-radius:12px;overflow:hidden;display:block}
    .rel-card img{width:100%;aspect-ratio:2/3;object-fit:cover;display:block}
    .rel-title{padding:8px 10px;font-size:.82rem;font-weight:700;line-height:1.3}
    .rel-sub{padding:0 10px 8px;font-size:.74rem;color:var(--gold)}
    .pager{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px}
    .pager a{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 14px;font-size:.84rem;font-weight:700}
    .video-wrap{position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;background:#050608}
    .video-wrap iframe{position:absolute;top:0;left:0;width:100%;height:100%;border:0}
    .ad-strip{margin:18px auto;padding:10px 14px;background:rgba(17,21,32,.92);border:1px solid var(--border);border-radius:14px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;min-height:72px}
    .ad-label{font-size:.66rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);background:var(--surface-2);border:1px solid var(--border);padding:3px 9px;border-radius:999px}
    footer{max-width:var(--max);margin:0 auto;padding:20px;border-top:1px solid var(--border);color:var(--muted);font-size:.82rem;display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px}
  `;
}

function buildDetailPage(item, allOfSameType, indexInList) {
  const isMovie = item.mediaType === "movie";
  const folder = isMovie ? "movie" : "tv";
  const hubLabel = isMovie ? "Movies" : "TV Series";
  const schemaType = isMovie ? "Movie" : "TVSeries";
  const pageUrl = `${SITE_URL}/${folder}/${item.slug}.html`;
  const year = (item.releaseDate || "").slice(0, 4) || "2026";
  const hasRating = item.voteAverage > 0 && item.voteCount > 0;
  const ratingLabel = hasRating
    ? `★ ${item.voteAverage.toFixed(1)} (${item.voteCount.toLocaleString()} votes)`
    : item.releaseDate
    ? `Release: ${item.releaseDate}`
    : "Trending Release";
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
    .map(
      (r) => `
        <a class="rel-card" href="${esc(r.slug)}.html">
          <img src="https://image.tmdb.org/t/p/w342${esc(r.posterPath)}" alt="${esc(r.title)} (${esc((r.releaseDate || "2026").slice(0, 4))}) poster" loading="lazy" />
          <div class="rel-title">${esc(r.title)} (${esc((r.releaseDate || "2026").slice(0, 4))})</div>
          <div class="rel-sub">${r.voteAverage > 0 ? `★ ${r.voteAverage.toFixed(1)}` : esc(r.releaseDate || "2026")}</div>
        </a>`
    )
    .join("");

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
      ...(hasRating ? { aggregateRating: { "@type": "AggregateRating", ratingValue: item.voteAverage.toFixed(1), bestRating: "10", ratingCount: item.voteCount } } : {}),
      actor: topCast.map((name) => ({ "@type": "Person", name })),
      ...(item.trailerKey ? {
        trailer: {
          "@type": "VideoObject",
          name: `${item.title} Official Trailer`,
          description: `Official trailer for ${item.title} (${year}).`,
          thumbnailUrl: `https://image.tmdb.org/t/p/w1280${item.backdropPath || item.posterPath}`,
          embedUrl: `https://www.youtube.com/embed/${item.trailerKey}`,
          uploadDate: item.releaseDate || TODAY
        }
      } : {}),
      url: pageUrl
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: `Where can I watch ${item.title} (${year}) online?`,
          acceptedAnswer: { "@type": "Answer", text: `${formatProviders(item.watchProviders, "US", item.releaseDate)}` }
        },
        {
          "@type": "Question",
          name: `When was ${item.title} released?`,
          acceptedAnswer: { "@type": "Answer", text: `${item.title} has a release date of ${item.releaseDate || year} (${genresText}).` }
        },
        {
          "@type": "Question",
          name: `Who stars in ${item.title}?`,
          acceptedAnswer: { "@type": "Answer", text: castLead ? `Featured cast includes ${castLead}.` : `Cast details are updated from TMDB.` }
        }
      ]
    }
  ];

  const heroBg = item.backdropPath
    ? `linear-gradient(135deg, rgba(9,11,16,0.95) 38%, rgba(17,21,32,0.84) 100%), url('https://image.tmdb.org/t/p/w1280${item.backdropPath}') center/cover no-repeat`
    : `linear-gradient(135deg, #0d1220 0%, #171e31 100%)`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Where to Watch ${esc(item.title)} (${esc(year)}) — Streaming, Trailer &amp; Cast | CineVault</title>
  <meta name="description" content="Find where to stream ${esc(item.title)} (${esc(year)}) online, watch the official trailer, and explore full cast, release date (${esc(item.releaseDate || year)}), and ratings on CineVault." />
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
  <link rel="icon" type="image/svg+xml" href="../favicon.svg" />
  <link rel="apple-touch-icon" href="../favicon.svg" />
  <link rel="canonical" href="${esc(pageUrl)}" />
  <meta property="og:site_name" content="CineVault" />
  <meta property="og:title" content="Where to Watch ${esc(item.title)} (${esc(year)}) — Trailer, Cast &amp; Streaming | CineVault" />
  <meta property="og:description" content="${esc(item.overview)}" />
  <meta property="og:type" content="${isMovie ? "video.movie" : "video.tv_show"}" />
  <meta property="og:url" content="${esc(pageUrl)}" />
  <meta property="og:image" content="https://image.tmdb.org/t/p/w500${esc(item.posterPath)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <style>${sharedStyles()}</style>
  <script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph })}</script>
</head>
<body>
  <header>
    <div class="nav">
      <a class="brand" href="../index.html"><span class="badge">▶</span><span>CineVault</span></a>
      <nav class="nav-links" aria-label="Main Navigation">
        <a class="nav-btn" href="../index.html">Home</a>
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
      <img class="poster" src="https://image.tmdb.org/t/p/w500${esc(item.posterPath)}" alt="${esc(item.title)} (${esc(year)}) poster" width="500" height="750" fetchpriority="high" />
      <div>
        <span class="type-tag">${isMovie ? "Movie" : "TV Series"}</span>
        <h1>Where to Watch ${esc(item.title)} (${esc(year)})</h1>
        <div class="meta">
          <span>${esc(ratingLabel)}</span>
          <span>${esc(year)}</span>
          ${runtimeLabel ? `<span>${esc(runtimeLabel)}</span>` : ""}
          <span>${esc(genresText)}</span>
        </div>
        <p class="overview">${esc(item.overview)}</p>
        <a class="cta" href="../index.html?q=${encodeURIComponent(item.title)}">Open in CineVault Interactive App →</a>
      </div>
    </section>
    <section class="card">
      <div class="card-head">
        <h2>Streaming Availability by Country</h2>
        <select id="regionSelect" class="region-select" aria-label="Select your country">
          ${REGIONS.map((r) => `<option value="${r.code}">${esc(r.name)}</option>`).join("")}
        </select>
      </div>
      <p class="card-lead">Live regional watch status for <strong>${esc(item.title)} (${esc(year)})</strong>:</p>
      <div class="region-grid" id="regionGrid">${regionCardsHtml}</div>
    </section>
    ${item.trailerKey ? `<section class="card"><h2>Official Trailer</h2><div class="video-wrap"><iframe src="https://www.youtube-nocookie.com/embed/${esc(item.trailerKey)}" title="${esc(item.title)} Trailer" allowfullscreen loading="lazy"></iframe></div></section>` : ""}
    <div class="ad-strip" aria-label="Sponsored">
      <span class="ad-label">Sponsored</span>
      <iframe width="320" height="50" scrolling="no" frameborder="0" loading="lazy" style="border:0;max-width:100%;display:block;" srcdoc="&lt;!DOCTYPE html&gt;&lt;html&gt;&lt;head&gt;&lt;meta charset=&quot;utf-8&quot;&gt;&lt;style&gt;html,body{margin:0;padding:0;background:transparent;overflow:hidden;display:flex;justify-content:center;}&lt;/style&gt;&lt;/head&gt;&lt;body&gt;&lt;script&gt;atOptions={&#39;key&#39;:&#39;b570c351ca5a05131ca8916fc6b23f71&#39;,&#39;format&#39;:&#39;iframe&#39;,&#39;height&#39;:50,&#39;width&#39;:320,&#39;params&#39;:{}};&lt;/script&gt;&lt;script src=&quot;https://bancadeltempoidea.org/22/b570c351ca5a05131ca8916fc6b23f71&quot;&gt;&lt;/script&gt;&lt;/body&gt;&lt;/html&gt;"></iframe>
    </div>
    ${topCast.length ? `<section class="card"><h2>Main Cast &amp; Stars</h2><div class="pills">${topCast.map((c) => `<span class="pill">${esc(c)}</span>`).join("")}</div></section>` : ""}
    <section class="card">
      <h2>Frequently Asked Questions</h2>
      <details class="faq-item" open><summary>Where can I watch ${esc(item.title)} (${esc(year)}) online?</summary><p>${esc(formatProviders(item.watchProviders, "US", item.releaseDate))} Select your region above for local availability.</p></details>
      <details class="faq-item"><summary>When was ${esc(item.title)} released?</summary><p>${esc(item.title)} is listed with a release date of ${esc(item.releaseDate || year)} (${esc(genresText)}).</p></details>
      <details class="faq-item"><summary>Who stars in ${esc(item.title)}?</summary><p>${esc(castLead ? `The featured cast includes ${castLead}.` : `Cast details are updated automatically from TMDB.`)}</p></details>
    </section>
    <nav class="pager" aria-label="More Titles">
      <a href="${esc(prevItem.slug)}.html">← ${esc(prevItem.title)}</a>
      <a href="${esc(nextItem.slug)}.html" style="text-align:right;">${esc(nextItem.title)} →</a>
    </nav>
    <section class="card">
      <h2>More Trending ${esc(hubLabel)} to Stream</h2>
      <div class="related-grid">${related}</div>
    </section>
  </main>
  <footer>
    <span>CineVault Streaming Discovery • Updated ${TODAY}</span>
    <span><a href="../index.html">Home</a> · <a href="../movie/index.html">Movies</a> · <a href="../tv/index.html">TV Series</a> · <a href="../guides.html">Guides</a></span>
  </footer>
  <script>
    (function(){
      const sel=document.getElementById("regionSelect"),grid=document.getElementById("regionGrid");
      if(!sel||!grid)return;
      const lang=(navigator.language||"en-US").toUpperCase();
      const detected=["PK","GB","CA","IN","AU"].find(c=>lang.endsWith("-"+c))||"US";
      function applyRegion(code){
        sel.value=code;
        const boxes=Array.from(grid.children);
        boxes.forEach(b=>b.classList.toggle("active-region",b.dataset.region===code));
        const active=boxes.find(b=>b.dataset.region===code);
        if(active)grid.prepend(active);
      }
      sel.addEventListener("change",()=>applyRegion(sel.value));
      applyRegion(detected);
    })();
  </script>
</body>
</html>`;
}

function buildDirectoryPage(mediaType, items) {
  const isMovie = mediaType === "movie";
  const title = isMovie ? "Trending Movies Directory (2026)" : "Trending TV Series Directory (2026)";
  const folder = isMovie ? "movie" : "tv";
  const cards = items.map((item) => {
    const year = (item.releaseDate || "2026").slice(0, 4);
    const badge = item.voteAverage > 0 ? `★ ${item.voteAverage.toFixed(1)}` : item.releaseDate || year;
    return `<a class="rel-card" href="${esc(item.slug)}.html"><img src="https://image.tmdb.org/t/p/w342${esc(item.posterPath)}" alt="${esc(item.title)} (${esc(year)})" loading="lazy" /><div class="rel-title">${esc(item.title)} (${esc(year)})</div><div class="rel-sub">${esc(badge)}</div></a>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)} — Where to Stream, Trailers &amp; Cast | CineVault</title>
  <meta name="description" content="Browse all ${items.length} trending ${isMovie ? "movies" : "TV series"} on CineVault with direct streaming guides, official trailers, release dates, and cast." />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <link rel="icon" type="image/svg+xml" href="../favicon.svg" />
  <link rel="canonical" href="${SITE_URL}/${folder}/index.html" />
  <style>${sharedStyles()}</style>
</head>
<body>
  <header><div class="nav"><a class="brand" href="../index.html"><span class="badge">▶</span><span>CineVault</span></a><nav class="nav-links"><a class="nav-btn" href="../index.html">Home</a><a class="nav-btn" href="../movie/index.html">Movies</a><a class="nav-btn" href="../tv/index.html">TV Series</a><a class="nav-btn" href="../guides.html">Guides</a></nav></div></header>
  <main>
    <nav class="breadcrumbs"><a href="../index.html">Home</a><span>/</span><span>${esc(title)}</span></nav>
    <section class="card">
      <h1>${esc(title)}</h1>
      <p class="card-lead">Explore ${items.length} curated ${isMovie ? "movies" : "TV shows"} with live regional streaming availability, trailers, and full cast details.</p>
      <div class="related-grid">${cards}</div>
    </section>
  </main>
  <footer><span>CineVault Streaming Discovery</span><span><a href="../index.html">Home</a> · <a href="../movie/index.html">Movies</a> · <a href="../tv/index.html">TV Series</a> · <a href="../guides.html">Guides</a></span></footer>
</body>
</html>`;
}

async function fetchFullItem(mediaType, raw) {
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
    title,
    slug: `${slugify(title)}-${raw.id}`,
    releaseDate,
    overview: (details.overview || `Discover streaming availability, trailer, release dates, and full cast for ${title} on CineVault.`).trim(),
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

async function injectHomepageCrawlLinks(movies, tvShows) {
  try {
    let html = await fs.readFile("index.html", "utf8");
    const blockStart = "<!-- SEO-CRAWL-HUB-START -->";
    const blockEnd = "<!-- SEO-CRAWL-HUB-END -->";
    const linksHtml = `${blockStart}
<section aria-label="Featured Movies and Series Directory" style="max-width:1180px;margin:28px auto;padding:20px;background:#111520;border:1px solid rgba(255,255,255,0.09);border-radius:16px;">
  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
    <h2 style="font-size:1.15rem;color:#f3f6fc;margin:0;">Latest Movies &amp; TV Streaming Guides</h2>
    <div style="display:flex;gap:12px;font-size:0.85rem;font-weight:700;color:#f5b942;">
      <a href="movie/index.html">All Movies (${movies.length}) →</a>
      <a href="tv/index.html">All TV Series (${tvShows.length}) →</a>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px;font-size:0.84rem;">
    ${movies.slice(0, 20).map((m) => `<a href="movie/${m.slug}.html" style="padding:8px 10px;background:#181e2e;border-radius:8px;color:#e2e8f5;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">🎬 ${esc(m.title)} (${esc((m.releaseDate || "2026").slice(0, 4))})</a>`).join("\n    ")}
    ${tvShows.slice(0, 16).map((t) => `<a href="tv/${t.slug}.html" style="padding:8px 10px;background:#181e2e;border-radius:8px;color:#e2e8f5;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">📺 ${esc(t.title)} (${esc((t.releaseDate || "2026").slice(0, 4))})</a>`).join("\n    ")}
  </div>
</section>
${blockEnd}`;

    if (html.includes(blockStart) && html.includes(blockEnd)) {
      html = html.replace(new RegExp(`${blockStart}[\\s\\S]*?${blockEnd}`), linksHtml.trim());
    } else if (html.includes("</footer>")) {
      html = html.replace("</footer>", `</footer>\n${linksHtml}`);
    } else if (html.includes("</body>")) {
      html = html.replace("</body>", `${linksHtml}\n</body>`);
    }

    if (!html.includes("favicon.svg")) {
      html = html.replace("</head>", `  <link rel="icon" type="image/svg+xml" href="favicon.svg" />\n  <link rel="apple-touch-icon" href="favicon.svg" />\n</head>`);
    }
    await fs.writeFile("index.html", html, "utf8");
  } catch (err) {
    console.warn("Skipped index.html injection:", err.message);
  }
}

async function main() {
  await fs.mkdir("movie", { recursive: true });
  await fs.mkdir("tv", { recursive: true });

  const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ff1e2d"/><stop offset="100%" stop-color="#99040c"/></linearGradient></defs><rect width="96" height="96" rx="22" fill="url(#g)"/><polygon points="38,28 72,48 38,68" fill="#ffffff"/></svg>`;
  await fs.writeFile("favicon.svg", faviconSvg, "utf8");

  const [mTrend, mPop, mUp, tvTrend, tvPop] = await Promise.all([
    tmdb("/trending/movie/week"),
    tmdb("/movie/popular"),
    tmdb("/movie/upcoming"),
    tmdb("/trending/tv/week"),
    tmdb("/tv/popular")
  ]);

  const dedupe = (arr) => {
    const map = new Map();
    for (const item of arr) {
      if (item?.id && item?.poster_path && !map.has(item.id)) map.set(item.id, item);
    }
    return Array.from(map.values());
  };

  const rawMovies = dedupe([...(mTrend.results || []), ...(mPop.results || []), ...(mUp.results || [])]).slice(0, 40);
  const rawTv = dedupe([...(tvTrend.results || []), ...(tvPop.results || [])]).slice(0, 30);

  const movies = [];
  for (const m of rawMovies) movies.push(await fetchFullItem("movie", m));
  const tvShows = [];
  for (const t of rawTv) tvShows.push(await fetchFullItem("tv", t));

  for (let i = 0; i < movies.length; i++) {
    await fs.writeFile(path.join("movie", `${movies[i].slug}.html`), buildDetailPage(movies[i], movies, i), "utf8");
  }
  for (let i = 0; i < tvShows.length; i++) {
    await fs.writeFile(path.join("tv", `${tvShows[i].slug}.html`), buildDetailPage(tvShows[i], tvShows, i), "utf8");
  }

  await fs.writeFile(path.join("movie", "index.html"), buildDirectoryPage("movie", movies), "utf8");
  await fs.writeFile(path.join("tv", "index.html"), buildDirectoryPage("tv", tvShows), "utf8");

  await injectHomepageCrawlLinks(movies, tvShows);

  const urls = [
    { loc: `${SITE_URL}/`, priority: "1.0", changefreq: "daily" },
    { loc: `${SITE_URL}/guides.html`, priority: "0.9", changefreq: "weekly" },
    { loc: `${SITE_URL}/movie/index.html`, priority: "0.9", changefreq: "daily" },
    { loc: `${SITE_URL}/tv/index.html`, priority: "0.9", changefreq: "daily" },
    ...movies.map((m) => ({ loc: `${SITE_URL}/movie/${m.slug}.html`, priority: "0.8", changefreq: "weekly" })),
    ...tvShows.map((t) => ({ loc: `${SITE_URL}/tv/${t.slug}.html`, priority: "0.8", changefreq: "weekly" }))
  ];

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`).join("\n")}\n</urlset>\n`;
  await fs.writeFile("sitemap.xml", sitemapXml, "utf8");
  console.log(`Generated ${movies.length} movies, ${tvShows.length} TV series, and ${urls.length} sitemap URLs.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
