const TOP_API='https://anime-space-rust.vercel.app/api/anime';

async function loadTopCategory(category){
  const grid=document.getElementById('topGrid');
  const podium=document.getElementById('podium');
  if(!grid||!podium)return;

  grid.innerHTML='<div class="top-loading">Загрузка...</div>';
  podium.innerHTML='';

  try{
    const pages=[];
    for(let page=1;page<=2;page++){
      const url=TOP_API+'?type=top&category='+encodeURIComponent(category)+'&page='+page+'&limit=50';
      const response=await fetch(url,{cache:'no-store'});
      if(!response.ok){
        let details='';
        try{const data=await response.json();details=data?.error||''}catch{}
        throw new Error('Top API: '+response.status+(details?' — '+details:''));
      }
      const data=await response.json();
      if(!Array.isArray(data))break;
      pages.push(...data);
      if(data.length<50)break;
      if(page<2) await new Promise(resolve=>setTimeout(resolve,300));
    }

    const list=pages.map(normalizeAnime).filter(Boolean).slice(0,100);
    const make=(a,i)=>`<article class="anime-card top-anime-card" data-anime='${packAnime(a)}'><div class="anime-card-poster"><img src="${esc(a.image)}" alt="${esc(a.title)}" loading="lazy"><div class="anime-card-rating"><span class="anime-card-rank">#${i}</span><span class="anime-card-star">★</span><span class="anime-card-rating-value">${esc(a.rating||'—')}</span></div></div><div class="anime-card-title">${esc(a.title)}</div><div class="anime-card-meta">${a.year||'—'} • ${esc(a.type||'—')}</div></article>`;

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
