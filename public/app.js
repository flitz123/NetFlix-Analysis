const state={analytics:null,movies:null,filtered:null,page:1,pageSize:15};
const $=(s)=>document.querySelector(s);
const money=(n)=>new Intl.NumberFormat("en",{notation:"compact",maximumFractionDigits:1}).format(n);
const chartDefaults={responsive:true,maintainAspectRatio:true};

async function init(){
  try{
    const [analytics,movies]=await Promise.all([
      fetch("/data/analytics.json").then(r=>{if(!r.ok)throw new Error("Analytics unavailable");return r.json()}),
      fetch("/data/movies.json").then(r=>{if(!r.ok)throw new Error("Catalog unavailable");return r.json()})
    ]);
    state.analytics=analytics;state.movies=movies;state.filtered=movies;
    populateDashboard();populateFilters();renderCatalog();
    $("#loading").classList.add("hidden");
  }catch(error){
    $("#loading").innerHTML=`<p>Unable to load data.</p><small>${error.message}</small>`;
  }
}

function populateDashboard(){
  const s=state.analytics.summary;
  $("#dataset-range").textContent=`${s.date_min.slice(0,4)}–${s.date_max.slice(0,4)} • ${s.movie_count.toLocaleString()} titles`;
  const kpis=[
    ["🎬","Movies",money(s.movie_count),`${s.languages} languages`],
    ["★","Average rating",s.average_rating,`Median ${s.median_rating}`],
    ["↗","Avg. popularity",s.average_popularity,`Std. dev. ${s.rating_stddev}`],
    ["♥","Community votes",money(s.total_votes),"Across all titles"]
  ];
  $("#kpis").innerHTML=kpis.map(([icon,label,value,detail])=>`<article class="kpi"><div class="kpi-icon">${icon}</div><span class="kpi-label">${label}</span><strong>${value}</strong><small>${detail}</small></article>`).join("");
  drawCharts();
  renderCategories();
}

function chartColors(){return {grid:"#26262c",text:"#9a9aa4"}}
function drawCharts(){
  if(!window.Chart)return;
  Chart.defaults.color=chartColors().text;Chart.defaults.borderColor=chartColors().grid;Chart.defaults.font.family='"DM Sans",sans-serif';
  const a=state.analytics;
  new Chart($("#ratingChart"),{type:"bar",data:{labels:a.rating_distribution.map(x=>x.range),datasets:[{data:a.rating_distribution.map(x=>x.count),backgroundColor:"#ef3340",borderRadius:5,barThickness:18}]},options:{...chartDefaults,plugins:{legend:{display:false}},scales:{x:{grid:{display:false}},y:{grid:{color:"#222228"},border:{display:false},ticks:{maxTicksLimit:5}}}}});
  const topGenres=a.genres.slice(0,8);
  new Chart($("#genreChart"),{type:"bar",data:{labels:topGenres.map(x=>x.genre),datasets:[{label:"Average rating",data:topGenres.map(x=>x.average_rating),backgroundColor:"#ef3340",borderRadius:4}]},options:{...chartDefaults,indexAxis:"y",plugins:{legend:{display:false}},scales:{x:{min:0,max:10,grid:{color:"#222228"},ticks:{maxTicksLimit:5}},y:{grid:{display:false}}}}});
  const recent=a.years.filter(x=>x.year>=1900);
  new Chart($("#yearChart"),{type:"line",data:{labels:recent.map(x=>x.year),datasets:[{data:recent.map(x=>x.count),borderColor:"#ef3340",backgroundColor:"rgba(239,51,64,.08)",fill:true,tension:.35,pointRadius:0,borderWidth:2}]},options:{...chartDefaults,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:8}},y:{grid:{color:"#222228"},border:{display:false}}}}});
}

function renderCategories(){
  const rows=state.analytics.rating_categories;
  const total=state.analytics.summary.movie_count;
  const order=["Excellent","Good","Average","Poor"];
  const normalized=order.map(name=>rows.find(x=>x.category===name)||{category:name,count:0});
  $("#category-bars").innerHTML=normalized.map(x=>{const pct=x.count/total*100;return `<div class="category-row"><span>${x.category}</span><div class="category-track"><div class="category-fill" style="width:${pct}%"></div></div><b>${Math.round(pct)}%</b></div>`}).join("");
}

function populateFilters(){
  const genres=[...new Set(state.movies.flatMap(m=>m.genre.split(",").map(x=>x.trim())).filter(x=>x&&x!="Unknown"))].sort();
  const years=[...new Set(state.movies.map(m=>m.release_year).filter(Boolean))].sort((a,b)=>b-a);
  $("#genre-filter").insertAdjacentHTML("beforeend",genres.map(x=>`<option>${x}</option>`).join(""));
  $("#year-filter").insertAdjacentHTML("beforeend",years.map(x=>`<option>${x}</option>`).join(""));
  ["genre-filter","year-filter","rating-filter","sort-filter"].forEach(id=>$("#"+id).addEventListener("change",applyFilters));
  $("#search").addEventListener("input",applyFilters);
  document.addEventListener("keydown",e=>{if(e.key==="/"&&document.activeElement!==$("#search")){e.preventDefault();$("#search").focus()}});
  renderGenreTable();
}

