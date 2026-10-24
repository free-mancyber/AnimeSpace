const ANILIBRIA_API = 'https://anilibria.top/api/v1';

function json(res, status, data) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.end(JSON.stringify(data));
}

function fixUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const value = url.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('//')) return 'https:' + value;
  if (value.startsWith('/')) return ANILIBRIA_API.replace('/api/v1', '') + value;
  return ANILIBRIA_API.replace('/api/v1', '') + '/' + value;
}

function poster(p) {
  if (!p) return null;
  if (typeof p === 'string') return fixUrl(p);
  return fixUrl(
    p.optimized?.original || p.optimized?.preview || p.optimized?.thumbnail ||
    p.original || p.preview || p.thumbnail || p.url ||
    p.small?.url || p.small || p.medium?.url || p.medium || p.large?.url || p.large
  );
}

function weekday(value) {
  if (value && typeof value === 'object' && 'value' in value) value = value.value;
  const n = Number(value);
  if (Number.isFinite(n)) {
    if (n >= 1 && n <= 7) return n - 1;
    if (n >= 0 && n <= 6) return n;
  }
  const s = String(value ?? '').toLowerCase().trim();
  const map = { mon:0,tue:1,wed:2,thu:3,fri:4,sat:5,sun:6,пн:0,вт:1,ср:2,чт:3,пт:4,сб:5,вс:6 };
  const key = Object.keys(map).find(k => s.startsWith(k));
  return key == null ? null : map[key];
}

function rating(r) {
  const values = [r?.rating?.average, r?.rating?.score, r?.rating?.value, r?.rating, r?.average_rating, r?.average_score, r?.averageScore, r?.score];
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return (n > 10 ? n / 10 : n).toFixed(1);
  }
  return '—';
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  try {
    const response = await fetch(`${ANILIBRIA_API}/anime/schedule/week`, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`AniLiberty: ${response.status}`);
    const body = await response.json();
    const raw = Array.isArray(body?.data) ? body.data : (Array.isArray(body) ? body : []);
    const result = raw.map(item => {
      const r = item?.release || item || {};
      const name = r.name || {};
      const ep = item?.published_release_episode || {};
      let day = weekday(item?.publish_day?.value ?? item?.publish_day ?? r?.publish_day?.value ?? r?.publish_day);
      const timeValue = ep.updated_at || item?.time || r?.time || null;
      if (day == null && timeValue) {
        const d = new Date(timeValue);
        if (!Number.isNaN(d.getTime())) day = (d.getDay() + 6) % 7;
      }
      return {
        id: r.id,
        title: name.main || name.english || name.alternative || 'Без названия',
        image: poster(r.poster || r.posters),
        rating: rating(r),
        year: r.year || null,
        episode: ep.ordinal ?? item?.next_release_episode_number ?? null,
        time: timeValue,
        weekday: day,
        status: r.is_ongoing ? 'Выходит' : 'Вышел',
        type: r.type?.description || r.type?.value || 'Аниме',
        source: 'anilibria'
      };
    }).filter(x => x.id && x.title && x.image && x.weekday != null);
    return json(res, 200, result);
  } catch (error) {
    console.error('AnimeSpace schedule:', error);
    return json(res, 502, { error: 'Не удалось загрузить расписание' });
  }
};
