const fs = require('fs');
const path = require('path');

const API_KEY = process.env.TMDB_API_KEY;
const DOMAIN = 'https://cinevault.space';
const TMDB_BASE = 'https://themoviedb.org';

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' on ' + url);
  return res.json();
}

function buildMovieHTML(movie, providers, trailerKey, cast) {
  const title = movie.title || 'Untitled';
  const year = (movie.release_date || '').slice(0, 4);
  const slug = slugify(title) + '-' + movie.id;
  const pageUrl = DOMAIN + '/movie/' + slug + '.html';
  const poster = movie.poster_path
    ? 'https://tmdb.org' + movie.poster_path
    : '';

  const providerList = providers.length
    ? providers.map(p => '<span class="pill">' + p.provider_name + '</span>').join(' ')
    : '<span class="pill">Check local theaters or digital stores</span>';

  const providerText = providers.length
    ? providers.map(p => p.provider_name).join(', ')
    : 'digital platforms';

  const castList = cast.length
    ? cast.map(c => '<span class="pill">' + c.name + '</span>').join(' ')
    : '';

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="UTF-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '  <title>Where to Watch ' + title + ' (' + year + ') - Trailer, Cast & Streaming | CineVault</title>',
    '  <meta name="description" content="Find out where to stream ' + title + ' (' + year + ') on ' + providerText + '. Watch the official trailer, view cast details, and explore more on CineVault." />',
    '  <link rel="canonical" href="' + pageUrl + '" />',
    '  <style>',
    '    body { background:#0b0e14; color:#fff; font-family:system-ui,sans-serif; max-width:820px; margin:auto; padding:20px; line-height:1.6; }',
    '    a { color:#e50914; text-decoration:none; }',
    '    .pill { display:inline-block; background:#1c222e; padding:6px 12px; border-radius:8px; margin:4px; font-size:14px; }',
    '    .header { display:flex; gap:20px; flex-wrap:wrap; margin-top:20px; }',
    '    img { border-radius:12px; max-width:220px; }',
    '    iframe { width:100%; height:360px; border-radius:12px; border:0; margin-top:10px; }',
    '  </style>',
    '</head>',
    '<body>',
    '  <nav><a href="/">← Back to CineVault Home</a> | <a href="/guides.html">Guides</a></nav>',
    '  <div class="header">',
    poster ? '    <img src="' + poster + '" alt="' + title + ' poster" />' : '',
    '    <div>',
    '      <h1>Where to Watch ' + title + ' (' + year + ')</h1>',
    '      <p>' + (movie.overview || 'No synopsis available.') + '</p>',
    '      <p><strong>Rating:</strong> ' + (movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A') + '/10</p>',
    '    </div>',
    '  </div>',
    '  <h2>Where to Stream ' + title + '</h2>',
    '  <p>Currently available on: <strong>' + providerText + '</strong>.</p>',
    '  <div>' + providerList + '</div>',
    trailerKey ? '  <h2>Official Trailer</h2><iframe src="https://youtube.com' + trailerKey + '" title="' + title + ' Trailer" allowfullscreen></iframe>' : '',
    castList ? '  <h2>Top Cast</h2><div>' + castList + '</div>' : '',
    '  <footer style="margin-top:40px; border-top:1px solid #222; padding-top:20px;">',
    '    <a href="/movie/index.html">Browse All Indexed Movies →</a>',
    '  </footer>',
    '</body>',
    '</html>'
  ].join('\n');
}

async function run() {
  if (!API_KEY) {
    throw new Error('TMDB_API_KEY secret is missing in GitHub Settings -> Secrets!');
  }

  fs.mkdirSync('movie', { recursive: true });
  const moviesMap = new Map();

  for (let page = 1; page <= 5; page++) {
    const pop = await fetchJSON(TMDB_BASE + '/movie/popular?api_key=' + API_KEY + '&page=' + page);
    const trend = await fetchJSON(TMDB_BASE + '/trending/movie/week?api_key=' + API_KEY + '&page=' + page);
    (pop.results || []).concat(trend.results || []).forEach(m => moviesMap.set(m.id, m));
  }

  const urls = [
    DOMAIN + '/',
    DOMAIN + '/guides.html',
    DOMAIN + '/movie/index.html'
  ];
  const directoryLinks = [];

  for (const movie of moviesMap.values()) {
    try {
      const details = await fetchJSON(
        TMDB_BASE + '/movie/' + movie.id + '?api_key=' + API_KEY + '&append_to_response=videos,credits,watch/providers'
      );

      const usProviders = (details['watch/providers'] && details['watch/providers'].results && details['watch/providers'].results.US) || {};
      const allProviders = []
        .concat(usProviders.flatrate || [])
        .concat(usProviders.rent || [])
        .concat(usProviders.buy || []);
      const uniqueProviders = Array.from(new Map(allProviders.map(p => [p.provider_id, p])).values());

      const trailer = (details.videos && details.videos.results || []).find(v => v.site === 'YouTube' && v.type === 'Trailer');
      const cast = (details.credits && details.credits.cast || []).slice(0, 8);

      const year = (details.release_date || '').slice(0, 4);
      const slug = slugify(movie.title) + '-' + movie.id;
      const filePath = path.join('movie', slug + '.html');
      const html = buildMovieHTML(details, uniqueProviders, trailer ? trailer.key : null, cast);

      fs.writeFileSync(filePath, html, 'utf8');
      urls.push(DOMAIN + '/movie/' + slug + '.html');
      directoryLinks.push('<li><a href="/movie/' + slug + '.html">' + details.title + ' (' + year + ') - Where to Watch & Trailer</a></li>');
    } catch (err) {
      console.error('Skipped ' + movie.id + ':', err.message);
    }
  }

  const directoryHTML = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="UTF-8" />',
    '  <title>All Movies & Streaming Directory | CineVault</title>',
    '  <meta name="description" content="Browse all movies, trailers, cast, and streaming availability on CineVault." />',
    '</head>',
    '<body style="background:#0b0e14;color:#fff;font-family:sans-serif;max-width:820px;margin:auto;padding:20px;">',
    '  <a href="/">← Back to Home</a>',
    '  <h1>CineVault Movie Directory</h1>',
    '  <ul>' + directoryLinks.join('\n') + '</ul>',
    '</body>',
    '</html>'
  ].join('\n');

  fs.writeFileSync(path.join('movie', 'index.html'), directoryHTML, 'utf8');

  const today = new Date().toISOString().slice(0, 10);
  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://sitemaps.org">',
    urls.map(u => '  <url><loc>' + u + '</loc><lastmod>' + today + '</lastmod></url>').join('\n'),
    '</urlset>'
  ].join('\n');

  fs.writeFileSync('sitemap.xml', sitemap, 'utf8');
  console.log('SUCCESS: Generated ' + directoryLinks.length + ' movie pages!');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
    
