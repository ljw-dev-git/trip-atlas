// 대시보드: 여행 목록 (표 형식 + 커버 사진)
import { getState, tripStatus, toHome } from '../store.js';
import { esc, fmtMoney, todayISO, daysBetween } from '../util.js';
import { tripForm } from '../forms.js';
import { imgUrl } from '../images.js';

const STATUS_LABEL = { ongoing: '여행 중', upcoming: '예정', done: '다녀옴', draft: '초안' };

export function renderDashboard(root) {
  const { trips } = getState();
  const today = todayISO();
  const groups = { ongoing: [], upcoming: [], done: [], draft: [] };
  trips.forEach(t => groups[tripStatus(t, today)].push(t));
  groups.upcoming.sort((a, b) => a.startDate.localeCompare(b.startDate));
  groups.done.sort((a, b) => b.startDate.localeCompare(a.startDate));

  const totalSpent = trips.reduce((sum, t) => sum + t.expenses.filter(e => !e.planned).reduce((s, e) => s + (toHome(t, e.amount, e.currency) || 0), 0), 0);
  const totalDays = trips.reduce((s, t) => s + (t.startDate && t.endDate ? daysBetween(t.startDate, t.endDate) + 1 : 0), 0);

  root.innerHTML = `
    <div class="page-head"><h1>내 여행</h1><button class="btn primary sm" data-new-trip>새 여행</button></div>
    ${section('진행 중', groups.ongoing, today)}
    ${section('예정', groups.upcoming, today)}
    ${section('다녀온 여행', groups.done, today)}
    ${section('초안', groups.draft, today)}
    ${trips.length ? `<div class="dash-foot">여행 <span class="num">${trips.length}</span>회 · <span class="num">${totalDays}</span>일 · 실제 지출 합계 <span class="num">${fmtMoney(totalSpent, 'KRW')}</span></div>` : '<div class="empty"><strong>아직 여행이 없습니다</strong>오른쪽 위 "새 여행"으로 시작하거나, 백업·설정에서 예시 여행을 불러오세요.</div>'}
  `;
  root.querySelectorAll('[data-new-trip]').forEach(b => b.onclick = () => tripForm());
}

function section(title, list, today) {
  if (!list.length) return '';
  return `<div class="section-head"><h2>${title}</h2></div><div class="trip-list">${list.map(t => row(t, today)).join('')}</div>`;
}

function row(t, today) {
  const st = tripStatus(t, today);
  const spent = t.expenses.filter(e => !e.planned).reduce((s, e) => s + (toHome(t, e.amount, e.currency) || 0), 0);
  const budget = t.budget.amount || 0;
  const pct = budget ? Math.min(100, Math.round(spent / budget * 100)) : 0;
  const stops = t.days.reduce((s, d) => s + d.stops.length, 0);
  const nights = t.startDate && t.endDate ? daysBetween(t.startDate, t.endDate) : 0;
  const dday = st === 'upcoming' ? `D-${daysBetween(today, t.startDate)}` : STATUS_LABEL[st];
  const cover = imgUrl(t.coverImage, 'thumb');
  const photos = t.photos.length + t.places.filter(p => p.photo).length;
  return `<a class="trip-row" href="#/trip/${esc(t.id)}">
    <div class="tr-img">${cover ? `<img src="${esc(cover)}" alt="" loading="lazy">` : `<span>${esc(t.emoji)}</span>`}</div>
    <div class="tr-date">${t.startDate ? esc(t.startDate.replace(/-/g, '.')) : '날짜 미정'}${t.endDate && t.endDate !== t.startDate ? `<br>– ${esc(t.endDate.slice(5).replace('-', '.'))}` : ''}<small>${t.startDate ? `${nights}박 ${nights + 1}일` : ''}</small></div>
    <div><span class="tr-title">${esc(t.title)}</span><span class="st ${st}">${dday}</span><div class="tr-dest">${esc(t.destination || '목적지 미정')}${t.summary ? ' · ' + esc(t.summary.slice(0, 60)) + (t.summary.length > 60 ? '…' : '') : ''}</div></div>
    <div class="tr-meta">장소 ${t.places.length} · 일정 ${stops}${photos ? ` · 사진 ${photos}` : ''}${t.travelers > 1 ? ` · ${t.travelers}명` : ''}</div>
    <div class="tr-money">${spent || budget ? fmtMoney(spent, t.homeCurrency) : '<span class="muted">지출 없음</span>'}${budget ? `<small>예산 ${fmtMoney(budget, t.homeCurrency)} · ${pct}%</small><div class="bar"><i class="${spent > budget ? 'over' : ''}" style="width:${pct}%"></i></div>` : ''}</div>
  </a>`;
}
