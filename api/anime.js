const ANILIST_API = 'https://graphql.anilist.co';
const ANILIBRIA_API = 'https://anilibria.top/api/v1';

const topCache = new Map();
const GENRE_MAP = {
  'Экшен':'Action','Приключения':'Adventure','Комедия':'Comedy','Драма':'Drama','Фэнтези':'Fantasy','Мистика':'Supernatural','Романтика':'Romance','Фантастика':'Sci-Fi','Повседневность':'Slice of Life','Детектив':'Mystery','Ужасы':'Horror','Спорт':'Sports','Меха':'Mecha','Музыка':'Music','Школа':'School','Самураи':'Samurai','Демоны':'Demons','Магия':'Magic','Триллер':'Thriller','Сёнэн':'Shounen','Исекай':'Isekai'
};
const TYPE_MAP = {'Сериал':'TV','Фильм':'MOVIE','OVA':'OVA','ONA':'ONA'};

function json(res, status, data, cacheSeconds = 60) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (cacheSeconds <= 0) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  } else {
    res.setHeader('Cache-Control', `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 5}`);
  }
  res.end(JSON.stringify(data));
}

function normalizeAniList(a) {
  if (!a) return null;
  const year = a.seasonYear || (a.startDate?.year ?? null);
  const statusMap = { FINISHED: 'released', RELEASING: 'ongoing', NOT_YET_RELEASED: 'anons', CANCELLED: 'cancelled', HIATUS: 'paused' };
  const formatMap = { TV:'Сериал', MOVIE:'Фильм', OVA:'OVA', ONA:'ONA', SPECIAL:'Спецвыпуск', TV_SHORT:'Сериал', MUSIC:'Музыка' };
  return { id: a.id, title: a.title?.native || a.title?.romaji || a.title?.english || 'Без названия', originalTitle: a.title?.romaji || a.title?.english || '', image: a.coverImage?.extraLarge || a.coverImage?.large || a.coverImage?.medium || '', rating: a.averageScore ? (a.averageScore / 10).toFixed(1) : '—', year, episodes: a.episodes || 0, status: statusMap[a.status] || String(a.status || '').toLowerCase(), duration: a.duration || 0, type: formatMap[a.format] || a.format || 'Аниме', genres: a.genres || [], description: a.description || '', source: 'anilist' };
}

async function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function anilist(query, variables = {}, attempt = 0) {
  const response = await fetch(ANILIST_API, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query, variables }) });
  let data = null;
  try { data = await response.json(); } catch (_) {}
  if (response.status === 429 && attempt < 2) {
    const retryAfter = Number(response.headers.get('retry-after')) || 0;
    await sleep(Math.max(1200, retryAfter * 1000, 1200 * (attempt + 1)));
    return anilist(query, variables, attempt + 1);
  }
  if (!response.ok || data?.errors) {
    const error = new Error('AniList API request failed');
    error.status = response.status || 502;
    error.data = data;
    throw error;
  }
  return data.data;
}

function parseWeekday(rawDay) {
  let dayVal = (rawDay && typeof rawDay === 'object' && 'value' in rawDay) ? rawDay.value : rawDay;
  if (dayVal === null || dayVal === undefined) return null;
  const num = Number(dayVal);
  if (!isNaN(num)) {
    if (num >= 1 && num <= 7) return num - 1;
    if (num >= 0 && num <= 6) return num;
  }
  if (typeof dayVal === 'string') {
    const str = dayVal.toLowerCase().trim();
    if (str.startsWith('mon')) return 0;
    if (str.startsWith('tue')) return 1;
    if (str.startsWith('wed')) return 2;
    if (str.startsWith('thu')) return 3;
    if (str.startsWith('fri')) return 4;
    if (str.startsWith('sat')) return 5;
    if (str.startsWith('sun')) return 6;
    if (str.startsWith('пн') || str.startsWith('пон')) return 0;
    if (str.startsWith('вт')) return 1;
    if (str.startsWith('ср')) return 2;
    if (str.startsWith('чт') || str.startsWith('чет')) return 3;
    if (str.startsWith('пт') || str.startsWith('пят')) return 4;
    if (str.startsWith('сб') || str.startsWith('суб')) return 5;
    if (str.startsWith('вс') || str.startsWith('вос')) return 6;
  }
  return null;
}

function fixPosterUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const value = url.trim();
  if (!value) return null;
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  if (value.startsWith('//')) return `https:${value}`;
  if (value.startsWith('/')) return `https://anilibria.top${value}`;
  return `https://anilibria.top/${value}`;
}

function extractPosterUrl(poster) {
  if (!poster) return null;
  if (typeof poster === 'string') return fixPosterUrl(poster);
  const rawUrl = poster.optimized?.original || poster.optimized?.preview || poster.optimized?.thumbnail || poster.original || poster.preview || poster.thumbnail || poster.url || poster.small?.url || poster.small || poster.medium?.url || poster.medium || poster.large?.url || poster.large;
  return fixPosterUrl(rawUrl);
}

