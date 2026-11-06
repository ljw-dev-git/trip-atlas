// 콘텐츠: SNS 핫플(인스타·유튜브·블로그 링크) 저장 → 폴더·태그로 정리 → 장소로 모아 일정에 추가
import { uid, esc, parseLatLng } from '../../../src/util.js';
import { getTrip } from '../../../src/store.js';
import { imgUrl } from '../../../src/images.js';
import { ic } from '../icons.js';
import { pin, setPin, platformOf, PLATFORM, youtubeThumb } from '../pinstore.js';
import { currentTrip } from '../current.js';
import { sheet, closeSheet, toast, formData } from '../ui.js';
import { addPlaceFromContent } from './plan.js';

const CATS = ['맛집', '카페', '관광', '쇼핑', '숙소', '기타'];
let view = { tab: 'content', folder: 'all', sort: 'new', cat: '' };

export function renderContents(root) {
  const s = pin();
  const inFolder = s.contents.filter(c => view.folder === 'all' || c.folderId === view.folder);
  const list = inFolder.filter(c => !view.cat || c.category === view.cat).sort((a, b) => view.sort === 'new' ? b.created - a.created : a.created - b.created);
  const placeMap = new Map();
  inFolder.filter(c => c.placeName).forEach(c => { const k = c.placeName; if (!placeMap.has(k)) placeMap.set(k, []); placeMap.get(k).push(c); });
  const folderName = view.folder === 'all' ? '전체 폴더' : (s.folders.find(f => f.id === view.folder) || {}).name || '폴더';

  root.innerHTML = `<div class="page-title"><button class="folder-btn" id="folder">${esc(folderName)} ${ic('down')}</button><button class="btn primary sm" id="add">${ic('plus')} 저장</button></div>
  <div class="tabs2"><button class="${view.tab === 'content' ? 'on' : ''}" data-t="content">콘텐츠 ${inFolder.length}</button><button class="${view.tab === 'place' ? 'on' : ''}" data-t="place">장소 ${placeMap.size}</button></div>
  ${view.tab === 'content' ? `<div class="filter-row"><select id="sort" aria-label="정렬"><option value="new" ${view.sort === 'new' ? 'selected' : ''}>최신순</option><option value="old" ${view.sort === 'old' ? 'selected' : ''}>오래된순</option></select>
    <div class="chips">${['', ...CATS].map(c => `<button class="chip sm ${view.cat === c ? 'on' : ''}" data-c="${c}">${c || '전체'}</button>`).join('')}</div></div>
  <div class="cont-list">${list.map(card).join('') || emptyState(s)}</div>`
  : `<div class="cont-list">${[...placeMap.entries()].map(([name, cs]) => `<div class="place-row"><span class="pin-ic">${ic('pin')}</span><div><b>${esc(name)}</b><small>콘텐츠 ${cs.length} · ${esc(cs[0].category || '')}${cs[0].lat != null ? ' · 좌표 있음' : ''}</small></div><button class="btn sm" data-addplan="${cs[0].id}">${ic('plus')} 일정</button></div>`).join('') || '<p class="muted pad center">콘텐츠에 장소 이름을 붙이면 여기 모여요</p>'}</div>`}`;

  root.querySelector('#add').onclick = () => editSheet();
  root.querySelector('#folder').onclick = () => folderSheet();
  root.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { view.tab = b.dataset.t; renderContents(root); });
  const so = root.querySelector('#sort'); if (so) so.onchange = () => { view.sort = so.value; renderContents(root); };
  root.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { view.cat = b.dataset.c; renderContents(root); });
  root.querySelectorAll('[data-addplan]').forEach(b => b.onclick = () => addToPlan(b.dataset.addplan));
  root.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editSheet(pin().contents.find(c => c.id === b.dataset.edit)));
  const ex = root.querySelector('#sample'); if (ex) ex.onclick = loadSamples;
}

