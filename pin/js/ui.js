// 바텀시트·토스트·공통 조각
import { esc } from '../../src/util.js';
import { ic } from './icons.js';

const root = () => document.getElementById('sheet-root');
let onCloseFn = null;

export function sheet(inner, { title = '', onClose, full = false } = {}) {
  const r = root();
  r.innerHTML = `<div class="sheet-bg" data-close></div><section class="sheet ${full ? 'full' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="sheet-grab"></div>${title ? `<div class="sheet-hd"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="닫기">${ic('x')}</button></div>` : ''}
    <div class="sheet-body">${inner}</div></section>`;
  r.hidden = false;
  onCloseFn = onClose || null;
  requestAnimationFrame(() => r.classList.add('on'));
  r.querySelectorAll('[data-close]').forEach(b => b.onclick = closeSheet);
  const first = r.querySelector('input,select,textarea'); if (first && !('ontouchstart' in window)) first.focus();
  return r.querySelector('.sheet');
}
export function closeSheet() {
  const r = root(); if (r.hidden) return;
  r.classList.remove('on');
  setTimeout(() => { r.hidden = true; r.innerHTML = ''; }, 180);
  const f = onCloseFn; onCloseFn = null; if (f) f();
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

let tt;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.hidden = false; t.classList.add('on');
  clearTimeout(tt); tt = setTimeout(() => { t.classList.remove('on'); setTimeout(() => t.hidden = true, 200); }, 2200);
}

export const sample = (txt = '샘플 데이터') => `<span class="sample" title="실제 판매처와 연결되지 않은 예시 가격입니다">${txt}</span>`;
export const won = n => '₩' + Math.round(Number(n) || 0).toLocaleString('ko-KR');
export const avatar = (name, i = 0) => `<span class="av" style="--h:${(i * 67 + 250) % 360}" title="${esc(name)}">${esc((name || '?').slice(0, 1))}</span>`;
export const subHeader = (title, right = '') => `<div class="subhd"><button class="icon-btn" onclick="history.length>1?history.back():location.hash='#/'" aria-label="뒤로">${ic('back')}</button><h1>${esc(title)}</h1><div class="subhd-r">${right}</div></div>`;
export function formData(form) { const o = {}; new FormData(form).forEach((v, k) => { o[k] = typeof v === 'string' ? v.trim() : v; }); return o; }