async function fetchWithFallback(endpointPath) {
  const baseUrls = [ANILIBRIA_API, 'https://api.anilibria.app/api/v1'];
  let lastError = null;
  for (const baseUrl of baseUrls) {
    try {
      const response = await fetch(`${baseUrl}${endpointPath}`, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 AnimeSpace/1.0' } });
      if (response.ok) return await response.json();
      console.warn(`[AniLiberty] ${baseUrl} returned status: ${response.status}`);
      lastError = new Error(`API returned status ${response.status}`);
    } catch (err) {
      console.error(`[AniLiberty] Failed fetch from ${baseUrl}:`, err.message);
      lastError = err;
    }
  }
  throw lastError || new Error('All AniLiberty mirrors failed');
}

function normalizeAniLibertyRelease(item) {
  const r = item?.release || item || {};
  const name = r.name || {};
  const poster = extractPosterUrl(r.poster || r.posters || {});
  if (!r.id || !poster) return null;
  const type = r.type?.description || r.type?.value || 'Аниме';
  return { id: `anilibria-${r.id}`, anilibriaId: r.id, title: name.main || name.english || name.alternative || 'Без названия', originalTitle: name.english || name.main || '', image: poster, rating: '—', votes: null, year: r.year || null, episodes: r.episodes_total || 0, status: r.is_ongoing ? 'ongoing' : 'released', duration: r.average_duration_of_episode || 0, type, genres: Array.isArray(r.genres) ? r.genres.map(g => g?.description || g?.name || g).filter(Boolean) : [], description: r.description || '', source: 'anilibria' };
}

async function anilibriaSearch(query) {
  const encoded = encodeURIComponent(String(query).trim());
  const data = await fetchWithFallback(`/app/search/releases?query=${encoded}`);
  const rawList = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
  return rawList.map(normalizeAniLibertyRelease).filter(Boolean);
}

async function anilibriaSchedule() {
  const data = await fetchWithFallback('/anime/schedule/week');
  const rawList = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
  return rawList.map(item => {
    const r = item?.release || item || {};
    const poster = r.poster || r.posters || {};
    const ep = item?.published_release_episode || {};
    const image = extractPosterUrl(poster);
    let weekday = parseWeekday(item?.publish_day?.value ?? r?.publish_day?.value ?? r?.publish_day);
    if (weekday === null && r.time) {
      const date = new Date(r.time);
      if (!isNaN(date.getTime())) weekday = (date.getDay() + 6) % 7;
    }
    return { id: r.id, title: r.name?.main || r.name?.english || r.name?.alternative || 'Без названия', image, rating: '—', year: r.year || null, episodes: r.episodes_total || 0, status: r.is_ongoing ? 'Выходит' : 'Вышел', duration: r.average_duration_of_episode || 0, genres: [], description: r.description || '', episode: ep.ordinal ?? item?.next_release_episode_number ?? null, time: ep.updated_at || null, weekday, source: 'aniliberty' };
  }).filter(x => x.id && x.image && x.title);
}

const ANILIST_LIST_QUERY = `query($page:Int,$perPage:Int,$sort:[MediaSort],$search:String,$type:MediaType,$genre_in:[String],$format:MediaFormat,$from:FuzzyDateInt,$to:FuzzyDateInt,$minScore:Int){Page(page:$page,perPage:$perPage){media(type:$type,search:$search,sort:$sort,genre_in:$genre_in,format:$format,startDate_greater:$from,startDate_lesser:$to,averageScore_greater:$minScore,isAdult:false){id title{romaji english native} coverImage{extraLarge large medium} averageScore episodes status duration format genres startDate{year} seasonYear description}}}`;
const ANILIST_TOP_QUERY = `query($page:Int,$perPage:Int,$sort:[MediaSort],$season:MediaSeason,$seasonYear:Int,$from:FuzzyDateInt,$to:FuzzyDateInt){Page(page:$page,perPage:$perPage){media(type:ANIME,sort:$sort,season:$season,seasonYear:$seasonYear,startDate_greater:$from,startDate_lesser:$to,isAdult:false){id title{romaji english native} coverImage{extraLarge large medium} averageScore episodes status duration format genres startDate{year} seasonYear description}}}`;
const ANILIST_DETAILS_QUERY = `query($id:Int){Media(id:$id,type:ANIME){id title{romaji english native} coverImage{extraLarge large medium} averageScore episodes status duration format genres startDate{year} seasonYear description}}`;

async function anilistList({ page = 1, limit = 20, order = 'ranked', search, category = 'overall', genres = [], year, rating, type } = {}) {
  let sort = ['SCORE_DESC'];
  if (order === 'popularity') sort = ['POPULARITY_DESC'];
  if (order === 'aired_on') sort = ['START_DATE_DESC'];
  const variables = { page: Number(page) || 1, perPage: Math.min(Number(limit) || 20, 50), sort, search: search || undefined, type: 'ANIME', genre_in: genres.map(g => GENRE_MAP[g] || g).filter(Boolean), format: TYPE_MAP[type] || undefined, minScore: rating != null && rating !== '' ? Math.round(Number(rating) * 10) : undefined };
  if (year) {
    const y = Number(year);
    if (y >= 1900 && y <= 2100) { variables.from = y * 10000 + 101; variables.to = y * 10000 + 1231; }
  }
  if (category === 'year' && !year) {
    const y = new Date().getFullYear(); variables.from = y * 10000 + 101; variables.to = y * 10000 + 1231;
  }
  const data = await anilist(ANILIST_LIST_QUERY, variables);
  return (data.Page?.media || []).map(normalizeAniList).filter(Boolean);
}

async function anilistTopList({ page = 1, limit = 20, category = 'overall' } = {}) {
  let sort = ['SCORE_DESC'];
  if (category === 'popular') sort = ['POPULARITY_DESC'];
  const variables = { page: Number(page) || 1, perPage: Math.min(Number(limit) || 20, 50), sort };
  if (category === 'year') {
    const y = new Date().getFullYear();
    variables.from = y * 10000 + 101;
    variables.to = y * 10000 + 1231;
  }
  if (category === 'season') {
    const month = new Date().getMonth() + 1;
    variables.season = month <= 3 ? 'WINTER' : month <= 6 ? 'SPRING' : month <= 9 ? 'SUMMER' : 'FALL';
    variables.seasonYear = new Date().getFullYear();
  }
  const data = await anilist(ANILIST_TOP_QUERY, variables);
  return (data.Page?.media || []).map(normalizeAniList).filter(Boolean);
}

async function searchWithFallback(query, limit, filters = {}) {
  let aniListResults = [];
  try {
    aniListResults = await anilistList({ limit, page: 1, order: 'ranked', search: query || undefined, genres: filters.genres || [], year: filters.year, rating: filters.rating, type: filters.type });
  } catch (error) {
    console.warn('AniList search failed, switching to AniLiberty:', error.message);
  }
  if (aniListResults.length) return aniListResults;
  try {
    let aniLibertyResults = await anilibriaSearch(query || '');
    const genres = filters.genres || [];
    if (genres.length) aniLibertyResults = aniLibertyResults.filter(a => genres.every(g => a.genres.includes(g)));
    if (filters.year) aniLibertyResults = aniLibertyResults.filter(a => String(a.year) === String(filters.year));
    if (filters.rating) aniLibertyResults = aniLibertyResults.filter(a => Number(a.rating) >= Number(filters.rating));
    if (filters.type) aniLibertyResults = aniLibertyResults.filter(a => String(a.type).toLowerCase().includes(String(filters.type).toLowerCase()));
    return aniLibertyResults.slice(0, limit);
  } catch (error) {
    console.warn('AniLiberty search failed:', error.message);
    throw error;
  }
}

async function getTopCached(category, page, limit) {
  const key = `top:${category}:${page}:${limit}`;
  const cached = topCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.data;
  const data = await anilistTopList({ limit, page, category });
  topCache.set(key, { data, expires: Date.now() + 60_000 });
  return data;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, null, 0);
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' }, 0);
  try {
    const { type, id, q, page = 1, limit = 20, category = 'overall' } = req.query;
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
    if (type === 'popular') return json(res, 200, await anilistList({ limit: safeLimit, page, order: 'popularity' }));
    if (type === 'top') return json(res, 200, await getTopCached(category, page, safeLimit), 60);
    if (type === 'new') return json(res, 200, await anilistList({ limit: safeLimit, page, order: 'aired_on' }));
    if (type === 'search') {
      const query = String(q || '').trim();
      const genres = String(req.query.genres || '').split(',').map(x => decodeURIComponent(x).trim()).filter(Boolean);
      const year = String(req.query.year || '').trim();
      const rating = String(req.query.rating || '').trim();
      const searchType = String(req.query.format || '').trim();
      if (query.length < 2 && !genres.length && !year && !rating && !searchType) return json(res, 400, { error: 'Search query is too short' }, 0);
      return json(res, 200, await searchWithFallback(query, safeLimit, { genres, year, rating, type: searchType }), 30);
    }
    if (type === 'schedule') return json(res, 200, await anilibriaSchedule(), 0);
    if (type === 'details') {
      if (!id) return json(res, 400, { error: 'Anime id is required' }, 0);
      const data = await anilist(ANILIST_DETAILS_QUERY, { id: Number(id) });
      return json(res, 200, normalizeAniList(data.Media), 300);
    }
    return json(res, 400, { error: 'Unknown type', available: ['popular', 'top', 'new', 'search', 'schedule', 'details'] }, 0);
  } catch (error) {
    console.error('AnimeSpace backend error:', error);
    return json(res, error.status || 502, { error: error.message || 'Backend request failed', details: error.data || null }, 0);
  }
};
