// 모달·토스트·확인창 등 UI 헬퍼
import { esc } from './util.js';

const root = () => document.getElementById('modal-root');

export function openModal(innerHTML, { wide = false, onClose } = {}) {
  const r = root();
  r.innerHTML = `<div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true">${innerHTML}</div>`;
  r.hidden = false;
  document.body.style.overflow = 'hidden';
  const modal = r.firstElementChild;
  const close = () => { closeModal(); onClose && onClose(); };
  r.onclick = e => { if (e.target === r) close(); };
  modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  const onKey = e => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
  setTimeout(() => { const f = modal.querySelector('input:not([type=hidden]),select,textarea,button'); f && f.focus(); }, 30);
  return modal;
}

export function closeModal() {
  const r = root();
  r.hidden = true; r.innerHTML = ''; r.onclick = null;
  document.body.style.overflow = '';
}

let toastTimer;
export function toast(msg, { err = false, ms = 2400 } = {}) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

export function confirmDialog(message, { ok = '삭제', danger = true, title = '확인' } = {}) {
  return new Promise(resolve => {
    const m = openModal(`
      <div class="modal-head"><div><h2>${esc(title)}</h2><p>${esc(message)}</p></div></div>
      <div class="form-actions"><div></div><div><button class="btn" type="button" data-close>취소</button><button class="btn ${danger ? 'danger' : 'primary'}" type="button" id="cf-ok">${esc(ok)}</button></div></div>`,
      { onClose: () => resolve(false) });
    m.querySelector('#cf-ok').onclick = () => { closeModal(); resolve(true); };
  });
}

export function promptDialog(title, { label = '', value = '', placeholder = '', ok = '확인' } = {}) {
  return new Promise(resolve => {
    const m = openModal(`
      <div class="modal-head"><h2>${esc(title)}</h2></div>
      <form id="pf"><div class="field"><label>${esc(label)}</label><input name="v" value="${esc(value)}" placeholder="${esc(placeholder)}"></div>
      <div class="form-actions"><div></div><div><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="submit">${esc(ok)}</button></div></div></form>`,
      { onClose: () => resolve(null) });
    m.querySelector('#pf').onsubmit = e => { e.preventDefault(); const v = e.target.v.value.trim(); closeModal(); resolve(v); };
  });
}

export function formValues(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'number') out[el.name] = el.value === '' ? null : Number(el.value);
    else out[el.name] = el.value;
  }
  return out;
}

export const option = (value, label, selected) => `<option value="${esc(value)}"${selected ? ' selected' : ''}>${esc(label)}</option>`;


// 사진 크게 보기. caption/onCaption/onDelete 는 선택.
export function openLightbox({ src, caption = '', meta = '', credit = '', onCaption, onDelete } = {}) {
  const m = openModal(`
    <figure class="lb">
      <img src="${esc(src)}" alt="${esc(caption)}">
      <figcaption>
        ${onCaption ? `<input class="lb-cap" value="${esc(caption)}" placeholder="사진 설명 (자동 저장)">` : (caption ? `<span>${esc(caption)}</span>` : '')}
        <span class="lb-meta">${esc(meta)}${credit ? ` · <a href="${esc(credit)}" target="_blank" rel="noopener">출처 ↗</a>` : ''}</span>
        <span class="lb-acts"><a href="${esc(src)}" target="_blank" rel="noopener" class="btn sm ghost">원본 열기</a>${onDelete ? '<button class="btn sm ghost danger" type="button" id="lb-del">삭제</button>' : ''}<button class="btn sm" type="button" data-close>닫기</button></span>
      </figcaption>
    </figure>`, { wide: true });
  m.classList.add('lightbox');
  const cap = m.querySelector('.lb-cap');
  if (cap && onCaption) { let t; cap.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => onCaption(cap.value.trim()), 400); }); }
  const del = m.querySelector('#lb-del');
  if (del) del.onclick = async () => { if (await confirmDialog('이 사진을 삭제할까요?')) { onDelete(); } };
  return m;
}