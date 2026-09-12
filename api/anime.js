const SHIKIMORI_API = 'https://shikimori.one/api';
const USER_AGENT = 'AnimeSpace/1.0 (https://free-mancyber.github.io/AnimeSpace/)';
const SHIKIMORI_REFERER = 'https://shikimori.one/';

function json(res, status, data, cacheSeconds = 60) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 5}`);
  res.end(JSON.stringify(data));
}

function normalizeAnime(a) {
  if (!a) return null;
  const image = a.image?.original || a.image?.preview || a.image?.x96 || '';
  const year = a.aired_on ? String(a.aired_on).slice(0, 4) : (a.released_on ? String(a.released_on).slice(0, 4) : null);
  return {
    id: a.id,
    title: a.russian || a.name || 'Без названия',
    originalTitle: a.name || '',
    image,
    rating: a.score ? Number(a.score).toFixed(1) : '—',
    year: year || null,
    episodes: a.episodes || 0,
    status: a.status || '',
    duration: a.duration || 0,
    genres: (a.genres || []).map(g => g.russian || g.name).filter(Boolean),
    description: a.description || ''
  };
}

async function shikimori(path, params = {}) {
  const url = new URL(SHIKIMORI_API + path);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
      Referer: SHIKIMORI_REFERER
    }
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text.slice(0, 1000) };
  }

  if (!response.ok) {
    const error = new Error(`Shikimori API: ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  if (!Array.isArray(data) && !data?.id && !data?.name) {
    const error = new Error('Shikimori API returned an unexpected response');
    error.status = 502;
    error.data = data;
    throw error;
  }

  return data;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, null, 0);
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' }, 0);

  try {
    const { type, id, q, page = 1, limit = 20 } = req.query;
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);

    if (type === 'popular') {
      const data = await shikimori('/animes', { limit: safeLimit, page, order: 'popularity' });
      return json(res, 200, data.map(normalizeAnime).filter(Boolean));
    }

    if (type === 'top') {
      const data = await shikimori('/animes', { limit: safeLimit, page, order: 'ranked' });
      return json(res, 200, data.map(normalizeAnime).filter(Boolean));
    }

    if (type === 'new') {
      const data = await shikimori('/animes', { limit: safeLimit, page, order: 'aired_on' });
      return json(res, 200, data.map(normalizeAnime).filter(Boolean));
    }

    if (type === 'search') {
      if (!q || String(q).trim().length < 2) return json(res, 400, { error: 'Search query is too short' }, 0);
      const data = await shikimori('/animes', { limit: safeLimit, page, order: 'ranked', search: String(q).trim() });
      return json(res, 200, data.map(normalizeAnime).filter(Boolean), 30);
    }

    if (type === 'schedule') {
      const data = await shikimori('/calendar');
      return json(res, 200, data, 120);
    }

    if (type === 'details') {
      if (!id) return json(res, 400, { error: 'Anime id is required' }, 0);
      const data = await shikimori(`/animes/${encodeURIComponent(id)}`);
      return json(res, 200, normalizeAnime(data), 300);
    }

    return json(res, 400, {
      error: 'Unknown type',
      available: ['popular', 'top', 'new', 'search', 'schedule', 'details']
    }, 0);
  } catch (error) {
    console.error('AnimeSpace backend error:', error);
    return json(res, error.status || 502, {
      error: error.message || 'Backend request failed',
      details: error.data || null
    }, 0);
  }
};
