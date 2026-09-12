const SHIKIMORI_API = 'https://shikimori.one/api';
const ANILIST_API = 'https://graphql.anilist.co';
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

function normalizeAniList(a) {
  if (!a) return null;
  const year = a.seasonYear || (a.startDate?.year ?? null);
  const statusMap = { FINISHED: 'released', RELEASING: 'ongoing', NOT_YET_RELEASED: 'anons', CANCELLED: 'cancelled', HIATUS: 'paused' };
  return {
    id: a.id,
    title: a.title?.native || a.title?.romaji || a.title?.english || 'Без названия',
    originalTitle: a.title?.romaji || a.title?.english || '',
    image: a.coverImage?.extraLarge || a.coverImage?.large || a.coverImage?.medium || '',
    rating: a.averageScore ? (a.averageScore / 10).toFixed(1) : '—',
    year,
    episodes: a.episodes || 0,
    status: statusMap[a.status] || String(a.status || '').toLowerCase(),
    duration: a.duration || 0,
    genres: a.genres || [],
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
  try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 1000) }; }
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

async function anilist(query, variables = {}) {
  const response = await fetch(ANILIST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  const data = await response.json();
  if (!response.ok || data.errors) {
    const error = new Error('AniList API request failed');
    error.status = response.status || 502;
    error.data = data;
    throw error;
  }
  return data.data;
}

const ANILIST_LIST_QUERY = `query($page:Int,$perPage:Int,$sort:[MediaSort],$search:String,$status:MediaStatus,$type:MediaType){Page(page:$page,perPage:$perPage){media(type:$type,search:$search,status:$status,sort:$sort){id title{romaji english native} coverImage{extraLarge large medium} averageScore episodes status duration genres startDate{year} seasonYear description}}}`;
const ANILIST_DETAILS_QUERY = `query($id:Int){Media(id:$id,type:ANIME){id title{romaji english native} coverImage{extraLarge large medium} averageScore episodes status duration genres startDate{year} seasonYear description}}`;
const ANILIST_SCHEDULE_QUERY = `query($page:Int,$perPage:Int,$start:Int,$end:Int){Page(page:$page,perPage:$perPage){airingSchedules(airingAt_greater:$start,airingAt_lesser:$end){airingAt episode media{id title{romaji english native} coverImage{extraLarge large medium} averageScore episodes status duration genres startDate{year} seasonYear description}}}}`;

async function anilistList({ page = 1, limit = 20, order = 'ranked', search } = {}) {
  let sort = ['SCORE_DESC'];
  if (order === 'popularity') sort = ['POPULARITY_DESC'];
  if (order === 'aired_on') sort = ['START_DATE_DESC'];
  const data = await anilist(ANILIST_LIST_QUERY, {
    page: Number(page) || 1,
    perPage: Math.min(Number(limit) || 20, 50),
    sort,
    search: search || undefined,
    type: 'ANIME'
  });
  return (data.Page?.media || []).map(normalizeAniList).filter(Boolean);
}

async function fallbackList(params) {
  return anilistList(params);
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, null, 0);
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' }, 0);

  try {
    const { type, id, q, page = 1, limit = 20 } = req.query;
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);

    if (type === 'popular') {
      try {
        const data = await shikimori('/animes', { limit: safeLimit, page, order: 'popularity' });
        return json(res, 200, data.map(normalizeAnime).filter(Boolean));
      } catch {
        return json(res, 200, await fallbackList({ limit: safeLimit, page, order: 'popularity' }));
      }
    }

    if (type === 'top') {
      try {
        const data = await shikimori('/animes', { limit: safeLimit, page, order: 'ranked' });
        return json(res, 200, data.map(normalizeAnime).filter(Boolean));
      } catch {
        return json(res, 200, await fallbackList({ limit: safeLimit, page, order: 'ranked' }));
      }
    }

    if (type === 'new') {
      try {
        const data = await shikimori('/animes', { limit: safeLimit, page, order: 'aired_on' });
        return json(res, 200, data.map(normalizeAnime).filter(Boolean));
      } catch {
        return json(res, 200, await fallbackList({ limit: safeLimit, page, order: 'aired_on' }));
      }
    }

    if (type === 'search') {
      if (!q || String(q).trim().length < 2) return json(res, 400, { error: 'Search query is too short' }, 0);
      try {
        const data = await shikimori('/animes', { limit: safeLimit, page, order: 'ranked', search: String(q).trim() });
        return json(res, 200, data.map(normalizeAnime).filter(Boolean), 30);
      } catch {
        return json(res, 200, await fallbackList({ limit: safeLimit, page, order: 'ranked', search: String(q).trim() }), 30);
      }
    }

    if (type === 'schedule') {
      try {
        const data = await shikimori('/calendar');
        return json(res, 200, data, 120);
      } catch {
        const now = Math.floor(Date.now() / 1000);
        const data = await anilist(ANILIST_SCHEDULE_QUERY, { page: 1, perPage: 50, start: now - 86400, end: now + 7 * 86400 });
        const list = (data.Page?.airingSchedules || []).map(x => ({
          anime: normalizeAniList(x.media),
          next_episode: x.episode,
          next_episode_at: x.airingAt ? new Date(x.airingAt * 1000).toISOString() : ''
        })).filter(x => x.anime);
        return json(res, 200, list, 120);
      }
    }

    if (type === 'details') {
      if (!id) return json(res, 400, { error: 'Anime id is required' }, 0);
      try {
        const data = await shikimori(`/animes/${encodeURIComponent(id)}`);
        return json(res, 200, normalizeAnime(data), 300);
      } catch {
        const data = await anilist(ANILIST_DETAILS_QUERY, { id: Number(id) });
        return json(res, 200, normalizeAniList(data.Media), 300);
      }
    }

    return json(res, 400, { error: 'Unknown type', available: ['popular', 'top', 'new', 'search', 'schedule', 'details'] }, 0);
  } catch (error) {
    console.error('AnimeSpace backend error:', error);
    return json(res, error.status || 502, { error: error.message || 'Backend request failed', details: error.data || null }, 0);
  }
};
