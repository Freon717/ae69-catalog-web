const $=s=>document.querySelector(s);
const search=$('#search'),category=$('#category'),panel=$('#searchPanel'),results=$('#results');
const summary=$('#summary'),details=$('#details'),body=$('#detailsBody'),more=$('#loadMore');
const favoriteCount=$('#favoriteCount'),toast=$('#toast'),zoom=$('#zoom'),zoomImg=$('#zoomImg');
const PAGE=50;
let offset=0,mode='catalog',timer,current=null,metaStatus='';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({ '&':'&', '<':'<', '>':'>', '"':'"', "'":'&#39;' }[c]));
const read=key=>{try{return JSON.parse(localStorage.getItem(key)||'[]')}catch{return[]}};
const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
const favorites=()=>read('ae69-favorites');
const recent=()=>read('ae69-recent');
const photoSrc=url=>{
  if(!url)return '';
  try{return Catalog.photoUrl(url)||url}catch{return url}
};

function applyTheme(){
  const stored=localStorage.getItem('ae69-theme');
  const dark=stored?stored==='dark':window.matchMedia('(prefers-color-scheme:dark)').matches;
  document.documentElement.dataset.theme=dark?'dark':'light';
  const btn=$('#themeBtn');
  if(btn)btn.textContent=dark?'Светлая':'Тёмная';
}
function toggleTheme(){
  const next=document.documentElement.dataset.theme==='dark'?'light':'dark';
  localStorage.setItem('ae69-theme',next);
  applyTheme();
}

function rebuildCategories(){
  const keep=category.value;
  category.innerHTML='<option value="">Все категории</option>';
  try{
    JSON.parse(Catalog.categories()).forEach(c=>{
      category.insertAdjacentHTML('beforeend',`<option value="${esc(c.key)}">${esc(c.name)} (${c.count})</option>`);
    });
  }catch(e){}
  if([...category.options].some(o=>o.value===keep)) category.value=keep;
}

