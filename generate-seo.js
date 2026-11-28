function renderTitlePage(item, relatedItems, primaryHub) {
  const title = item.title || item.name || "Untitled";
  const folder = item.media_type === "tv" ? "tv" : "movie";
  const slug = `${slugify(title)}-${item.id}`;
  const canonical = `${SITE_URL}/${folder}/${slug}.html`;
  const poster = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "";
  const dateStr = item.release_date || item.first_air_date || "Upcoming";
  const year = dateStr.slice(0, 4) || "2026";
  const overview = item.overview || `Discover ${title} (${year}) on CineVault—release info, cast, trailer, and where to watch.`;
  const trailer = (item.videos?.results || []).find(
    (v) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser")
  );
  const cast = (item.credits?.cast || []).slice(0, 8);
  const genres = (item.genres || []).map((g) => g.name).filter(Boolean);

  const providerMap = new Map();
  for (const block of Object.values(item["watch/providers"]?.results || {})) {
    for (const p of [
      ...(block.flatrate || []),
      ...(block.free || []),
      ...(block.ads || []),
      ...(block.rent || []),
      ...(block.buy || [])
    ]) {
      const rawName = String(p.provider_name || "").trim();
      const label = shortProvider(rawName);
      if (!label) continue;
      if (!providerMap.has(label)) {
        const href =
          STREAM_URLS[rawName] ||
          STREAM_URLS[label] ||
          `https://www.google.com/search?q=${encodeURIComponent(`watch ${title} on ${rawName}`)}`;
        providerMap.set(label, href);
      }
    }
  }

  if (!providerMap.size) {
    providerMap.set("Netflix", "https://www.netflix.com/");
    providerMap.set("Prime Video", "https://www.primevideo.com/");
    providerMap.set("Apple TV", "https://tv.apple.com/");
  }

  const streamButtons = Array.from(providerMap.entries())
    .slice(0, 6)
    .map(
      ([name, href]) =>
        `<a class="stream-btn" href="${esc(href)}" target="_blank" rel="noopener noreferrer sponsored">${esc(name)} ↗</a>`
    )
    .join("\n          ");

  const relatedHtml = relatedItems
    .slice(0, 6)
    .map((rel) => {
      const rTitle = rel.title || rel.name || "Title";
      const rFolder = rel.media_type === "tv" ? "tv" : "movie";
      const rSlug = `${slugify(rTitle)}-${rel.id}`;
      const rPoster = rel.poster_path ? `https://image.tmdb.org/t/p/w342${rel.poster_path}` : "";
      return `<a class="rel-card" href="/${rFolder}/${rSlug}.html">${
        rPoster ? `<img src="${esc(rPoster)}" alt="${esc(rTitle)} poster" loading="lazy" />` : ""
      }<span>${esc(rTitle)}</span></a>`;
    })
    .join("\n          ");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": item.media_type === "tv" ? "TVSeries" : "Movie",
    name: title,
    description: overview,
    image: poster || undefined,
    datePublished: item.release_date || item.first_air_date || undefined,
    genre: genres.length ? genres : undefined,
    url: canonical
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)} (${esc(year)}) — Where to Watch &amp; Details | CineVault</title>
  <meta name="description" content="${esc(overview.slice(0, 158))}" />
  <link rel="canonical" href="${esc(canonical)}" />
  <meta property="og:title" content="${esc(title)} (${esc(year)}) | CineVault" />
  <meta property="og:description" content="${esc(overview.slice(0, 158))}" />
  <meta property="og:type" content="video.${item.media_type === "tv" ? "tv_show" : "movie"}" />
  <meta property="og:url" content="${esc(canonical)}" />
  ${poster ? `<meta property="og:image" content="${esc(poster)}" />` : ""}
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  <style>
    :root { --bg:#050608; --surface:#131722; --surface-2:#1b2130; --text:#f6f8fc; --muted:#a4afc6; --accent:#e50914; --gold:#f5c518; --border:rgba(255,255,255,0.1); --max:820px; }
    * { box-sizing:border-box; margin:0; padding:0; }
    body { background:var(--bg); color:var(--text); font-family:system-ui,-apple-system,sans-serif; line-height:1.55; }
    a { color:inherit; text-decoration:none; }
    header { position:sticky; top:0; z-index:20; background:rgba(5,6,8,0.94); backdrop-filter:blur(12px); border-bottom:1px solid var(--border); }
    .nav { max-width:var(--max); margin:0 auto; padding:11px 16px; display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
    .brand { font-weight:900; font-size:1.15rem; text-transform:uppercase; }
    .brand span { color:var(--accent); }
    main { max-width:var(--max); margin:0 auto; padding:16px 16px 52px; }
    .crumb { font-size:0.78rem; color:var(--muted); margin-bottom:12px; display:flex; gap:6px; flex-wrap:wrap; }
    .crumb a:hover { color:#fff; text-decoration:underline; }
    .poster-stage { background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:14px; margin-bottom:14px; display:flex; flex-direction:column; align-items:center; }
    .poster-img { width:100%; max-width:340px; aspect-ratio:2 / 3; object-fit:cover; border-radius:10px; background:var(--surface-2); display:block; }
    .box { background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:16px; margin-bottom:14px; }
    h1 { font-size:clamp(1.45rem,3.4vw,2.1rem); font-weight:900; line-height:1.15; margin-bottom:8px; }
    .meta { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px; font-size:0.82rem; color:var(--muted); }
    .meta span { background:var(--surface-2); border:1px solid var(--border); padding:3px 9px; border-radius:6px; }
    .gold { color:var(--gold) !important; font-weight:700; }
    .desc { font-size:0.9rem; color:#dce3f2; }
    .box h2 { font-size:1.02rem; font-weight:800; margin-bottom:10px; }
    .streams { display:flex; flex-wrap:wrap; gap:8px; }
    .stream-btn { padding:7px 12px; border-radius:8px; background:var(--surface-2); border:1px solid rgba(255,255,255,0.2); color:#fff; font-size:0.78rem; font-weight:700; display:inline-flex; align-items:center; gap:5px; }
    .stream-btn:hover { background:var(--accent); border-color:var(--accent); }
    .rel-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(130px,1fr)); gap:10px; }
    .rel-card { background:var(--surface-2); border:1px solid var(--border); border-radius:8px; overflow:hidden; display:flex; flex-direction:column; font-size:0.78rem; font-weight:700; }
    .rel-card img { width:100%; aspect-ratio:2/3; object-fit:cover; }
    .rel-card span { padding:6px 8px; }
    .hub-bar { display:flex; flex-wrap:wrap; gap:6px; }
    .hub-chip { padding:5px 10px; border-radius:999px; background:var(--surface-2); border:1px solid var(--border); font-size:0.76rem; font-weight:600; }
    .hub-chip.active { background:var(--accent); border-color:var(--accent); color:#fff; }
    iframe.yt { width:100%; aspect-ratio:16/9; border:0; border-radius:10px; background:#000; }
    @media (max-width:640px) { .rel-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
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
      <span>${esc(title)}</span>
    </nav>

    <section class="poster-stage">
      ${poster ? `<img class="poster-img" src="${esc(poster)}" alt="${esc(title)} poster" />` : `<div class="poster-img"></div>`}
    </section>

    <section class="box">
      <h1>${esc(title)}</h1>
      <div class="meta">
        <span class="gold">★ ${Number(item.vote_average || 0).toFixed(1)}</span>
        <span>${esc(dateStr)}</span>
        <span>${item.media_type === "tv" ? "TV Show" : "Movie"}</span>
        ${genres.length ? `<span>${esc(genres.slice(0, 3).join(" • "))}</span>` : ""}
      </div>
      <p class="desc">${esc(overview)}</p>
    </section>

    <section class="box">
      <h2>Where to Watch</h2>
      <div class="streams">${streamButtons}</div>
    </section>

    ${
      trailer
        ? `<section class="box"><h2>Official Trailer</h2><iframe class="yt" src="https://www.youtube.com/embed/${esc(trailer.key)}" allowfullscreen loading="lazy" title="${esc(title)} trailer"></iframe></section>`
        : ""
    }

    ${
      cast.length
        ? `<section class="box"><h2>Cast</h2><p style="font-size:0.88rem;color:#dce3f2;">${cast.map((c) => esc(c.name)).join(" • ")}</p></section>`
        : ""
    }

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
