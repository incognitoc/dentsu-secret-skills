const selected = new Set();
const groupBox = document.querySelector('#groups');
const reset = document.querySelector('#reset');
const list = document.querySelector('#list');

function make(tag, content, className) {
  const node = document.createElement(tag);
  node.textContent = content;
  if (className) node.className = className;
  return node;
}

for (const [name, tags] of Object.entries(groups)) {
  const row = make('div', '', 'group');
  row.append(make('h3', name));
  const options = make('div', '', 'options');
  for (const tag of tags) {
    const button = make('button', tag);
    button.setAttribute('aria-pressed', 'false');
    button.onclick = () => {
      if (selected.has(tag)) selected.delete(tag);
      else selected.add(tag);
      render();
    };
    options.append(button);
  }
  row.append(options);
  groupBox.append(row);
}

const covers = [
  ['看懂世界','#344d52'], ['品牌與人的距離','#643c3a'], ['真實的力量','#36564c'],
  ['增長推手','#554661'], ['增長架構師','#655229'], ['信任的力量','#3a5266'],
  ['購買的渴望','#784835'], ['品牌心智','#465c3b'], ['社群與人心','#414458'],
  ['注意力之道','#775536'], ['共同記憶','#763e48'], ['消費者分身','#2e5657'],
  ['品牌占位','#394a60'], ['衡斷力','#5e493d'], ['生成式體驗','#53455b'],
  ['文化暗流','#445943'], ['顧客的猶豫','#7c5144'], ['體驗的另一半','#345962'],
  ['被記住的品牌','#554d70'], ['素材產出之法','#6f523e'], ['創意製作','#4b6058'],
  ['代理消費旅程','#684951']
];
const dialog = document.querySelector('#reader');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const books = [];
const readKey = 'dentsu-manual.read-2026';
let readBooks;
try {
  const ids = JSON.parse(localStorage.getItem(readKey) || '[]');
  readBooks = new Set(Array.isArray(ids) ? ids : []);
} catch { readBooks = new Set(); }
let matches = [];
let position = 0;
let singleTurn = 0;
let gesture = null;
let suppressClick = false;
function openBook(article, number) {
  document.querySelector('#volume').textContent = '卷 ' + number + '　／　' + article.chapter;
  const title = document.querySelector('#reader-title');
  title.replaceChildren(...article.title.split(/([嬛值娛產砍吧幫啟絕懂]+)/u).map((part, index) =>
    index % 2 ? make('span', part, 'fallback-glyph') : document.createTextNode(part)
  ));
  document.querySelector('#author').textContent = article.author;
  document.querySelector('#summary').textContent = article.summary;
  document.querySelector('#tags').textContent = article.tags.map(tag => '＃' + tag).join('　');
  dialog.querySelector('.read').href = 'pdf/' + number + '.pdf';
  dialog.showModal();
  const item = books.find(entry => entry.article.id === article.id);
  if (!readBooks.has(article.id)) {
    readBooks.add(article.id);
    try { localStorage.setItem(readKey, JSON.stringify([...readBooks])); } catch {}
    item.book.classList.add('worn');
    item.book.setAttribute('aria-label', '再次翻閱《' + article.title + '》');
    list.dispatchEvent(new Event('books-change'));
  }
}
document.querySelector('#close').onclick = () => dialog.close();
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
});

for (const article of articles) {
  const number = String(article.id).padStart(2,'0');
  const [name, color] = covers[article.id - 1];
  const book = make('button', '', 'book');
  book.style.setProperty('--cloth', color);
  book.setAttribute('aria-label', '翻開《' + article.title + '》');
  book.title = article.title;
  if (readBooks.has(article.id)) {
    book.classList.add('worn');
    book.setAttribute('aria-label', '再次翻閱《' + article.title + '》');
  }
  const jacket = make('span', '', 'jacket');
  const binding = make('span', '', 'binding');
  for (let i = 0; i < 4; i++) binding.append(make('i', ''));
  jacket.append(binding, make('span', name, 'slip'), make('span', article.chapter, 'chapter'),
    make('span', '卷' + number, 'seal'));
  book.append(make('span', '', 'book-back'), make('span', '', 'page-edge'), jacket);
  book.onclick = () => { if (!suppressClick) openBook(article, number); };
  list.append(book);
  books.push({article, book});
}

