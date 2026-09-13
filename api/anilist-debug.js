const ANILIST_API = 'https://graphql.anilist.co';

const TOP_QUERY = `query($page:Int,$perPage:Int,$sort:[MediaSort]){Page(page:$page,perPage:$perPage){media(type:ANIME,sort:$sort,isAdult:false){id title{romaji english native} coverImage{extraLarge large medium} averageScore episodes status duration format genres startDate{year} seasonYear description}}}`;

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  const variables = {
    page: Number(req.query?.page) || 1,
    perPage: Math.min(Number(req.query?.limit) || 10, 50),
    sort: ['SCORE_DESC']
  };

  const startedAt = Date.now();
  let response;
  let payload = null;

  try {
    response = await fetch(ANILIST_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ query: TOP_QUERY, variables })
    });

    try {
      payload = await response.json();
    } catch (e) {
      payload = { parseError: e.message };
    }

    return res.status(200).json({
      diagnostic: true,
      provider: 'AniList',
      endpoint: ANILIST_API,
      httpStatus: response.status,
      ok: response.ok,
      durationMs: Date.now() - startedAt,
      variables,
      query: TOP_QUERY,
      hasGraphQLErrors: Array.isArray(payload?.errors) && payload.errors.length > 0,
      errors: payload?.errors || [],
      dataKeys: payload?.data ? Object.keys(payload.data) : [],
      pageKeys: payload?.data?.Page ? Object.keys(payload.data.Page) : [],
      mediaCount: Array.isArray(payload?.data?.Page?.media) ? payload.data.Page.media.length : null,
      raw: payload
    });
  } catch (error) {
    return res.status(200).json({
      diagnostic: true,
      provider: 'AniList',
      endpoint: ANILIST_API,
      networkError: error.message,
      durationMs: Date.now() - startedAt,
      variables,
      query: TOP_QUERY
    });
  }
};
