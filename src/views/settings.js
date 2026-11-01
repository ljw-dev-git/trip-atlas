// 백업·복원·설정
import { getState, exportJSON, exportBundle, importJSON, importSeed, resetAll } from '../store.js';
import { imageCount, imageBytes } from '../images.js';
import { esc, download, todayISO } from '../util.js';
import { toast, confirmDialog } from '../ui.js';

export function renderSettings(root) {
  const st = getState();
  const bytes = new Blob([exportJSON()]).size;
  root.innerHTML = `
    <div class="page-head"><div><h1>백업·설정</h1><p>모든 데이터는 이 브라우저의 저장소(localStorage·IndexedDB)에만 있습니다. 다른 기기에서 보려면 JSON으로 내보내 옮기세요.</p></div></div>
    <div class="settings-grid">
      <div class="card"><div class="card-title"><h3>전체 백업</h3><span class="chip">${(bytes / 1024).toFixed(1)} KB · 여행 ${st.trips.length}개${imageCount() ? ` · 사진 ${imageCount()}장 ${(imageBytes() / 1048576).toFixed(1)} MB` : ''}</span></div>
        <p>여행 전체를 JSON 파일 하나로 저장합니다. 올린 사진도 함께 들어갑니다. 휴대폰 ↔ PC 사이에 옮기거나, 깃허브 저장소에 함께 커밋해 두면 안전합니다.</p>
        <div class="row"><button class="btn primary" id="bk-export">JSON 내보내기</button><label class="btn">JSON 불러오기 (병합)<input type="file" accept="application/json,.json" id="bk-import" hidden></label><label class="btn ghost">전체 교체<input type="file" accept="application/json,.json" id="bk-replace" hidden></label></div>
      </div>
      <div class="card"><div class="card-title"><h3>예시 여행</h3></div>
        <p>시즈오카 2026 예시 여행(장소 48곳, 2박 3일 일정, 예상 지출)을 다시 불러옵니다. 이미 있으면 그대로 둡니다.</p>
        <button class="btn" id="seed-btn">시즈오카 예시 불러오기</button>
      </div>
      <div class="card"><div class="card-title"><h3>테마</h3></div>
        <p>오른쪽 위 ☀/☾ 버튼으로 라이트·다크를 전환합니다. 시스템 설정을 따르려면 아래를 누르세요.</p>
        <button class="btn" id="theme-auto">시스템 설정 따르기</button>
      </div>
      <div class="card danger-zone"><div class="card-title"><h3>초기화</h3></div>
        <p>모든 여행을 지웁니다. 먼저 백업을 내보내세요.</p>
        <button class="btn danger" id="reset-btn">모든 데이터 삭제</button>
      </div>
      <div class="card flat"><div class="card-title"><h3>사용 팁</h3></div>
        <ul class="small" style="margin:0;padding-left:18px;line-height:1.9;color:var(--ink-2)">
          <li><b>구글 지도에서 장소 확인</b>: 지도 탭 → 장소 옆 ↗ 버튼. 현지어 이름 + 좌표로 열어 다른 곳이 뜨는 문제를 줄였습니다.</li>
          <li><b>구글 지도에 전부 넣기</b>: 지도 탭 → "KML 내보내기" → <a href="https://www.google.com/maps/d/" target="_blank" rel="noopener">구글 내 지도</a>에서 가져오기. 날짜별 레이어로 들어갑니다.</li>
          <li><b>하루 경로 길찾기</b>: 일정 탭의 "구글 지도 경로" 버튼이 그날 모든 정류를 경유지로 넣어 엽니다.</li>
          <li><b>사진</b>: 여행 정보·장소 수정에서 사진을 올리거나 위키백과에서 찾을 수 있고, 기록 탭에서 날짜별로 사진을 올립니다. 올린 사진은 긴 변 1600px로 줄여 저장합니다.</li>
          <li><b>여행 중 지출</b>: 가계부 탭 상단의 빠른 입력. 금액만 넣어도 오늘 날짜·현지 통화로 저장됩니다.</li>
          <li><b>홈 화면에 추가</b>: 휴대폰 브라우저의 "홈 화면에 추가"로 앱처럼 쓸 수 있습니다.</li>
        </ul>
      </div>
    </div>`;
  root.querySelector('#bk-export').onclick = () => { download(`trip-atlas-backup-${todayISO()}.json`, exportBundle(), 'application/json'); toast('백업 파일을 내려받았습니다'); };
  const readFile = (input, cb) => input.addEventListener('change', () => { const f = input.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { Promise.resolve().then(() => cb(r.result)).catch(e => toast('파일을 읽지 못했습니다: ' + e.message, { err: true })); }; r.readAsText(f); input.value = ''; });
  readFile(root.querySelector('#bk-import'), async text => { const n = await importJSON(text, { merge: true }); toast(`${n}개 여행을 병합했습니다`); });
  readFile(root.querySelector('#bk-replace'), async text => { if (await confirmDialog('현재 데이터를 모두 지우고 파일 내용으로 교체합니다.', { ok: '교체' })) { await importJSON(text, { merge: false }); toast('교체했습니다'); } });
  root.querySelector('#seed-btn').onclick = () => { const t = importSeed(); toast('예시 여행을 불러왔습니다'); location.hash = `#/trip/${t.id}`; };
  root.querySelector('#theme-auto').onclick = () => { localStorage.removeItem('trip-atlas:theme'); delete document.documentElement.dataset.theme; toast('시스템 테마를 따릅니다'); };
  root.querySelector('#reset-btn').onclick = async () => { if (await confirmDialog('정말 모든 여행 데이터를 삭제할까요? 백업하지 않았다면 복구할 수 없습니다.')) { resetAll(); toast('초기화했습니다'); location.hash = '#/'; } };
}