function card(c) {
  const pf = PLATFORM[c.platform] || PLATFORM.web;
  return `<article class="cont">
    <a class="thumb" ${c.url ? `href="${esc(c.url)}" target="_blank" rel="noopener"` : ''} style="${c.thumb ? `background-image:url('${esc(c.thumb)}')` : `--h:${(c.title.length * 37) % 360}`}">${c.thumb ? '' : `<span>${esc(c.title.slice(0, 1))}</span>`}</a>
    <div class="cbody">
      <div class="ct"><span class="cat">${esc(c.category || '기타')}</span>${c.placeName ? `<span class="muted small">${ic('pin')} ${esc(c.placeName)}</span>` : ''}</div>
      <b>${esc(c.title)}</b>
      ${c.tags.length ? `<div class="tags">${c.tags.map(t => `<span>#${esc(t)}</span>`).join('')}</div>` : ''}
      <div class="cf"><span class="pf" style="--c:${pf.color}">${esc(pf.label)}</span>${c.handle ? `<span class="muted small">${esc(c.handle)}</span>` : ''}
        ${c.placeName ? `<button class="mini acc" data-addplan="${c.id}">${ic('plus')} 일정</button>` : ''}<button class="mini" data-edit="${c.id}">편집</button></div>
    </div><span class="flag" aria-hidden="true"></span></article>`;
}

function emptyState(s) {
  return `<div class="empty pad"><strong>저장한 콘텐츠가 없어요</strong>인스타그램·유튜브·블로그에서 본 핫플 링크를 붙여 넣으면 폴더별로 모아 두고 일정에 바로 넣을 수 있어요.
    ${s.contents.length ? '' : `<button class="btn" id="sample">예시 콘텐츠 불러오기</button>`}</div>`;
}

function folderSheet() {
  const s = pin();
  const sh = sheet(`<div class="opt-list"><button class="opt ${view.folder === 'all' ? 'on' : ''}" data-f="all">${ic('folder')} 전체 폴더 <small>${s.contents.length}</small></button>
    ${s.folders.map(f => `<button class="opt ${view.folder === f.id ? 'on' : ''}" data-f="${f.id}">${ic('folder')} ${esc(f.name)} <small>${s.contents.filter(c => c.folderId === f.id).length}</small></button>`).join('')}</div>
    <form class="form row" id="nf"><input name="name" placeholder="새 폴더 이름 (예: 오사카 맛집)" required><button class="btn">만들기</button></form>`, { title: '폴더' });
  sh.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { view.folder = b.dataset.f; closeSheet(); renderContents(document.getElementById('main')); });
  sh.querySelector('#nf').onsubmit = e => { e.preventDefault(); const name = formData(e.target).name; const id = 'f-' + uid(); setPin(p => p.folders.push({ id, name })); view.folder = id; closeSheet(); };
}

