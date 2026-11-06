// 알림함: 숙소 가격 알림 등
import { esc } from '../../../src/util.js';
import { ic } from '../icons.js';
import { pin, setPin } from '../pinstore.js';
import { subHeader } from '../ui.js';

const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? '방금' : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : `${Math.round(m / 1440)}일 전`; };

export function renderAlerts(root) {
  const list = pin().alerts;
  root.innerHTML = `${subHeader('알림', list.length ? '<button class="link small" id="clr">모두 지우기</button>' : '')}
  <div class="noti-list">${list.map(a => `<a class="noti ${a.read ? '' : 'new'}" href="${esc(a.link || '#/alerts')}"><span class="noti-ic">${ic('bell')}</span><div><div class="nt"><b>pintrip</b><small>${ago(a.time)}</small></div><b>${esc(a.title)}</b><p>${esc(a.body)}</p></div></a>`).join('') || `<div class="empty pad"><strong>새 알림이 없어요</strong>숙소에 목표가를 걸어 두면 가격이 떨어졌을 때 여기로 알려드려요.<a class="btn" href="#/hotels">숙소 알림 설정</a></div>`}</div>`;
  if (list.some(a => !a.read)) setTimeout(() => setPin(p => p.alerts.forEach(a => { a.read = true; }), { silent: true }), 600);
  const c = root.querySelector('#clr'); if (c) c.onclick = () => setPin(p => { p.alerts = []; });
}