// The street direction at infinity defines the optical origin for book depth.
const cityCamera = Object.freeze({lens:1.52, sinPitch:0.06994, cosPitch:0.99755});
const arcDepthRatio = .48;
const visibleRadius = 2.65;
function bookSpacing() { return books[0].book.offsetWidth * 1.29; }
function bookDepth(distance,spacing,bookWidth) {
  const angle=Math.min(distance*.32,1.44);
  return spacing*(1-Math.cos(angle))/Math.sin(.32)*arcDepthRatio
    + bookWidth*.43*Math.min(distance,1.6);
}
function alignBookProjection() {
  const canvas = document.querySelector('#city-view').getBoundingClientRect();
  const stage = list.getBoundingClientRect();
  const focal = canvas.height * cityCamera.lens / 2;
  const horizon = canvas.top + canvas.height / 2 - focal * cityCamera.sinPitch / cityCamera.cosPitch;
  // Reserve space above the front book for the rear arc at its highest projection.
  const spacing = bookSpacing();
  const bw = books[0].book.offsetWidth;
  const rearDepth = bookDepth(Math.min(visibleRadius,(matches.length || books.length)/2),spacing,bw) + bw/2;
  const headroom = Math.ceil(Math.max(0, stage.top + window.scrollY - horizon) * rearDepth / focal);
  list.style.setProperty('--arc-clearance', headroom + 'px');
  list.style.perspective = focal + 'px';
  list.style.perspectiveOrigin = (canvas.left + canvas.width / 2 - stage.left) + 'px ' + (horizon - stage.top) + 'px';
}
const projectionObserver = new ResizeObserver(alignBookProjection);
for (const element of [list, document.querySelector('.hero'), document.querySelector('#topics'), document.querySelector('#city-view')]) {
  projectionObserver.observe(element);
}
window.addEventListener('scroll', alignBookProjection, {passive:true});
alignBookProjection();
function drawRing() {
  const total = matches.length;
  const spacing = bookSpacing();
  const active = ((Math.round(position) % total) + total) % total;
  for (let i = 0; i < total; i++) {
    const {book} = matches[i];
    let offset = ((i - position) % total + total) % total;
    if (offset > total / 2) offset -= total;
    const distance = Math.abs(offset);
    const angle = Math.min(distance * .32, 1.44);
    const x = Math.sign(offset) * spacing * Math.sin(angle) / Math.sin(.32);
    book.style.transform = 'translate(-50%,-50%) translate3d(' + x + 'px,0px,' + (-bookDepth(distance,spacing,book.offsetWidth)) + 'px) rotateY(' + (total === 1 ? singleTurn : Math.sign(offset)*angle*42) + 'deg)';
    book.style.opacity = Math.max(0,Math.min(1,(visibleRadius-distance)/.65));
    book.style.zIndex = 50-Math.round(distance*4);
    book.inert = distance >= visibleRadius;
    book.tabIndex = i === active ? 0 : -1;
  }
  list.dispatchEvent(new Event('books-change'));
  document.querySelector('#current-title').textContent = matches[active].article.title;
  document.querySelector('#prev').disabled = document.querySelector('#next').disabled = total < 2;
}
function step(delta) {
  position = Math.round(position) + delta;
  drawRing();
}
document.querySelector('#prev').onclick = () => step(-1);
document.querySelector('#next').onclick = () => step(1);
list.onkeydown = event => {
  if (!['ArrowLeft','ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  step(event.key === 'ArrowLeft' ? -1 : 1);
  list.querySelector('[tabindex="0"]').focus({preventScroll:true});
};
list.onpointerdown = event => {
  if (event.button !== 0 || !event.isPrimary) return;
  gesture = {id:event.pointerId, x:event.clientX, start:position, turn:singleTurn, moved:false};
};
list.onpointermove = event => {
  if (!gesture || gesture.id !== event.pointerId) return;
  const dx = event.clientX - gesture.x;
  if (!gesture.moved && Math.abs(dx) < 6) return;
  if (!gesture.moved) list.setPointerCapture(event.pointerId);
  gesture.moved = true;
  list.classList.add('dragging');
  if (matches.length === 1) singleTurn = gesture.turn + dx * .8;
  else position = gesture.start - dx / (list.clientWidth < 600 ? 85 : 135);
  drawRing();
};
function endGesture(event) {
  if (!gesture || gesture.id !== event.pointerId) return;
  const moved = gesture.moved;
  gesture = null;
  list.classList.remove('dragging');
  if (moved) {
    suppressClick = true;
    setTimeout(() => { suppressClick = false; },0);
    step(0);
  }
}
window.addEventListener('pointerup',endGesture);
window.addEventListener('pointercancel',endGesture);
new ResizeObserver(() => { if(matches.length) drawRing(); }).observe(list);

function render() {
  for (const button of groupBox.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', selected.has(button.textContent));
  }
  reset.disabled = !selected.size;
  document.querySelector('#filter-state').textContent = selected.size ? '已選 ' + selected.size + ' 個標籤' : '全部標籤';
  const previous = matches.length ? matches[((Math.round(position) % matches.length) + matches.length) % matches.length] : null;
  matches = books.filter(item => !selected.size || item.article.tags.some(tag => selected.has(tag)));
  for (const item of books) {
    const included = matches.includes(item);
    item.book.classList.toggle('filtered', !included);
    if (!included) { item.book.inert = true; item.book.tabIndex = -1; }
  }
  singleTurn = 0;
  position = Math.max(0,matches.indexOf(previous));
  alignBookProjection();
  drawRing();
  document.querySelector('#count').textContent = matches.length + ' / ' + books.length + ' 冊';
}
reset.onclick = () => { selected.clear(); render(); };
render();

const topics = document.querySelector('#topics');
const filterStart = document.querySelector('#filter-start');
const filterPanel = document.querySelector('#filter-panel');
const filterToggle = document.querySelector('#filter-toggle');

function expandFilters(expanded) {
  filterToggle.setAttribute('aria-expanded', String(expanded));
  if (!expanded && filterPanel.contains(document.activeElement)) filterToggle.focus({preventScroll:true});
  filterPanel.hidden = !expanded;
}
function syncStickyFilters() {
  const docked = filterStart.getBoundingClientRect().bottom <= 0;
  if (topics.classList.contains('docked') === docked) return;
  const space = document.querySelector('#filter-space');
  const fullHeight = topics.offsetHeight;
  // Reserve the space before hiding the panel. Measuring a collapsed panel
  // first can clamp scrollY to a temporarily shorter document at the footer.
  if (docked) space.style.height = fullHeight + 'px';
  topics.classList.toggle('docked', docked);
  expandFilters(!docked);
  space.style.height = docked ? Math.max(0, fullHeight - topics.offsetHeight) + 'px' : '0px';
}
filterToggle.onclick = () => expandFilters(filterPanel.hidden);
topics.addEventListener('keydown', event => {
  if (event.key === 'Escape' && topics.classList.contains('docked')) {
    expandFilters(false);
    filterToggle.focus({preventScroll:true});
  }
});
document.addEventListener('click', event => {
  if (topics.classList.contains('docked') && !topics.contains(event.target)) expandFilters(false);
});
new IntersectionObserver(syncStickyFilters).observe(filterStart);
window.addEventListener('scroll', syncStickyFilters, {passive:true});
syncStickyFilters();

const motion = document.querySelector('#motion');
function setPaused(paused) {
  document.body.classList.toggle('paused', paused);
  motion.textContent = paused ? '播放動景' : '暫停動景';
  motion.setAttribute('aria-pressed', String(paused));
}
setPaused(reducedMotion.matches);
motion.onclick = () => setPaused(!document.body.classList.contains('paused'));
reducedMotion.addEventListener('change', event => setPaused(event.matches));
