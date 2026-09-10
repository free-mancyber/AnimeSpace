export default async function handler(req, res) {
  try {
    const search = req.query.search || 'Naruto';
    const limit = req.query.limit || '6';
    const url = `https://shikimori.one/api/animes?search=${encodeURIComponent(search)}&limit=${encodeURIComponent(limit)}`;

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'AnimeSpace/1.0'
      }
    });

    const text = await response.text();
    res.status(response.status);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(text);
  } catch (error) {
    res.status(500).json({ error: 'Proxy error', message: error.message });
  }
}
