const ANILIST_API = 'https://graphql.anilist.co';
const ANILIBRIA_API = 'https://api.anilibria.tv/v3';

function json(res, status, data, cacheSeconds = 60) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 5}`);
  res.end(JSON.stringify(data));
}

function normalizeAniList(a) {
  if (!a) return null;
  const year = a.seasonYear || (a.startDate?.year ?? null);
  const statusMap = {
    FINISHED: 'released',
    RELEASING: 'ongoing',
    NOT_YET_RELEASED: 'anons',
    CANCELLED: 'cancelled',
    HIATUS: 'paused'
  };
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

async function anilibriaSchedule() {
  const response = await fetch(`${ANILIBRIA_API}/title/schedule?filter=id,names,posters,type,status,season,player`, {
    headers: { Accept: 'application/json' }
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(`AniLibria API request failed: ${response.status}`);
    error.status = response.status || 502;
    error.data = data;
    throw error;
  }
  return data;
}

const ANILIST_LIST_QUERY = `query($page:Int,$perPage:Int,$sort:[MediaSort],$search:String,$type:MediaType){Page(page:$page,perPage:$perPage){media(type:$type,search:$search,sort:$sort){id title{romaji english native} coverImage{extraLarge large medium} averageScore episodes status duration genres startDate{year} seasonYear description}}}`;
const ANILIST_DETAILS_QUERY = `query($id:Int){Media(id:$id,type:ANIME){id title{romaji english native} coverImage{extraLarge large medium} averageScore episodes status duration genres startDate{year} seasonYear description}}`;

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

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, null, 0);
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' }, 0);

  try {
    const { type, id, q, page = 1, limit = 20 } = req.query;
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);

    if (type === 'popular') {
      return json(res, 200, await anilistList({ limit: safeLimit, page, order: 'popularity' }));
    }

    if (type === 'top') {
      return json(res, 200, await anilistList({ limit: safeLimit, page, order: 'ranked' }));
    }

    if (type === 'new') {
      return json(res, 200, await anilistList({ limit: safeLimit, page, order: 'aired_on' }));
    }

    if (type === 'search') {
      if (!q || String(q).trim().length < 2) {
        return json(res, 400, { error: 'Search query is too short' }, 0);
      }
      return json(res, 200, await anilistList({
        limit: safeLimit,
        page,
        order: 'ranked',
        search: String(q).trim()
      }), 30);
    }

    if (type === 'schedule') {
      const schedule = await anilibriaSchedule();
      return json(res, 200, schedule, 120);
    }

    if (type === 'details') {
      if (!id) return json(res, 400, { error: 'Anime id is required' }, 0);
      const data = await anilist(ANILIST_DETAILS_QUERY, { id: Number(id) });
      return json(res, 200, normalizeAniList(data.Media), 300);
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
