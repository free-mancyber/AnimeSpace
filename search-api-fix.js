async function searchShikimori(query, filters = {}) {
  const genres = filters.genres || [];
  const variables = {
    page: 1,
    perPage: 50,
    search: query || undefined,
    sort: ['SCORE_DESC']
  };

  if (filters.year) {
    const y = Number(filters.year);
    if (y >= 1900 && y <= 2100) {
      variables.from = y * 10000 + 101;
      variables.to = y * 10000 + 1231;
    }
  }

  const genreNames = {
    'Экшен':'Action','Приключения':'Adventure','Комедия':'Comedy','Драма':'Drama','Фэнтези':'Fantasy',
    'Мистика':'Supernatural','Романтика':'Romance','Фантастика':'Sci-Fi','Повседневность':'Slice of Life',
    'Детектив':'Mystery','Ужасы':'Horror','Спорт':'Sports','Меха':'Mecha','Музыка':'Music','Школа':'School',
    'Самураи':'Samurai','Демоны':'Demons','Магия':'Magic','Триллер':'Thriller','Сёнэн':'Shounen','Исекай':'Isekai'
  };

  const queryText = `query($page:Int,$perPage:Int,$search:String,$sort:[MediaSort],$genre_in:[String],$format:MediaFormat,$from:FuzzyDateInt,$to:FuzzyDateInt,$minScore:Int){Page(page:$page,perPage:$perPage){media(type:ANIME,search:$search,sort:$sort,genre_in:$genre_in,format:$format,startDate_greater:$from,startDate_lesser:$to,averageScore_greater:$minScore,isAdult:false){${MEDIA_FIELDS}}}}`;

  variables.genre_in = genres.map(g => genreNames[g] || g).filter(Boolean);
  if (filters.format) {
    const formatMap = { 'Сериал':'TV', 'Фильм':'MOVIE', 'OVA':'OVA', 'ONA':'ONA' };
    variables.format = formatMap[filters.format] || undefined;
  }
  if (filters.rating) variables.minScore = Math.round(Number(filters.rating) * 10);

  try {
    const data = await aniList(queryText, variables);
    return (data.Page?.media || []).map(normalizeAnime).filter(Boolean);
  } catch (error) {
    console.warn('AnimeSpace search filters failed, retrying basic search:', error);
    const basic = await aniList(
      `query($page:Int,$perPage:Int,$search:String,$sort:[MediaSort]){Page(page:$page,perPage:$perPage){media(type:ANIME,search:$search,sort:$sort,isAdult:false){${MEDIA_FIELDS}}}}`,
      { page: 1, perPage: 50, search: query || undefined, sort: ['SCORE_DESC'] }
    );
    let list = (basic.Page?.media || []).map(normalizeAnime).filter(Boolean);
    if (filters.year) list = list.filter(a => String(a.year) === String(filters.year));
    if (filters.rating) list = list.filter(a => Number(a.rating) >= Number(filters.rating));
    return list;
  }
}
