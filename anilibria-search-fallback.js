(function(){
  const originalSearch=window.searchAnimeApi;
  if(typeof originalSearch!=='function')return;
  const API='https://anilibria.top/api/v1/app/search/releases?query=';
  function normalize(item){
    const r=item?.release||item||{};
    const title=r.name||r.title||item?.name||item?.title||r.names?.ru||r.names?.en||r.names?.romaji||r.alias||item?.alias||'';
    if(!title)return null;
    const poster=r.poster||item?.poster||{};
    const image=poster?.url||poster?.originalUrl||poster?.src||r.image||item?.image||'';
    return {
      id:r.id||item?.id||r.alias||item?.alias||title,
      title,
      image,
      rating:r.averageScore||r.rating||item?.rating||'—',
      votes:r.votes||r.ratingCount||item?.votes||null,
      year:r.year||r.season?.year||item?.year||null,
      episodes:r.episodes||r.episodes_count||item?.episodes||0,
      status:r.status||item?.status||'',
      duration:r.duration||item?.duration||0,
      type:r.type||item?.type||'Аниме',
      genres:Array.isArray(r.genres)?r.genres.map(g=>typeof g==='string'?g:(g?.name||g?.russian||'')).filter(Boolean):[],
      description:r.description||item?.description||''
    };
  }
  async function fallback(query){
    const q=String(query||'').trim();
    if(!q)return [];
    const response=await fetch(API+encodeURIComponent(q),{cache:'no-store'});
    if(!response.ok)throw new Error('AniLibria search API: '+response.status);
    const json=await response.json();
    const list=Array.isArray(json)?json:(Array.isArray(json?.data)?json.data:[]);
    return list.map(normalize).filter(Boolean);
  }
  window.searchAnimeApi=async function(query,filters){
    let result=[];
    try{result=await originalSearch(query,filters)}catch(e){console.warn('AnimeSpace AniList search failed, using AniLibria fallback:',e)}
    if(Array.isArray(result)&&result.length)return result;
    if(!String(query||'').trim())return result||[];
    try{
      const fallbackResult=await fallback(query);
      if(fallbackResult.length)console.info('AnimeSpace: AniLibria fallback used');
      return fallbackResult;
    }catch(e){console.warn('AnimeSpace AniLibria fallback failed:',e);return result||[]}
  };
})();