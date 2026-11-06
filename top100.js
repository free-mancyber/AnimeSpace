const TOP_API='https://anime-space-rust.vercel.app/api/anime';

function topEsc(value){
  return String(value??'').replace(/[&<>\"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'
  }[c]));
}

function topPackAnime(item){
  try{return encodeURIComponent(JSON.stringify(item)).replace(/'/g,'%27')}catch{return ''}
}

function topImage(item){
  const direct=typeof item?.image==='string'?item.image.trim():'';
  if(direct)return direct;
  const id=item?.id;
  return id?`https://img.anili.st/media/${encodeURIComponent(id)}`:'';
}

async function loadTopCategory(category){
  const grid=document.getElementById('topGrid');
  const podium=document.getElementById('podium');
  if(!grid||!podium)return;

  const token=(loadTopCategory.token=(loadTopCategory.token||0)+1);
  const sk='<div class="anime-card skeleton" aria-hidden="true"><div class="anime-card-poster"></div><div class="sk-line"></div><div class="sk-line short"></div></div>';
  podium.innerHTML=sk.repeat(3);
  grid.innerHTML=sk.repeat(12);

  try{
    const items=[];

    for(let page=1;page<=2;page++){
      const url=TOP_API+'?type=top&category='+encodeURIComponent(category)+'&page='+page+'&limit=50';
      const response=await fetch(url,{cache:'no-store'});

      if(!response.ok){
        let message='';
        try{const data=await response.json();message=data?.error||''}catch{}
        throw new Error('Top API: '+response.status+(message?' — '+message:''));
      }

      const data=await response.json();
      if(!Array.isArray(data))throw new Error('Top API вернул не массив');
      items.push(...data);
      if(data.length<50)break;
    }

    // Пользователь успел переключить вкладку — не перетираем новый результат старым
    if(token!==loadTopCategory.token)return;
    const list=items.slice(0,100).filter(item=>item&&typeof item==='object');

    const makeCard=(item,rank)=>{
      const imageUrl=topImage(item);
      const titleText=russianTitle(item);
      const ratingVal=item.rating||'—';
      const votes=item.votes?String(item.votes):'';
      const type=item.type||'Аниме';
      const packed=topPackAnime({...item,image:imageUrl});
      const fallback=imageUrl&&item?.id?`https://img.anili.st/media/${encodeURIComponent(item.id)}`:'';
      const onError=fallback&&fallback!==imageUrl
        ?`this.onerror=null;this.src='${topEsc(fallback)}'`
        :`this.onerror=null;this.style.visibility='hidden'`;

      return `<article class="anime-card top-card" tabindex="0" role="link" aria-label="${topEsc(titleText)}" data-anime="${packed}">
        <div class="anime-card-poster">
          <img src="${topEsc(imageUrl)}" alt="${topEsc(titleText)}" loading="lazy" referrerpolicy="no-referrer" onerror="${onError}">
          <div class="anime-card-rating">
            <span class="anime-card-rank">#${rank}</span>
            <span class="anime-card-star">★</span>
            <span class="anime-card-rating-value">${topEsc(ratingVal)}</span>
            ${votes?`<span class="anime-card-votes">${topEsc(votes)}</span>`:''}
          </div>
        </div>
        <div class="anime-card-title">${topEsc(titleText)}</div>
        <div class="anime-card-meta">${topEsc(String(item.year||'—'))} • ${topEsc(type)}</div>
      </article>`;
    };

    podium.innerHTML=list.slice(0,3).map((item,index)=>makeCard(item,index+1)).join('');
    grid.innerHTML=list.slice(3).map((item,index)=>makeCard(item,index+4)).join('');

    if(!list.length){
      podium.innerHTML='';
      grid.innerHTML='<div class="top-loading">Ничего не найдено</div>';
    }
  }catch(error){
    if(token!==loadTopCategory.token)return;
    console.error('AnimeSpace Top 100 error:',error);
    podium.innerHTML='';
    grid.innerHTML='<div class="top-loading">Не удалось загрузить топ</div>';
  }
}

document.querySelectorAll('.top-tab').forEach((button,index)=>{
  button.addEventListener('click',()=>{
    document.querySelectorAll('.top-tab').forEach(x=>x.classList.remove('active'));
    button.classList.add('active');
    loadTopCategory(['overall','year','season','popular'][index]);
  });
});

loadTopCategory('overall');
