async function loadHomeFromApi(){
  const sections=[
    ['recommendations',{limit:12,order:'popularity',page:2}],
    ['popular',{limit:12,order:'popularity',page:1}],
    ['newAnime',{limit:12,order:'aired_on',page:1}],
    ['rated',{limit:12,order:'ranked',page:1}]
  ];
  try{
    const results=await Promise.all(sections.map(async([id,params])=>[id,await getAnimes(params)]));
    results.forEach(([id,list])=>renderApiRow(id,list));
  }catch(error){
    console.error('AnimeSpace home API:',error);
  }
}

if(document.getElementById('recommendations')) loadHomeFromApi();
