const ANILIST_API = 'https://graphql.anilist.co';

function getAllohaTokens() {
  const raw = process.env.ALLOHA_TOKENS;
  if (!raw) return [];

  let values = [];
  try {
    const parsed = JSON.parse(raw);
    values = Array.isArray(parsed) ? parsed : [parsed];
  } catch (_) {
    values = String(raw).split(/[\\s,;]+/);
  }

  return values
    .map(token => String(token || '').trim())
    .filter(Boolean);
}

async function allohaByKinopoiskId(kpId) {
  const tokens = getAllohaTokens();

  if (!tokens.length) {
    const error = new Error('Alloha tokens are not configured in Vercel');
    error.status = 503;
    throw error;
  }

  let lastError = null;

  for (const token of tokens) {
    try {
      const url = new URL('https://api.alloha.tv/');
      url.searchParams.set('token', token);
      url.searchParams.set('kp', String(kpId));

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch (_) {}

      if (response.status === 401 || response.status === 403 || response.status >= 500) {
        lastError = new Error('Alloha token/server request failed');
        lastError.status = response.status;
        continue;
      }

      if (response.status === 429) {
        const error = new Error('Alloha rate limit reached');
        error.status = 429;
        throw error;
      }

      if (!response.ok) {
        const error = new Error(payload?.error || 'Alloha API request failed');
        error.status = response.status;
        throw error;
      }

      return payload;
    } catch (error) {
      if (error?.status === 429) throw error;
      lastError = error;
    }
  }

  const error = new Error(lastError?.message || 'All configured Alloha tokens failed');
  error.status = lastError?.status || 502;
  throw error;
}

const ANILIBRIA_API = 'https://anilibria.top/api/v1';

const topCache = new Map();
const GENRE_MAP = {
  'Экшен':'Action','Приключения':'Adventure','Комедия':'Comedy','Драма':'Drama','Фэнтези':'Fantasy','Мистика':'Supernatural','Романтика':'Romance','Фантастика':'Sci-Fi','Повседневность':'Slice of Life','Детектив':'Mystery','Ужасы':'Horror','Спорт':'Sports','Меха':'Mecha','Музыка':'Music','Школа':'School','Самураи':'Samurai','Демоны':'Demons','Магия':'Magic','Триллер':'Thriller','Сёнэн':'Shounen','Исекай':'Isekai','Сверхъестественное':'Supernatural'
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

function extractKinopoiskId(a) {
  const link = Array.isArray(a?.externalLinks) ? a.externalLinks.find(x => x?.site === 'KINOPOISK') : null;
  const match = String(link?.url || '').match(/(?:film|series)?\/?(\d{3,})/i);
  return match ? match[1] : null;
}

function normalizeAniList(a) {
  if (!a) return null;
  const year = a.seasonYear || (a.startDate?.year ?? null);
  const statusMap = { FINISHED: 'released', RELEASING: 'ongoing', NOT_YET_RELEASED: 'anons', CANCELLED: 'cancelled', HIATUS: 'paused' };
  const formatMap = { TV:'Сериал', MOVIE:'Фильм', OVA:'OVA', ONA:'ONA', SPECIAL:'Спецвыпуск', TV_SHORT:'Сериал', MUSIC:'Музыка' };
  const title = a.title?.english || a.title?.romaji || a.title?.native || 'Без названия';
  return { id: a.id, kpId: extractKinopoiskId(a), title, originalTitle: a.title?.romaji || a.title?.english || a.title?.native || '', image: a.coverImage?.extraLarge || a.coverImage?.large || a.coverImage?.medium || '', rating: a.averageScore ? (a.averageScore / 10).toFixed(1) : '—', year, episodes: a.episodes || 0, status: statusMap[a.status] || String(a.status || '').toLowerCase(), duration: a.duration || 0, type: formatMap[a.format] || a.format || 'Аниме', genres: a.genres || [], description: a.description || '', source: 'anilist' };
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

function extractAniLibertyRating(r) {
  const candidates = [r?.rating?.average,r?.rating?.score,r?.rating?.value,r?.rating,r?.average_rating,r?.average_score,r?.averageScore,r?.score];
  for (const candidate of candidates) {
    const n = Number(candidate);
    if (!Number.isFinite(n) || n <= 0) continue;
    const normalized = n > 10 ? n / 10 : n;
    if (normalized >= 0 && normalized <= 10) return normalized.toFixed(1);
  }
  return '—';
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
  return { id: `anilibria-${r.id}`, anilibriaId: r.id, title: name.main || name.english || name.alternative || 'Без названия', originalTitle: name.english || name.main || '', image: poster, rating: extractAniLibertyRating(r), votes: null, year: r.year || null, episodes: r.episodes_total || 0, status: r.is_ongoing ? 'ongoing' : 'released', duration: r.average_duration_of_episode || 0, type, genres: Array.isArray(r.genres) ? r.genres.map(g => g?.description || g?.name || g).filter(Boolean) : [], description: r.description || '', source: 'anilibria' };
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
    return { id: r.id, title: r.name?.main || r.name?.english || r.name?.alternative || 'Без названия', image, rating: extractAniLibertyRating(r), year: r.year || null, episodes: r.episodes_total || 0, status: r.is_ongoing ? 'Выходит' : 'Вышел', duration: r.average_duration_of_episode || 0, genres: [], description: r.description || '', episode: ep.ordinal ?? item?.next_release_episode_number ?? null, time: ep.updated_at || null, weekday, source: 'anilibria' };
  }).filter(x => x.id && x.image && x.title);
}

