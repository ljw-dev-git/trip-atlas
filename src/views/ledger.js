// 가계부
import { updateTrip, toHome } from '../store.js';
import { esc, fmtDate, fmtMoney, todayISO, EXPENSE_CATEGORIES, expenseCat, PAY_METHODS, CURRENCIES, download, uid } from '../util.js';
import { expenseForm } from '../forms.js';
import { expensesToCSV } from '../export.js';
import { toast, promptDialog } from '../ui.js';

let view = { mode: 'actual' }; // actual | planned | all

export function renderLedger(root, trip) {
  const H = trip.homeCurrency, C = trip.currency;
  const rate = C === H ? 1 : trip.fx[C];
  const conv = e => toHome(trip, e.amount, e.currency);
  const actual = trip.expenses.filter(e => !e.planned);
  const planned = trip.expenses.filter(e => e.planned);
  const sum = list => list.reduce((s, e) => s + (conv(e) || 0), 0);
  const spent = sum(actual), plan = sum(planned);
  const budget = trip.budget.amount || 0;
  const pct = budget ? Math.round(spent / budget * 100) : 0;
  const days = trip.days.length || 1;
  const unknown = trip.expenses.filter(e => conv(e) == null).length;

  const shown = view.mode === 'all' ? trip.expenses : view.mode === 'planned' ? planned : actual;
  const byDate = {};
  shown.forEach(e => { (byDate[e.date] = byDate[e.date] || []).push(e); });
  const dates = Object.keys(byDate).sort();
  const byCat = EXPENSE_CATEGORIES.map(c => ({ c, v: sum(shown.filter(e => e.category === c.id)) })).filter(x => x.v > 0);
  const catMax = Math.max(1, ...byCat.map(x => x.v));
  const byDay = trip.days.map(d => ({ d, v: sum(actual.filter(e => e.date === d.date)) }));
  const dayMax = Math.max(1, ...byDay.map(x => x.v));
  const byMethod = Object.keys(PAY_METHODS).map(m => ({ m, v: sum(actual.filter(e => e.method === m)) })).filter(x => x.v > 0);

  root.innerHTML = `
    <div class="ledger-top">
      <div class="ltile"><div class="l">실제 지출 합계</div><span class="v ${budget && spent > budget ? 'over' : ''}">${fmtMoney(spent, H)}</span><div class="s">${budget ? `예산 ${fmtMoney(budget, H)} 중 ${pct}%` : '예산 미설정'}</div>${budget ? `<div class="bar"><i class="${spent > budget ? 'over' : ''}" style="width:${Math.min(100, pct)}%"></i></div>` : ''}</div>
      <div class="ltile"><div class="l">${budget ? (spent > budget ? '예산 초과' : '남은 예산') : '예상 지출(계획)'}</div><span class="v" style="${budget ? (spent > budget ? 'color:var(--danger)' : 'color:var(--good)') : ''}">${budget ? fmtMoney(Math.abs(budget - spent), H) : fmtMoney(plan, H)}</span><div class="s">${budget ? `계획 지출 ${fmtMoney(plan, H)}` : `${planned.length}건`}</div></div>
      <div class="ltile"><div class="l">하루 평균</div><span class="v">${fmtMoney(spent / days, H)}</span><div class="s">${days}일 · ${trip.travelers}명 기준 1인 ${fmtMoney(spent / days / (trip.travelers || 1), H)}</div></div>
      <div class="ltile"><div class="l">환율</div><span class="v" style="font-size:16px">${C === H ? '동일 통화' : rate ? `100 ${C} = ${fmtMoney(rate * 100, H)}` : '<span style="color:var(--danger)">미설정</span>'}</span><div class="s row" style="gap:6px;margin-top:6px"><button class="btn sm ghost" id="fx-edit">직접 입력</button>${C !== H ? '<button class="btn sm ghost" id="fx-fetch">오늘 환율 가져오기</button>' : ''}</div></div>
    </div>
    ${unknown ? `<p class="small" style="color:var(--danger);margin:-8px 0 14px">환율이 없는 통화의 지출 ${unknown}건은 합계에서 빠져 있습니다.</p>` : ''}

    <form class="quick-exp" id="quick">
      <div class="field"><label>금액</label><input name="amount" type="number" step="any" min="0" inputmode="decimal" placeholder="0" required></div>
      <div class="field"><label>통화</label><select name="currency">${[C, H].filter((c, i, a) => a.indexOf(c) === i).map(c => `<option value="${c}">${c} ${CURRENCIES[c]?.symbol || ''}</option>`).join('')}</select></div>
      <div class="field span-m"><label>내용</label><input name="note" placeholder="예: 편의점 아침" autocomplete="off"></div>
      <div class="field"><label>&nbsp;</label><button class="btn primary" type="submit">기록</button></div>
      <div class="cats">${EXPENSE_CATEGORIES.map((c, i) => `<button type="button" class="chip clickable${i === 3 ? ' on' : ''}" data-c="${c.id}">${c.icon} ${c.label}</button>`).join('')}<input type="hidden" name="category" value="food"><span class="small muted" style="margin-left:auto">날짜: ${trip.days.some(d => d.date === todayISO()) ? '오늘' : fmtDate(trip.startDate)} · 자세히 입력은 <button type="button" class="btn sm ghost" id="exp-detail">+ 상세</button></span></div>
    </form>

    <div class="ledger-layout">
      <div>
        <div class="row between" style="margin-bottom:10px">
          <div class="seg" id="mode-seg"><button data-m="actual" class="${view.mode === 'actual' ? 'on' : ''}">실제 ${actual.length}</button><button data-m="planned" class="${view.mode === 'planned' ? 'on' : ''}">계획 ${planned.length}</button><button data-m="all" class="${view.mode === 'all' ? 'on' : ''}">전체</button></div>
          <button class="btn sm ghost" id="ex-csv">CSV 내보내기</button>
        </div>
        ${dates.length ? dates.map(date => {
          const list = byDate[date]; const di = trip.days.findIndex(d => d.date === date);
          return `<div class="exp-day"><div class="exp-day-head"><strong>${di >= 0 ? `Day ${di + 1} · ` : ''}${fmtDate(date)}</strong><span class="num small">${fmtMoney(sum(list), H)}</span></div>
            ${list.map(e => { const p = trip.places.find(x => x.id === e.placeId); const h = conv(e); return `<div class="exp-row ${e.planned ? 'planned' : ''}" data-id="${e.id}"><span class="ci cat-${e.category}">${expenseCat(e.category).icon}</span><div class="en">${esc(e.note || expenseCat(e.category).label)}<small>${[expenseCat(e.category).label, PAY_METHODS[e.method], p && p.name, e.planned ? '계획' : ''].filter(Boolean).join(' · ')}</small></div><div class="ea">${fmtMoney(e.amount, e.currency)}${e.currency !== H ? `<small>${h == null ? '환율 없음' : '≈ ' + fmtMoney(h, H)}</small>` : ''}</div></div>`; }).join('')}
          </div>`; }).join('') : '<div class="empty"><strong>아직 기록이 없습니다</strong>위의 빠른 입력으로 첫 지출을 남겨 보세요.</div>'}
      </div>
      <div class="stack">
        <div class="card"><div class="card-title"><h3>분류별</h3><span class="small muted">${view.mode === 'planned' ? '계획' : view.mode === 'all' ? '전체' : '실제'}</span></div>
          ${byCat.length ? `<div class="bars">${byCat.map(x => `<div class="bar-row" title="${x.c.label} ${fmtMoney(x.v, H)}"><span class="bl"><i class="cat-${x.c.id}"></i>${x.c.label}</span><span class="bt"><i class="cat-${x.c.id}" style="width:${Math.round(x.v / catMax * 100)}%"></i></span><span class="bv">${fmtMoney(x.v, H)}</span></div>`).join('')}</div>` : '<div class="muted small">데이터 없음</div>'}
        </div>
        <div class="card"><div class="card-title"><h3>일자별 실제 지출</h3></div>
          <div class="daybars">${byDay.map((x, i) => `<div class="daybar" title="${fmtDate(x.d.date)} ${fmtMoney(x.v, H)}"><i style="height:${Math.max(2, Math.round(x.v / dayMax * 100))}%" ${x.v ? `data-v="${fmtMoney(x.v, H, { plain: true })}"` : ''}></i><span>D${i + 1}</span></div>`).join('')}</div>
        </div>
        ${byMethod.length ? `<div class="card flat"><div class="card-title"><h3>결제 수단</h3></div><div class="bars">${byMethod.map(x => `<div class="bar-row"><span class="bl">${PAY_METHODS[x.m]}</span><span class="bt"><i style="width:${Math.round(x.v / spent * 100)}%;background:var(--ink)"></i></span><span class="bv">${Math.round(x.v / spent * 100)}%</span></div>`).join('')}</div></div>` : ''}
        ${trip.fxNote ? `<div class="fx-box">${esc(trip.fxNote)}</div>` : ''}
      </div>
    </div>`;

  // 빠른 입력
  const q = root.querySelector('#quick');
  q.querySelectorAll('.cats .chip').forEach(b => b.onclick = () => { q.querySelectorAll('.cats .chip').forEach(x => x.classList.remove('on')); b.classList.add('on'); q.category.value = b.dataset.c; });
  q.onsubmit = e => {
    e.preventDefault();
    const amount = Number(q.amount.value); if (!amount) return;
    const date = trip.days.some(d => d.date === todayISO()) ? todayISO() : trip.startDate;
    updateTrip(trip.id, t => t.expenses.push({ id: uid(), date, category: q.category.value, amount, currency: q.currency.value, method: 'cash', note: q.note.value.trim(), placeId: '', planned: false }));
    toast(`${fmtMoney(amount, q.currency.value)} 기록`);
  };
  root.querySelector('#exp-detail').onclick = () => expenseForm(trip, null, { amount: q.amount.value, note: q.note.value, category: q.category.value, currency: q.currency.value });
  root.querySelector('#mode-seg').onclick = e => { const b = e.target.closest('button'); if (!b) return; view.mode = b.dataset.m; renderLedger(root, trip); };
  root.querySelectorAll('.exp-row').forEach(r => r.onclick = () => expenseForm(trip, trip.expenses.find(x => x.id === r.dataset.id)));
  root.querySelector('#ex-csv').onclick = () => download(`${trip.title}-가계부.csv`, expensesToCSV(trip), 'text/csv');
  root.querySelector('#fx-edit').onclick = async () => {
    const v = await promptDialog('환율 입력', { label: `100 ${C} 당 ${H}`, value: rate ? String(Math.round(rate * 100 * 100) / 100) : '', placeholder: '예: 920' });
    if (v == null || v === '') return; const n = Number(v); if (!n) { toast('숫자를 입력하세요', { err: true }); return; }
    updateTrip(trip.id, t => { t.fx[C] = n / 100; t.fxNote = `직접 입력 · 100 ${C} = ${n} ${H}`; }); toast('환율을 저장했습니다');
  };
  const fb = root.querySelector('#fx-fetch');
  if (fb) fb.onclick = async () => {
    fb.disabled = true; fb.textContent = '가져오는 중…';
    try {
      const r = await fetch(`https://api.frankfurter.app/latest?from=${C}&to=${H}`); const j = await r.json();
      const v = j.rates?.[H]; if (!v) throw new Error('no rate');
      updateTrip(trip.id, t => { t.fx[C] = v; t.fxNote = `ECB 기준 ${j.date} · 100 ${C} = ${fmtMoney(v * 100, H, { plain: true })} ${H} (frankfurter.app)`; });
      toast('오늘 환율을 적용했습니다');
    } catch { toast('환율을 가져오지 못했습니다. 직접 입력해 주세요.', { err: true }); fb.disabled = false; fb.textContent = '오늘 환율 가져오기'; }
  };
}
