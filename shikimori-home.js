const SHIKIMORI_API='https://shikimori.one/api/animes';

function normalizeShikimoriAnime(a){
  if(!a)return null;
  const year=a.aired_on?Number(String(a.aired_on).slice(0,4)):null;
  const typeMap={tv:'ТВ Сериал',movie:'Фильм',ova:'OVA',ona:'ONA',special:'Спецвыпуск',music:'Музыка',tv_special:'Спецвыпуск'};
  const image=a.image?.original||a.image?.preview||'';
  return {
    id:a.id,
    shikimoriId:a.id,
    title:a.russian||a.name||'Без названия',
    originalTitle:a.name||'',
    image:image.startsWith('http')?image:'https://shikimori.one'+image,
    rating:a.score?Number(a.score).toFixed(1):'—',
    votes:null,
    year:Number.isFinite(year)&&year>0?year:null,
    episodes:a.episodes||0,
    status:a.status||'',
    duration:a.duration||0,
    type:typeMap[a.kind]||a.kind||'Аниме',
    genres:Array.isArray(a.genres)?a.genres.map(g=>g?.russian||g?.name||'').filter(Boolean):[],
    description:a.description||'',
    source:'shikimori'
  };
}

async function loadShikimoriList(params={}){
  const query=new URLSearchParams();
  query.set('limit',String(params.limit||12));
  query.set('page',String(params.page||1));
  query.set('order',String(params.order||'popularity'));

  const response=await fetch(SHIKIMORI_API+'?'+query.toString(),{
    headers:{Accept:'application/json'},
    cache:'no-store'
  });

  if(!response.ok)throw new Error('Shikimori API: '+response.status);

  const data=await response.json();
  if(!Array.isArray(data))throw new Error('Shikimori API вернул не массив');

  return data.map(normalizeShikimoriAnime).filter(Boolean);
}

async function loadHomeFromShikimori(){
  const sections=[
    ['recommendations',{limit:12,order:'popularity',page:2}],
    ['popular',{limit:12,order:'popularity',page:1}],
    ['newAnime',{limit:12,order:'aired_on',page:1}],
    ['rated',{limit:12,order:'ranked',page:1}]
  ];

  try{
    const results=await Promise.all(
      sections.map(async([id,params])=>[id,await loadShikimoriList(params)])
    );
    results.forEach(([id,list])=>renderApiRow(id,list));
  }catch(error){
    console.error('AnimeSpace Shikimori home error:',error);
  }
}

if(document.getElementById('recommendations'))loadHomeFromShikimori();