const ANILIST_LIST_QUERY = `query($page:Int,$perPage:Int,$sort:[MediaSort],$search:String,$type:MediaType,$genre_in:[String],$format:MediaFormat,$from:FuzzyDateInt,$to:FuzzyDateInt,$minScore:Int){Page(page:$page,perPage:$perPage){media(type:$type,search:$search,sort:$sort,genre_in:$genre_in,format:$format,startDate_greater:$from,startDate_lesser:$to,averageScore_greater:$minScore,isAdult:false){id title{romaji english native} coverImage{extraLarge large medium} externalLinks{site url} averageScore episodes status duration format genres startDate{year} seasonYear description}}}`;
const ANILIST_TOP_QUERY = `query($page:Int,$perPage:Int,$sort:[MediaSort],$season:MediaSeason,$seasonYear:Int,$from:FuzzyDateInt,$to:FuzzyDateInt){Page(page:$page,perPage:$perPage){media(type:ANIME,sort:$sort,season:$season,seasonYear:$seasonYear,startDate_greater:$from,startDate_lesser:$to,isAdult:false){id title{romaji english native} coverImage{extraLarge large medium} averageScore episodes status duration format genres startDate{year} seasonYear description}}}`;
const ANILIST_DETAILS_QUERY = `query($id:Int){Media(id:$id,type:ANIME){id title{romaji english native} coverImage{extraLarge large medium} externalLinks{site url} averageScore episodes status duration format genres startDate{year} seasonYear description}}`;

function normalizeGenres(raw) {
  if (raw == null) return [];
  let value = String(raw);
  try { value = decodeURIComponent(value); } catch (_) {}
  return value.split(',').map(g => {
    const clean = String(g).trim();
    if (!clean) return '';
    return GENRE_MAP[clean.toLowerCase()] || clean;
  }).filter(Boolean);
}

async function anilistList({ page = 1, limit = 20, order = 'ranked', search, category = 'overall', genres = [], year, rating, type } = {}) {
  let sort = ['SCORE_DESC'];
  if (order === 'popularity') sort = ['POPULARITY_DESC'];
  if (order === 'aired_on') sort = ['START_DATE_DESC'];
  const normalizedGenres = (Array.isArray(genres) ? genres : [genres]).flatMap(normalizeGenres);
  const variables = { page: Number(page) || 1, perPage: Math.min(Number(limit) || 20, 50), sort, search: search || undefined, type: 'ANIME', genre_in: normalizedGenres, format: TYPE_MAP[type] || undefined, minScore: rating != null && rating !== '' ? Math.round(Number(rating) * 10) : undefined };
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
  const normalizedFilters = { ...filters, genres: normalizeGenres(filters.genres) };
  let aniListResults = [];
  try {
    aniListResults = await anilistList({ limit, page: 1, order: 'ranked', search: query || undefined, genres: normalizedFilters.genres, year: normalizedFilters.year, rating: normalizedFilters.rating, type: normalizedFilters.type });
  } catch (error) {
    console.warn('AniList search failed, switching to AniLiberty:', error.message);
  }
  if (aniListResults.length) return aniListResults;
  try {
    let aniLibertyResults = await anilibriaSearch(query || '');
    const genres = normalizedFilters.genres || [];
    if (genres.length) aniLibertyResults = aniLibertyResults.filter(a => genres.every(g => a.genres.includes(g) || a.genres.includes(GENRE_MAP[g?.toLowerCase()] || g)));
    if (normalizedFilters.year) aniLibertyResults = aniLibertyResults.filter(a => String(a.year) === String(normalizedFilters.year));
    if (normalizedFilters.rating) aniLibertyResults = aniLibertyResults.filter(a => Number(a.rating) >= Number(normalizedFilters.rating));
    if (normalizedFilters.type) aniLibertyResults = aniLibertyResults.filter(a => String(a.type).toLowerCase().includes(String(normalizedFilters.type).toLowerCase()));
    return aniLibertyResults.slice(0, limit);
  } catch (error) {
    console.warn('AniLiberty search failed:', error.message);
    return [];
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
    if (type === 'search') {
      return json(res, 200, await searchWithFallback(q || '', safeLimit, req.query), 0);
    }
    if (type === 'top') return json(res, 200, await getTopCached(category, Number(page) || 1, safeLimit), 60);
    if (type === 'details' && id) {
      if (String(id).startsWith('anilibria-')) {
        const releaseId = String(id).replace('anilibria-', '');
        const data = await fetchWithFallback(`/anime/releases/${encodeURIComponent(releaseId)}`);
        return json(res, 200, normalizeAniLibertyRelease(data?.data || data), 0);
      }
      const data = await anilist(ANILIST_DETAILS_QUERY, { id: Number(id) });
      return json(res, 200, normalizeAniList(data.Media), 0);
    }

    if (type === 'alloha' && id) {
      return json(res, 200, await allohaByKinopoiskId(id), 0);
    }
    if (type === 'schedule') return json(res, 200, await anilibriaSchedule(), 0);
    return json(res, 400, { error: 'Invalid request' }, 0);
  } catch (error) {
    console.error('Anime API error:', error);
    if (req.query?.type === 'search') return json(res, 200, [], 0);
    return json(res, error.status || 500, { error: error.message || 'Internal server error' }, 0);
  }
};
