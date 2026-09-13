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
        try{
          const data=await response.json();
          details=data?.error||'';
        }catch{}
        throw new Error('Top API: '+response.status+(details?' — '+details:''));
      }

      const data=await response.json();
      if(!Array.isArray(data))break;

      pages.push(...data);
      if(data.length<50)break;
      if(page<2)await new Promise(resolve=>setTimeout(resolve,300));
    }

    const list=pages.slice(0,100);

    const make=(item,i)=>{
      const imageUrl=typeof item.image==='string'?item.image:'';
      const titleText=typeof item.title==='string'
        ?item.title
        :(item.title?.userPreferred||item.title?.romaji||item.title?.english||'Без названия');
      const ratingVal=item.rating||'—';

      return `<article class="top-card" data-anime='${packAnime(item)}'>
        <img src="${esc(imageUrl)}" alt="${esc(titleText)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">
        <div class="top-info">
          <div class="top-rank">#${i}</div>
          <div class="top-name">${esc(titleText)}</div>
          <div class="top-rating">★ ${esc(String(ratingVal))}</div>
          <div class="top-meta">${item.year||'—'} • ${esc(item.type||'Аниме')}${item.episodes?' • '+esc(String(item.episodes))+' сер.':''}</div>
        </div>
      </article>`;
    };

    podium.innerHTML=list.slice(0,3).map((item,i)=>make(item,i+1)).join('');
    grid.innerHTML=list.slice(3).map((item,i)=>make(item,i+4)).join('');

    if(!list.length){
      podium.innerHTML='';
      grid.innerHTML='<div class="top-loading">Ничего не найдено</div>';
    }
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
