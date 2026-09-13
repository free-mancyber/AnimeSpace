function getCurrentSeason(){
  const month=new Date().getMonth()+1;
  if(month<=3)return'WINTER';
  if(month<=6)return'SPRING';
  if(month<=9)return'SUMMER';
  return'FALL';
}

async function loadTopCategory(category){
  const grid=document.getElementById('topGrid');
  const podium=document.getElementById('podium');
  if(!grid||!podium)return;

  grid.innerHTML='<div class="top-loading">Загрузка...</div>';
  podium.innerHTML='';

  try{
    let filter='';
    let variables={page:1,perPage:100,sort:['SCORE_DESC']};

    if(category==='year'){
      filter=',startDateGreater:$from,startDateLesser:$to';
      const year=new Date().getFullYear();
      variables.from=year*10000+101;
      variables.to=year*10000+1231;
    }

    if(category==='season'){
      filter=',season:$season,seasonYear:$seasonYear';
      variables.season=getCurrentSeason();
      variables.seasonYear=new Date().getFullYear();
    }

    if(category==='popular')variables.sort=['POPULARITY_DESC'];

    const query=`query($page:Int,$perPage:Int,$sort:[MediaSort],$from:FuzzyDateInt,$to:FuzzyDateInt,$season:MediaSeason,$seasonYear:Int){Page(page:$page,perPage:$perPage){media(type:ANIME,isAdult:false,sort:$sort${filter}){${MEDIA_FIELDS}}}}`;
    const data=await aniList(query,variables);
    const list=(data.Page?.media||[]).map(normalizeAnime).filter(Boolean);

    const make=(a,i)=>`<article class="top-card" data-anime='${packAnime(a)}'><img src="${esc(a.image)}" alt="${esc(a.title)}" loading="lazy"><div class="top-info"><div class="top-rank">#${i}</div><div class="top-name">${esc(a.title)}</div><div class="top-rating">★ ${esc(a.rating)}</div><div class="top-meta">${a.episodes||'—'} эпизода · ${esc(a.status||'—')}</div></div></article>`;

    podium.innerHTML=list.slice(0,3).map((a,i)=>make(a,i+1)).join('');
    grid.innerHTML=list.slice(3).map((a,i)=>make(a,i+4)).join('');
    if(!list.length)grid.innerHTML='<div class="top-loading">Ничего не найдено</div>';
  }catch(e){
    console.error('AnimeSpace top category error:',e);
    podium.innerHTML='';
    grid.innerHTML='<div class="top-loading">Не удалось загрузить топ</div>';
  }
}

document.querySelectorAll('.top-tab').forEach((button,index)=>{
  button.addEventListener('click',()=>{
    document.querySelectorAll('.top-tab').forEach(x=>x.classList.remove('active'));
    button.classList.add('active');
    const categories=['overall','year','season','popular'];
    loadTopCategory(categories[index]);
  });
});

loadTopCategory('overall');