function editSheet(c = null) {
  const s = pin(); const v0 = c || { url: '', title: '', category: '맛집', tags: [], placeName: '', folderId: view.folder !== 'all' ? view.folder : s.folders[0].id, handle: '', note: '' };
  const sh = sheet(`<form class="form" id="f">
    <label>링크 (인스타·유튜브·블로그·지도)<input name="url" type="url" value="${esc(v0.url)}" placeholder="https://www.instagram.com/p/..."></label>
    <p class="muted small" id="pf"></p>
    <label>제목<input name="title" value="${esc(v0.title)}" required placeholder="예: 줄 서도 먹는 난바 타코야키"></label>
    <div class="chips" id="cats">${CATS.map(x => `<button type="button" class="chip ${x === v0.category ? 'on' : ''}" data-c="${x}">${x}</button>`).join('')}</div><input type="hidden" name="category" value="${esc(v0.category)}">
    <label>장소 이름 (일정에 넣을 때 사용)<input name="placeName" value="${esc(v0.placeName)}" placeholder="예: 와나카 타코야키 본점"></label>
    <label>좌표 또는 구글 지도 링크 (선택)<input name="loc" value="${v0.lat != null ? `${v0.lat}, ${v0.lng}` : ''}" placeholder="34.6687, 135.5013"></label>
    <div class="two"><label>해시태그<input name="tags" value="${esc(v0.tags.join(' '))}" placeholder="오사카 타코야키"></label><label>계정<input name="handle" value="${esc(v0.handle)}" placeholder="@travel_kim"></label></div>
    <label>폴더<select name="folderId">${s.folders.map(f => `<option value="${f.id}" ${f.id === v0.folderId ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></label>
    <div class="two">${c ? `<button type="button" class="btn danger" id="del">${ic('trash')} 삭제</button>` : '<span></span>'}<button class="btn primary">${c ? '저장' : '저장하기'}</button></div></form>`, { title: c ? '콘텐츠 편집' : '핫플 저장' });
  const f = sh.querySelector('#f');
  const hint = () => { const p = platformOf(f.url.value); sh.querySelector('#pf').textContent = f.url.value ? `${PLATFORM[p].label} 링크로 저장돼요` : ''; };
  f.url.oninput = hint; hint();
  sh.querySelector('#cats').onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; sh.querySelectorAll('#cats .chip').forEach(x => x.classList.toggle('on', x === b)); f.category.value = b.dataset.c; };
  f.onsubmit = e => {
    e.preventDefault(); const v = formData(f);
    const ll = parseLatLng(v.loc) || parseLatLng(v.url);
    const rec = { url: v.url, title: v.title, category: v.category, placeName: v.placeName, handle: v.handle && !v.handle.startsWith('@') ? '@' + v.handle : v.handle, folderId: v.folderId, tags: v.tags.split(/[\s,#]+/).filter(Boolean), platform: platformOf(v.url), lat: ll?.lat ?? null, lng: ll?.lng ?? null };
    rec.thumb = youtubeThumb(v.url) || (c && c.thumb) || '';
    setPin(p => { if (c) Object.assign(p.contents.find(x => x.id === c.id), rec); else p.contents.unshift(Object.assign({ id: uid(), created: Date.now() }, rec)); });
    closeSheet(); toast(c ? '수정했어요' : '핫플을 저장했어요');
  };
  const del = sh.querySelector('#del'); if (del) del.onclick = () => { setPin(p => { p.contents = p.contents.filter(x => x.id !== c.id); }); closeSheet(); };
}

function addToPlan(cid) {
  const c = pin().contents.find(x => x.id === cid); const t = currentTrip();
  if (!t) return toast('먼저 일정 탭에서 여행을 만들어 주세요');
  const sh = sheet(`<p class="muted small">${esc(t.title)}</p><div class="opt-list">${t.days.map((d, i) => `<button class="opt" data-d="${i}">Day ${i + 1} · ${d.date.slice(5).replace('-', '.')} <small>${d.stops.length}곳</small></button>`).join('')}</div>`, { title: `'${c.placeName}' 일정에 추가` });
  sh.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { addPlaceFromContent(getTrip(t.id), c, +b.dataset.d); closeSheet(); toast(`Day ${+b.dataset.d + 1}에 추가했어요`); });
}

// 예시: 현재 여행의 장소 사진으로 SNS 저장 예시 4개
function loadSamples() {
  const t = currentTrip(); const fid = 'f-' + uid();
  const ps = t ? t.places.filter(p => p.photo && p.lat != null).slice(0, 5) : [];
  const catOf = p => ({ food: '맛집', cafe: '카페', shop: '쇼핑', stay: '숙소' })[p.category] || '관광';
  const titles = ['여기는 꼭 가야 함, 저장해 두기', '현지인이 추천한 숨은 스팟', '사진 맛집 시간대 메모', '줄 서도 가는 곳', '비 오는 날 대안 코스'];
  setPin(s => {
    s.folders.push({ id: fid, name: `${t ? t.destination.split(',')[0] : '여행'} 핫플 (예시)` });
    ps.forEach((p, i) => s.contents.push({ id: uid(), created: Date.now() - i * 3600e3, url: p.url || '', title: `${p.name} — ${titles[i % titles.length]}`, category: catOf(p), placeName: p.name, handle: '@pintrip_sample', folderId: fid, tags: [t.destination.split(',')[0].trim(), catOf(p)], platform: platformOf(p.url || ''), lat: p.lat, lng: p.lng, thumb: p.photo.startsWith('img:') ? '' : imgUrl(p.photo) }));
  });
  view.folder = fid;
  toast(ps.length ? `예시 콘텐츠 ${ps.length}개를 불러왔어요` : '사진이 있는 장소가 없어 예시를 만들지 못했어요');
}
