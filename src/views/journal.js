// 기록: 일자별 일기 + 여행 회고
import { updateTrip, toHome, tripStatus } from '../store.js';
import { esc, fmtDate, fmtMoney, expenseCat, debounce } from '../util.js';

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

  root.innerHTML = `
    <div class="journal-layout">
      <div>
        <div class="row between" style="margin-bottom:12px"><div class="muted small">${st === 'upcoming' ? '여행 전에는 기대나 준비 과정을 적어 두어도 좋습니다.' : '하루를 마치며 몇 줄만 남겨도 나중에 큰 기록이 됩니다. 입력은 자동 저장됩니다.'}</div></div>
        ${trip.days.map((d, i) => {
          const j = trip.journal.find(x => x.date === d.date) || { text: '', rating: 0 };
          const visited = d.stops.filter(s => s.status === 'done').map(s => trip.places.find(p => p.id === s.placeId)?.name || s.title).filter(Boolean);
          const skipped = d.stops.filter(s => s.status === 'skip').map(s => trip.places.find(p => p.id === s.placeId)?.name || s.title).filter(Boolean);
          const daySpent = actual.filter(e => e.date === d.date).reduce((s, e) => s + (toHome(trip, e.amount, e.currency) || 0), 0);
          return `<div class="jday" data-date="${d.date}">
            <div class="jd-head"><div><strong>Day ${i + 1} · ${fmtDate(d.date)}</strong>${d.title ? ` <span class="muted small">${esc(d.title)}</span>` : ''}</div><div class="row"><span class="num small muted">${daySpent ? fmtMoney(daySpent, H) : ''}</span><div class="stars" data-date="${d.date}">${[1, 2, 3, 4, 5].map(n => `<button type="button" class="${j.rating >= n ? 'on' : ''}" data-n="${n}" title="${n}점">★</button>`).join('')}</div></div></div>
            <textarea placeholder="오늘 어땠나요? 날씨, 먹은 것, 뜻밖의 일, 다음에 다시 온다면…">${esc(j.text)}</textarea>
            ${visited.length || skipped.length ? `<div class="visited">${visited.map(v => `<span class="chip good">✓ ${esc(v)}</span>`).join('')}${skipped.map(v => `<span class="chip outline">⊘ ${esc(v)}</span>`).join('')}</div>` : ''}
          </div>`; }).join('')}
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
            ${topCat ? `<dt>가장 큰 분류</dt><dd>${expenseCat(topCat[0]).icon} ${expenseCat(topCat[0]).label} · <span class="num">${fmtMoney(topCat[1], H)}</span></dd>` : ''}
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
}
