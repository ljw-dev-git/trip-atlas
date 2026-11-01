// 이미지: 업로드 사진은 리사이즈해 IndexedDB에 저장, 외부 URL(위키백과 등)은 문자열로 보관.
// 참조(ref) 형식: 'img:<id>' (로컬 저장) 또는 'https://...' (외부 URL)
import { uid } from './util.js';

const DB_NAME = 'trip-atlas-images', STORE = 'images';
const cache = new Map();
let dbp = null;

function openDB() {
  if (dbp) return dbp;
  dbp = new Promise(resolve => {
    if (!('indexedDB' in window)) return resolve(null);
    let req;
    try { req = indexedDB.open(DB_NAME, 1); } catch { return resolve(null); }
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { console.warn('이미지 저장소를 열지 못했습니다', req.error); resolve(null); };
  });
  return dbp;
}

function tx(mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    if (!db) return resolve(undefined);
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r && r.result);
    t.onerror = () => reject(t.error);
  }));
}

// 앱 시작 시 한 번: 모든 이미지를 메모리에 올려 동기 렌더에서 바로 쓴다
export async function initImages() {
  try { const all = await tx('readonly', s => s.getAll()); (all || []).forEach(rec => cache.set(rec.id, rec)); }
  catch (e) { console.warn('이미지를 불러오지 못했습니다', e); }
}

export const isLocalRef = ref => typeof ref === 'string' && ref.startsWith('img:');
export const refId = ref => isLocalRef(ref) ? ref.slice(4) : null;

export function imgUrl(ref, size = 'full') {
  if (!ref) return '';
  if (!isLocalRef(ref)) return ref;
  const rec = cache.get(refId(ref));
  if (!rec) return '';
  return size === 'thumb' ? (rec.thumb || rec.full) : rec.full;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 읽지 못했습니다')); };
    img.src = url;
  });
}

function draw(img, maxSide, quality) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return c.toDataURL('image/jpeg', quality);
}

// 파일 → 리사이즈(긴 변 1600px) + 썸네일(480px) 저장 → 'img:id'
export async function storeImage(file, { max = 1600, thumb = 480, quality = .82 } = {}) {
  if (!/^image\//.test(file.type)) throw new Error('이미지 파일이 아닙니다');
  const img = await loadImage(file);
  const rec = { id: uid(), full: draw(img, max, quality), thumb: draw(img, thumb, .8), w: img.naturalWidth, h: img.naturalHeight, created: Date.now() };
  cache.set(rec.id, rec);
  await tx('readwrite', s => s.put(rec));
  return 'img:' + rec.id;
}

export async function removeImage(ref) {
  const id = refId(ref); if (!id) return;
  cache.delete(id);
  await tx('readwrite', s => s.delete(id));
}

// 참조되지 않는 이미지 정리 (앱 시작 시)
export async function gcImages(usedIds) {
  const dead = [...cache.keys()].filter(id => !usedIds.has(id));
  for (const id of dead) { cache.delete(id); await tx('readwrite', s => s.delete(id)); }
  return dead.length;
}

export function getImageRecords(ids) {
  const out = {};
  ids.forEach(id => { const r = cache.get(id); if (r) out[id] = { full: r.full, thumb: r.thumb, w: r.w, h: r.h, created: r.created }; });
  return out;
}

export async function putImageRecords(obj) {
  let n = 0;
  for (const [id, r] of Object.entries(obj || {})) {
    if (!r || typeof r.full !== 'string' || !r.full.startsWith('data:image/')) continue;
    const rec = Object.assign({ id, thumb: r.full, created: Date.now() }, r, { id });
    cache.set(id, rec);
    await tx('readwrite', s => s.put(rec));
    n++;
  }
  return n;
}

export const imageCount = () => cache.size;
export function imageBytes() { let b = 0; cache.forEach(r => { b += (r.full?.length || 0) + (r.thumb?.length || 0); }); return Math.round(b * 3 / 4); }

// ----- 위키백과 대표 사진 검색 -----
// queries: [{ q, lang }] 순서대로 시도. 지도·국기 등 SVG는 제외.
const cleanWikiUrl = u => String(u).replace(/^https?:\/\/thumb\.wikimedia\.org\//, 'https://upload.wikimedia.org/');
export async function wikiImage(queries, { size = 1280 } = {}) {
  for (const { q, lang } of queries) {
    if (!q || !q.trim()) continue;
    try {
      const url = `https://${lang}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q.trim())}&gsrlimit=1&gsrnamespace=0&redirects=1&prop=pageimages|info&inprop=url&piprop=thumbnail|name&pithumbsize=${size}&format=json&origin=*`;
      const r = await fetch(url);
      if (!r.ok) continue;
      const j = await r.json();
      const page = Object.values(j.query?.pages || {})[0];
      const src = page?.thumbnail?.source;
      if (!src || /\.svg$/i.test(page.pageimage || '')) continue;
      const t = String(page.title || ''), qq = q.trim();
      const related = t.includes(qq) || qq.includes(t) || t.replace(/\s|\(.*\)/g, '').includes(qq.replace(/\s/g, '').slice(0, 2));
      return { url: cleanWikiUrl(src), title: page.title, pageUrl: page.fullurl, lang, q: qq, related, file: page.pageimage, credit: page.pageimage ? `${/\/wikipedia\/commons\//.test(src) ? 'https://commons.wikimedia.org' : `https://${lang}.wikipedia.org`}/wiki/File:${encodeURIComponent(page.pageimage)}` : page.fullurl };
    } catch (e) { /* 다음 언어로 */ }
  }
  return null;
}

// 장소 하나에 대한 검색어 후보 (현지어 → 한국어 → 영어)
export const placeQueries = p => [{ q: p.localName, lang: 'ja' }, { q: p.localName, lang: 'en' }, { q: p.name, lang: 'ko' }, { q: p.name, lang: 'en' }];
export const tripQueries = t => [{ q: t.destination, lang: 'ko' }, { q: t.destination, lang: 'en' }, { q: t.title, lang: 'ko' }];