function applyFilters(){
  const query=$("#search").value.trim().toLowerCase();
  const genre=$("#genre-filter").value,year=$("#year-filter").value,rating=$("#rating-filter").value,sort=$("#sort-filter").value;
  let result=state.movies.filter(m=>(!query||m.title.toLowerCase().includes(query)||m.overview.toLowerCase().includes(query))&&(!genre||m.genre.split(",").map(x=>x.trim()).includes(genre))&&(!year||m.release_year===Number(year))&&(!rating||m.rating_category===rating));
  result.sort((a,b)=>sort==="title"?a.title.localeCompare(b.title):sort==="rating"?b.vote_average-a.vote_average:sort==="votes"?b.vote_count-a.vote_count:b.popularity-a.popularity);
  state.filtered=result;state.page=1;renderCatalog();
}

function renderCatalog(){
  const result=state.filtered||[];
  const pages=Math.max(1,Math.ceil(result.length/state.pageSize));
  state.page=Math.min(state.page,pages);
  const start=(state.page-1)*state.pageSize;
  const visible=result.slice(start,start+state.pageSize);
  $("#result-count").textContent=`${result.length.toLocaleString()} titles`;
  $("#movie-grid").innerHTML=visible.map((m,i)=>`
    <article class="movie-card" data-index="${start+i}" tabindex="0">
      <div class="poster"><img loading="lazy" src="${m.poster_url||""}" alt="${escapeHtml(m.title)} poster" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22450%22%3E%3Crect width=%22300%22 height=%22450%22 fill=%22%2318181d%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 fill=%22%23777%22 text-anchor=%22middle%22 font-family=%22sans-serif%22%3ENo poster%3C/text%3E%3C/svg%3E'"><span class="score"><b>★</b> ${m.vote_average.toFixed(1)}</span></div>
      <div class="movie-info"><h3>${escapeHtml(m.title)}</h3><p>${m.release_year||"Unknown"} • ${escapeHtml(m.genre.split(",")[0])}</p></div>
    </article>`).join("");
  document.querySelectorAll(".movie-card").forEach(card=>{card.addEventListener("click",()=>openMovie(Number(card.dataset.index)));card.addEventListener("keydown",e=>{if(e.key==="Enter")openMovie(Number(card.dataset.index))})});
  const first=Math.max(1,state.page-2),last=Math.min(pages,first+4);
  let buttons="";
  for(let p=first;p<=last;p++)buttons+=`<button class="${p===state.page?"active":""}" data-page="${p}">${p}</button>`;
  $("#pagination").innerHTML=buttons;
  document.querySelectorAll(".pagination button").forEach(b=>b.addEventListener("click",()=>{state.page=Number(b.dataset.page);renderCatalog();window.scrollTo({top:0,behavior:"smooth"})}));
}

function openMovie(index){
  const m=state.filtered[index];
  if(!m)return;
  $("#modal-poster").src=m.poster_url||"";
  $("#modal-poster").alt=`${m.title} poster`;
  $("#modal-meta").textContent=`${m.release_year||"Unknown"} • ${m.language.toUpperCase()} • ${m.genre}`;
  $("#modal-title").textContent=m.title;$("#modal-rating").textContent=m.vote_average.toFixed(1);
  $("#modal-popularity").textContent=m.popularity.toFixed(0);$("#modal-votes").textContent=money(m.vote_count);
  $("#modal-overview").textContent=m.overview||"No overview available.";
  $("#movie-modal").classList.add("open");$("#movie-modal").setAttribute("aria-hidden","false");
}
function closeModal(){$("#movie-modal").classList.remove("open");$("#movie-modal").setAttribute("aria-hidden","true")}
$(".modal-backdrop").addEventListener("click",closeModal);$(".modal-close").addEventListener("click",closeModal);
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal()});

function renderGenreTable(){
  $("#genre-table").innerHTML=state.analytics.genres.map(g=>{
    const width=Math.min(100,g.average_rating/10*100);
    return `<tr><td><strong>${escapeHtml(g.genre)}</strong></td><td>${g.count.toLocaleString()}</td><td>★ ${g.average_rating.toFixed(2)}</td><td>${g.average_popularity.toFixed(1)}</td><td><div class="performance"><i style="width:${width}%"></i></div></td></tr>`;
  }).join("");
}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}

document.querySelectorAll(".nav-item").forEach(button=>button.addEventListener("click",()=>{
  document.querySelectorAll(".nav-item").forEach(x=>x.classList.remove("active"));button.classList.add("active");
  document.querySelectorAll(".view").forEach(x=>x.classList.remove("active"));
  const view=button.dataset.view;
  $("#"+view+"-view").classList.add("active");
  $("#page-title").textContent=view==="overview"?"Overview":view==="catalog"?"Movie catalog":"Genre analysis";
}));
$("#download-data").addEventListener("click",()=>{window.location.href="/data/movies_clean.csv"});
init();
