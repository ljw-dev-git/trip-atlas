// 기록: 일자별 일기 + 사진 + 여행 회고
import { updateTrip, toHome, tripStatus } from '../store.js';
import { esc, fmtDate, fmtMoney, expenseCat, debounce, uid } from '../util.js';
import { imgUrl, storeImage, removeImage } from '../images.js';
import { toast, openLightbox, closeModal } from '../ui.js';

export function renderJournal(root, trip) {
  const H = trip.homeCurrency;
  const actual = trip.expenses.filter(e => !e.planned);
  const spent = actual.reduce((s, e) => s + (toHome(trip, e.amount, e.currency) || 0), 0);
  const planned = trip.expenses.filter(e => e.planned).reduce((s, e) => s + (toHome(trip, e.amount, e.currency) || 0), 0);
  const allStops = trip.days.flatMap(d => d.stops);
  const done = allStops.filter(s => s.status === 'done').length, skip = allStops.filter(s => s.status === 'skip').length;
  const topCat = Object.entries(actual.reduce((m, e) => { m[e.category] = (m[e.category] || 0) + (toHome(trip, e.amount, e.currency) || 0); return m; }, {})).sort((a, b) => b[1] - a[1])[0];
  const topExp = [...actual].sort((a, b) => (toHome(trip, b.amount, b.currency) || 0) - (toHome(trip, a.amount, a.currency) || 0))[0];
  const ratings = trip.journal.filter(j => j.rating).map(j => j.rating);
  const avg = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : '—';
  const retro = trip.journal.find(j => j.date === 'retro') || { text: '' };
  const st = tripStatus(trip);
  const photosOf = date => trip.photos.filter(ph => ph.date === date).sort((a, b) => a.created - b.created);
  const orphan = trip.photos.filter(ph => !trip.days.some(d => d.date === ph.date));

  const photoGrid = (date, list) => `<div class="jphotos" data-date="${esc(date)}">
    ${list.map(ph => `<button type="button" class="jph" data-id="${ph.id}" title="${esc(ph.caption || '사진')}"><img src="${esc(imgUrl(ph.ref, 'thumb'))}" alt="${esc(ph.caption)}" loading="lazy">${ph.caption ? `<span class="cap">${esc(ph.caption)}</span>` : ''}</button>`).join('')}
    <label class="jph add" title="사진 올리기"><span>+</span><input type="file" accept="image/*" multiple hidden></label>
  </div>`;

  root.innerHTML = `
    <div class="journal-layout">
      <div>
        <div class="row between" style="margin-bottom:12px"><div class="muted small">${st === 'upcoming' ? '여행 전에는 기대나 준비 과정을 적어 두어도 좋습니다.' : '하루를 마치며 몇 줄만 남겨도 나중에 큰 기록이 됩니다. 입력은 자동 저장됩니다.'} 사진은 + 로 올립니다(여러 장 가능, 긴 변 1600px로 줄여 저장).</div></div>
        ${trip.days.map((d, i) => {
          const j = trip.journal.find(x => x.date === d.date) || { text: '', rating: 0 };
          const visited = d.stops.filter(s => s.status === 'done').map(s => trip.places.find(p => p.id === s.placeId)?.name || s.title).filter(Boolean);
          const skipped = d.stops.filter(s => s.status === 'skip').map(s => trip.places.find(p => p.id === s.placeId)?.name || s.title).filter(Boolean);
          const daySpent = actual.filter(e => e.date === d.date).reduce((s, e) => s + (toHome(trip, e.amount, e.currency) || 0), 0);
          return `<div class="jday" data-date="${d.date}">
            <div class="jd-head"><div><strong>Day ${i + 1} · ${fmtDate(d.date)}</strong>${d.title ? ` <span class="muted small">${esc(d.title)}</span>` : ''}</div><div class="row"><span class="num small muted">${daySpent ? fmtMoney(daySpent, H) : ''}</span><div class="stars" data-date="${d.date}">${[1, 2, 3, 4, 5].map(n => `<button type="button" class="${j.rating >= n ? 'on' : ''}" data-n="${n}" title="${n}점">★</button>`).join('')}</div></div></div>
            <textarea placeholder="오늘 어땠나요? 날씨, 먹은 것, 뜻밖의 일, 다음에 다시 온다면…">${esc(j.text)}</textarea>
            ${photoGrid(d.date, photosOf(d.date))}
            ${visited.length || skipped.length ? `<div class="visited">${visited.map(v => `<span class="chip good">✓ ${esc(v)}</span>`).join('')}${skipped.map(v => `<span class="chip outline">⊘ ${esc(v)}</span>`).join('')}</div>` : ''}
          </div>`; }).join('')}
        ${orphan.length ? `<div class="jday" data-date=""><div class="jd-head"><div><strong>날짜 없는 사진</strong></div></div>${photoGrid('', orphan)}</div>` : ''}
      </div>
      <div class="stack">
        <div class="card">
          <div class="card-title"><h3>여행 회고</h3></div>
          <div class="retro-grid">
            <div class="stat"><span class="v num">${done}<span class="muted" style="font-size:14px">/${allStops.length}</span></span><span class="l">방문한 곳</span></div>
            <div class="stat"><span class="v num">${skip}</span><span class="l">건너뛴 곳</span></div>
            <div class="stat"><span class="v num">${avg}</span><span class="l">평균 별점</span></div>
          </div>
          <dl class="kv" style="margin:14px 0 0">
            <dt>실제 지출</dt><dd class="num">${fmtMoney(spent, H)}${trip.budget.amount ? ` <span class="muted small">(예산의 ${Math.round(spent / trip.budget.amount * 100)}%)</span>` : ''}</dd>
            <dt>계획 대비</dt><dd class="num">${planned ? `${spent >= planned ? '+' : '−'}${fmtMoney(Math.abs(spent - planned), H)}` : '—'}</dd>
            <dt>사진</dt><dd class="num">${trip.photos.length}장</dd>
            ${topCat ? `<dt>가장 큰 분류</dt><dd>${expenseCat(topCat[0]).label} · <span class="num">${fmtMoney(topCat[1], H)}</span></dd>` : ''}
            ${topExp ? `<dt>최대 지출</dt><dd>${esc(topExp.note || expenseCat(topExp.category).label)} · <span class="num">${fmtMoney(topExp.amount, topExp.currency)}</span></dd>` : ''}
          </dl>
        </div>
        <div class="card flat">
          <div class="card-title"><h3>총평</h3></div>
          <textarea class="retro-text" id="retro" placeholder="이 여행을 한 문단으로. 좋았던 것, 아쉬웠던 것, 다음 여행에 가져갈 것.">${esc(retro.text)}</textarea>
        </div>
      </div>
    </div>`;

  const save = (date, patch, silent = true) => updateTrip(trip.id, t => { let j = t.journal.find(x => x.date === date); if (!j) { j = { date, text: '', rating: 0, highlights: '' }; t.journal.push(j); } Object.assign(j, patch); }, { silent });
  root.querySelectorAll('.jday textarea').forEach(ta => {
    const date = ta.closest('.jday').dataset.date;
    ta.addEventListener('input', debounce(() => save(date, { text: ta.value }), 500));
  });
  root.querySelectorAll('.stars').forEach(s => s.onclick = e => { const b = e.target.closest('button'); if (!b) return; const cur = (trip.journal.find(x => x.date === s.dataset.date) || {}).rating; save(s.dataset.date, { rating: cur === +b.dataset.n ? 0 : +b.dataset.n }, false); });
  const r = root.querySelector('#retro');
  r.addEventListener('input', debounce(() => save('retro', { text: r.value }), 500));

  // 사진 올리기 / 보기
  root.querySelectorAll('.jphotos').forEach(grid => {
    const date = grid.dataset.date;
    const input = grid.querySelector('input[type=file]');
    input.addEventListener('change', async () => {
      const files = [...input.files]; input.value = '';
      if (!files.length) return;
      const added = [];
      toast(`사진 ${files.length}장을 저장하는 중…`, { ms: 60000 });
      for (const f of files) {
        try { added.push({ id: uid(), date, ref: await storeImage(f), caption: '', created: Date.now() }); }
        catch (e) { toast(`${f.name}: ${e.message}`, { err: true }); }
      }
      if (added.length) updateTrip(trip.id, t => { t.photos.push(...added); });
      toast(`사진 ${added.length}장을 올렸습니다`);
    });
    grid.addEventListener('click', e => {
      const b = e.target.closest('.jph[data-id]'); if (!b) return;
      const ph = trip.photos.find(x => x.id === b.dataset.id); if (!ph) return;
      openLightbox({
        src: imgUrl(ph.ref), caption: ph.caption, meta: ph.date ? fmtDate(ph.date, { long: true }) : '',
        onCaption: v => {
          updateTrip(trip.id, t => { const x = t.photos.find(y => y.id === ph.id); if (x) x.caption = v; }, { silent: true });
          let cap = b.querySelector('.cap'); if (!cap && v) { cap = document.createElement('span'); cap.className = 'cap'; b.appendChild(cap); }
          if (cap) { cap.textContent = v; cap.hidden = !v; } b.title = v || '사진';
        },
        onDelete: async () => { updateTrip(trip.id, t => { t.photos = t.photos.filter(y => y.id !== ph.id); }); await removeImage(ph.ref); closeModal(); toast('삭제했습니다'); },
      });
    });
  });
}