function formatDate(iso){
  if(!iso)return '';
  const d=new Date(iso);
  if(Number.isNaN(d.getTime())){
    const m=String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(!m)return '';
    return `${m[3]}.${m[2]}.${m[1]}`;
  }
  const dd=String(d.getDate()).padStart(2,'0');
  const mm=String(d.getMonth()+1).padStart(2,'0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function renderMeta(){
  try{
    const info=JSON.parse(Catalog.catalogInfo());
    const meta=$('#catalogMeta');
    if(!meta)return;
    const date=formatDate(info.updatedAt);
    const parts=[`Версия ${info.appVersion}`, `${info.productCount} позиций`];
    if(date) parts.push(`обновлён ${date}`);
    if(metaStatus) parts.push(metaStatus);
    else if(info.online===false) parts.push('нет сети');
    meta.textContent=parts.join(' · ');
  }catch(e){}
}

function onCatalogUpdated(info){
  if(!info)return;
  if(info.status==='updated'){
    metaStatus='';
    rebuildCategories();
    renderMeta();
    if(mode==='catalog')runSearch(true);else renderSaved();
    flash(info.message||'Каталог обновлён');
  }else if(info.status==='current'){
    metaStatus='актуален';
    renderMeta();
    if(info.message)flash(info.message);
    setTimeout(()=>{metaStatus='';renderMeta()},2500);
  }else if(info.status==='offline'){
    metaStatus='нет сети';
    renderMeta();
    if(info.message)flash(info.message);
  }else if(info.message){
    renderMeta();
    flash(info.message);
  }
}

function init(){
  applyTheme();
  showInstallTip();
  Catalog.ready.then(()=>{
    rebuildCategories();
    renderMeta();
    updateFavoriteCount();
    runSearch(true);
  }).catch(()=>{
    flash('Нет каталога. Откройте с интернетом один раз.');
  });
}

function showInstallTip(){
  const standalone=window.matchMedia('(display-mode:standalone)').matches||window.navigator.standalone===true;
  if(standalone||localStorage.getItem('ae69-hide-install'))return;
  if(!/iphone|ipad|ipod/i.test(navigator.userAgent))return;
  const tip=document.getElementById('installTip');
  if(!tip)return;
  tip.hidden=false;
  const close=document.getElementById('installTipClose');
  if(close)close.addEventListener('click',()=>{
    tip.hidden=true;
    localStorage.setItem('ae69-hide-install','1');
  });
}

function runSearch(reset){
  if(mode!=='catalog')return renderSaved();
  if(reset){offset=0;results.innerHTML=''}
  const page=JSON.parse(Catalog.search(search.value,category.value,offset,PAGE));
  results.insertAdjacentHTML('beforeend',page.items.map(card).join(''));
  offset+=page.items.length;
  summary.textContent=`Показано: ${offset} из ${page.total}`;
  more.hidden=!page.hasMore;
  if(!page.total)results.innerHTML='<div class="empty">Ничего не найдено</div>';
}

function card(p){
  const selected=favorites().includes(String(p.code));
  const thumb=p.photo?`<img class="thumb" src="${esc(photoSrc(p.photo))}" alt="" loading="lazy">`:`<div class="thumb placeholder">${esc(String(p.code||'').slice(0,3))}</div>`;
  return `<article class="card">
    <button class="card-main" data-open="${esc(p.code)}">
      ${thumb}
      <div class="card-text">
        <div class="topline"><span class="code">${esc(p.code)}</span><span class="article">${esc(p.article)||'без артикула'}</span></div>
        <div class="name">${esc(p.name)}</div>
        <div class="category">${esc(p.category)}${p.photoCount?` · фото: ${p.photoCount}`:''}</div>
      </div>
    </button>
    <button class="star ${selected?'selected':''}" data-favorite="${esc(p.code)}" aria-label="Избранное">${selected?'★':'☆'}</button>
  </article>`;
}

function renderSaved(){
  const codes=mode==='favorites'?favorites():recent();
  const items=codes.map(code=>JSON.parse(Catalog.product(code))).filter(p=>p.code).map(p=>({
    code:p.code,article:p.article,name:p.name,category:p.category,photoCount:(p.photos||[]).length,photo:(p.photos||[])[0]
  }));
  results.innerHTML=items.length?items.map(card).join(''):`<div class="empty">${mode==='favorites'?'Добавляйте товары звёздочкой':'Здесь появятся просмотренные товары'}</div>`;
  summary.textContent=`${mode==='favorites'?'В избранном':'Недавно просмотрено'}: ${items.length}`;
  more.hidden=true;
}

function listItems(items, clickable){
  return (items||[]).map((c,i)=>`<li class="${c.found===false?'missing':''}">
    ${clickable!==false && c.code?`<button class="component-link" data-component="${esc(c.code)}"><b>${i+1}. ${esc(c.code)}</b>${c.article?` · ${esc(c.article)}`:''}<br>${esc(c.name||'')}${c.quantity?` — ${esc(c.quantity)} ${esc(c.unit||'')}`:''}</button>`:`<b>${i+1}. ${esc(c.code)}</b><br>${esc(c.name||'')}`}
  </li>`).join('');
}

function openProduct(code){
  const p=JSON.parse(Catalog.product(code));
  if(!p.code)return;
  current=p;
  addRecent(p.code);
  const selected=favorites().includes(String(p.code));
  const photos=(p.photos||[]).map((src,i)=>`<figure class="photo pending" data-src="${esc(src)}">
    <div class="photo-status">Загрузка фото…</div>
    <img alt="Фото товара ${esc(p.code)}" data-zoom>
    <a href="${esc(src)}" rel="noopener">Открыть оригинал ${i+1}</a>
  </figure>`).join('');
  const components=listItems(p.components,true);
  const used=listItems(p.usedIn,true);
  const barcodes=(p.barcodes||[]).filter(Boolean);
  body.innerHTML=`<article class="detail">
    ${photos?`<div class="photos">${photos}</div>`:''}<h1>${esc(p.name)}</h1>
    <div class="meta"><button data-copy="${esc(p.code)}">Код: <b>${esc(p.code)}</b> ⧉</button>
    <button data-copy="${esc(p.article)}">Артикул: <b>${esc(p.article)||'не указан'}</b> ⧉</button>
    <span>${esc(p.category)}</span></div>
    ${barcodes.length?`<div class="meta barcode-line">${barcodes.map(b=>`<button data-copy="${esc(b)}">${esc(b)} ⧉</button>`).join('')}</div>`:''}
    <div class="detail-actions"><button class="favorite-action ${selected?'selected':''}" data-favorite="${esc(p.code)}">${selected?'★ В избранном':'☆ В избранное'}</button>
    <button data-report>Сообщить об ошибке</button></div>
    ${components?`<h2>Комплектующие</h2><ol class="components">${components}</ol>`:''}
    ${used?`<h2>Входит в состав — ${p.usedIn.length}</h2><ol class="components">${used}</ol>`:''}
    ${p.instruction?`<h2>Инструкция по сборке</h2><div class="instruction">${esc(p.instruction)}</div>`:''}
    ${!photos?'<p class="hint">Фотографии для этой позиции в базе нет.</p>':''}
    ${!components&&!used&&!p.instruction?'<p class="hint">Дополнительной информации нет.</p>':''}</article>`;
  if(!details.open)details.showModal();
  loadPhotos();
}

function loadPhotos(){
  body.querySelectorAll('.photo').forEach(figure=>{
    const source=figure.dataset.src;
    const img=figure.querySelector('img');
    const timer=setTimeout(()=>markFailed(figure),20000);
    img.onload=()=>{clearTimeout(timer);figure.className='photo ready'};
    img.onerror=()=>{clearTimeout(timer);markFailed(figure)};
    img.src=photoSrc(source);
  });
}

function markFailed(figure){
  figure.className='photo failed';
  const status=figure.querySelector('.photo-status');
  if(status)status.textContent='Фото недоступно';
}

function toggleFavorite(code){
  code=String(code);
  const list=favorites(),index=list.indexOf(code);
  if(index>=0)list.splice(index,1);else list.unshift(code);
  write('ae69-favorites',list);
  updateFavoriteCount();
  mode==='catalog'?runSearch(true):renderSaved();
  if(current&&String(current.code)===code){
    const button=body.querySelector('.favorite-action'),selected=list.includes(code);
    if(button){button.classList.toggle('selected',selected);button.textContent=selected?'★ В избранном':'☆ В избранное'}
  }
}

function addRecent(code){
  const list=recent().filter(item=>String(item)!==String(code));
  list.unshift(String(code));
  write('ae69-recent',list.slice(0,50));
}
function updateFavoriteCount(){const n=favorites().length;favoriteCount.textContent=n?`(${n})`:''}
function flash(text){toast.textContent=text;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),1800)}
function openZoom(src){if(!src)return;zoomImg.src=src;zoom.hidden=false}
function closeZoom(){zoom.hidden=true;zoomImg.removeAttribute('src')}

