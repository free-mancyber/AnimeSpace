(() => {
  const API = 'https://shikimori.one/api';
  const IMAGE_BASE = 'https://shikimori.one';
  const CACHE_TTL = 45 * 60 * 1000;
  const FALLBACK = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600"><rect width="400" height="600" fill="#11131d"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#8b5cf6" font-size="28" font-family="Arial">AnimeSpace</text></svg>');

  function cacheKey(key) { return 'animeSpace:shikimori:home:' + key; }
  function getCache(key) {
    try {
      const raw = localStorage.getItem(cacheKey(key));
      if (!raw) return null;
      const item = JSON.parse(raw);
      return Date.now() - item.time < CACHE_TTL ? item.data : null;
    } catch { return null; }
  }
  function setCache(key, data) {
    try { localStorage.setItem(cacheKey(key), JSON.stringify({ time: Date.now(), data })); } catch {}
  }
  function imageUrl(path) {
    if (!path) return FALLBACK;
    if (/^https:\/\//i.test(path)) return path;
    if (/^http:\/\//i.test(path)) return path.replace(/^http:\/\//i, 'https://');
    return IMAGE_BASE + (path.startsWith('/') ? '' : '/') + path;
  }
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
  }
  function normalize(a) {
    if (!a) return null;
    return {
      id: a.id,
      title: a.russian || a.name || 'Без названия',
      image: a.image?.original || a.image?.preview || a.image?.x96 || '',
      rating: a.score ? Number(a.score).toFixed(1) : '—',
      year: a.aired_on ? String(a.aired_on).slice(0, 4) : null,
      episodes: a.episodes || 0,
      status: a.status || '',
      duration: a.duration || 0,
      genres: (a.genres || []).map(g => g.russian || g.name).filter(Boolean),
      description: a.description || ''
    };
  }
  async function request(params) {
    const url = new URL(API + '/animes');
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
    const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Shikimori API: ' + response.status);
    const data = await response.json();
    return Array.isArray(data) ? data.map(normalize).filter(Boolean) : [];
  }
  async function load(key, params) {
    const cached = getCache(key);
    if (cached) return cached;
    const data = await request(params);
    setCache(key, data);
    return data;
  }
  function card(a) {
    const data = encodeURIComponent(JSON.stringify(a)).replace(/'/g, '%27');
    return `<article class="anime-card" data-anime='${data}'><img src="${esc(imageUrl(a.image))}" alt="${esc(a.title)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${FALLBACK}'"><div class="info"><div class="title">${esc(a.title)}</div><div class="rating">${esc(a.rating)}</div></div></article>`;
  }
  function render(id, list) {
    const el = document.getElementById(id);
    if (el && list?.length) el.innerHTML = list.map(card).join('');
  }
  async function init() {
    // Очищаем только кэш Shikimori главной страницы перед новым запросом.
    ['recommendations', 'popular', 'new', 'top'].forEach(key => {
      try { localStorage.removeItem(cacheKey(key)); } catch {}
    });

    try {
      const [recommendations, popular, newest, rated] = await Promise.all([
        load('recommendations', { limit: 12, order: 'popularity', status: 'ongoing', page: 2 }),
        load('popular', { limit: 12, order: 'popularity', status: 'ongoing' }),
        load('new', { limit: 12, order: 'id' }),
        load('top', { limit: 12, order: 'ranked' })
      ]);
      render('recommendations', recommendations);
      render('popular', popular);
      render('newAnime', newest);
      render('rated', rated);
    } catch (error) {
      console.error('AnimeSpace Shikimori home:', error);
    }
  }
  init();
})();
