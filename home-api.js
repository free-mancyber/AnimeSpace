const HOME_SECTIONS=[
  ['recommendations',{limit:12,order:'popularity',page:2}],
  ['popular',{limit:12,order:'popularity',page:1}],
  ['newAnime',{limit:12,order:'aired_on',page:1}],
  ['rated',{limit:12,order:'ranked',page:1}]
];

// Каждая секция грузится независимо: если одна упала, остальные всё равно покажутся
async function loadHomeSection(id,params){
  renderSkeletonRow(id,params.limit);
  try{
    renderApiRow(id,await getAnimes(params));
  }catch(error){
    console.error('AnimeSpace home API ('+id+'):',error);
    renderRowMessage(id,'Не удалось загрузить подборку. Проверьте интернет и попробуйте ещё раз.',()=>loadHomeSection(id,params));
  }
}

if(document.getElementById('recommendations'))HOME_SECTIONS.forEach(([id,params])=>loadHomeSection(id,params));