function showCatalogTab(){
  mode='catalog';
  document.querySelectorAll('.tab').forEach(item=>item.classList.toggle('active',item.dataset.mode==='catalog'));
  panel.hidden=false;
}

function onBarcode(value){
  if(!value)return;
  let hit={match:'none',query:value};
  try{hit=JSON.parse(Catalog.lookupScan(value))||hit}catch(e){}
  showCatalogTab();
  if(hit.match==='exact'&&hit.code){
    search.value=hit.code;
    runSearch(true);
    openProduct(hit.code);
    flash('Найдено: '+hit.code);
    return;
  }
  search.value=hit.query||value;
  runSearch(true);
  flash(hit.match==='multi'?'Несколько совпадений':'Считано: '+(hit.query||value));
}

search.addEventListener('input',()=>{
  clearTimeout(timer);
  timer=setTimeout(()=>runSearch(true),130);
});
category.addEventListener('change',()=>runSearch(true));
more.addEventListener('click',()=>runSearch(false));
$('.tabs').addEventListener('click',e=>{
  const tab=e.target.closest('[data-mode]');if(!tab)return;
  mode=tab.dataset.mode;
  document.querySelectorAll('.tab').forEach(item=>item.classList.toggle('active',item===tab));
  panel.hidden=mode!=='catalog';
  mode==='catalog'?runSearch(true):renderSaved();
});
results.addEventListener('click',e=>{
  const fav=e.target.closest('[data-favorite]');if(fav)return toggleFavorite(fav.dataset.favorite);
  const open=e.target.closest('[data-open]');if(open)openProduct(open.dataset.open);
});
body.addEventListener('click',e=>{
  const zoomable=e.target.closest('[data-zoom]');
  if(zoomable&&zoomable.tagName==='IMG'&&zoomable.src){openZoom(zoomable.src);return}
  const component=e.target.closest('[data-component]');if(component)return openProduct(component.dataset.component);
  const copy=e.target.closest('[data-copy]');
  if(copy&&copy.dataset.copy){Catalog.copyText(copy.dataset.copy);return flash('Скопировано')}
  const fav=e.target.closest('[data-favorite]');if(fav)return toggleFavorite(fav.dataset.favorite);
  if(e.target.closest('[data-report]')&&current)Catalog.shareError(current.code,current.name);
});
$('.close').addEventListener('click',()=>details.close());
details.addEventListener('click',e=>{if(e.target===details)details.close()});
zoom.addEventListener('click',closeZoom);
$('#themeBtn').addEventListener('click',toggleTheme);
$('#scanBtn').addEventListener('click',()=>{try{Catalog.scanBarcode()}catch(e){flash('Сканер недоступен')}});
$('#catalogMeta').addEventListener('click',()=>{
  metaStatus='проверяю…';
  renderMeta();
  flash('Проверяю каталог…');
  try{Catalog.checkUpdate()}catch(e){metaStatus='нет сети';renderMeta();flash('Нет сети')}
});
document.addEventListener('DOMContentLoaded',init);
applyTheme();
