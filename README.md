# Trip Atlas · 여행 수첩

여행 **일정 · 지도 · 가계부 · 기록**을 여행별로 한 곳에서 관리하는 개인용 웹앱입니다.
[shizuoka-trip-2026](https://github.com/jwdev1995/shizuoka-trip-2026) 한 번의 여행용 페이지에서 출발해, 앞으로의 모든 여행을 같은 페이지에서 다루도록 다시 만들었습니다.

## 할 수 있는 것

| 탭 | 내용 |
|---|---|
| **내 여행** | 여행 카드 목록(예정 / 진행 중 / 다녀옴), D-day, 예산 대비 지출 바 |
| **개요** | 한 줄 소개, 일자별 요약, 준비 체크리스트, 예산 링, 장소 분류, 진행 현황 |
| **일정** | 날짜별 타임라인. 시각·장소·메모·이동수단, 순서 바꾸기, 방문 완료 ✓ / 건너뜀 ⊘, **구글 지도 경로 열기**(그날 정류 전부 경유지로), 텍스트 복사 |
| **지도** | Leaflet 지도에 번호 핀 + 일자 경로선, 일자 필터, 내 위치, 장소 검색, **구글 지도에서 열기 / 길찾기**, **KML 내보내기**(구글 내 지도에 가져오기), CSV |
| **가계부** | 빠른 입력(금액 + 분류 칩), 상세 입력(통화·결제수단·장소·계획/실제), 예산 진행률, 분류별·일자별·결제수단별 집계, 환율 직접 입력 / 오늘 환율 가져오기, CSV |
| **기록** | 일자별 일기 + 별점(자동 저장), 방문/건너뜀 장소 요약, 여행 회고 통계(방문 수, 지출, 계획 대비, 최대 지출), 총평 |
| **백업·설정** | JSON 내보내기 / 불러오기(병합·교체), 예시 여행 불러오기, 테마, 초기화 |

### 구글 지도 연동 (지난 여행에서 아쉬웠던 부분)

- 장소마다 **현지어 이름 + 좌표**로 구글 지도를 열어 엉뚱한 곳이 뜨는 문제를 줄였습니다.
- 장소 추가 시 **구글 지도 URL을 붙여넣으면 좌표를 자동으로** 읽습니다 (`@lat,lng`, `!3d..!4d..`, `query=lat,lng` 모두 지원). 짧은 `maps.app.goo.gl` 링크는 좌표가 없으니 긴 주소를 쓰거나 OpenStreetMap 검색을 이용하세요.
- **KML 내보내기** → [구글 내 지도](https://www.google.com/maps/d/) 가져오기 → 구글 지도 앱 "저장됨 › 지도"에서 날짜별 레이어로 전부 확인할 수 있습니다.
- 일정 탭의 **구글 지도 경로** 버튼은 그날의 모든 정류를 경유지로 넣은 길찾기를 엽니다 (경유지 최대 9개).

## 실행

빌드 도구 없이 정적 파일만으로 동작합니다.

```bash
# 아무 정적 서버나 사용
python3 -m http.server 8080
# → http://localhost:8080
```

GitHub Pages: 저장소 Settings → Pages → Branch `main` / `(root)` 로 배포하면 그대로 열립니다.

## 데이터

- 모든 데이터는 브라우저 `localStorage`(`trip-atlas:v1`)에만 저장됩니다. 서버가 없습니다.
- 기기 간 이동은 **백업·설정 → JSON 내보내기 / 불러오기**로 합니다. 백업 JSON을 이 저장소에 함께 커밋해 두는 것을 권합니다.
- 첫 실행 시 `src/data/seed-shizuoka.js`의 시즈오카 2026 예시 여행이 자동으로 들어갑니다.

## 구조

```
index.html            셸 (폰트·Leaflet·스타일·앱 모듈 로드)
styles/app.css        디자인 시스템 (라이트/다크, 모바일 탭바)
src/app.js            해시 라우터, 테마, 렌더 루프
src/store.js          상태 저장소 (localStorage, 백업, 날짜 동기화, 환산)
src/util.js           포맷·날짜·구글 지도 URL 파싱/생성·분류 상수
src/ui.js             모달·토스트·확인창
src/forms.js          여행 / 장소 / 일정 / 지출 입력 폼
src/export.js         KML · CSV · 텍스트 내보내기
src/views/*.js        dashboard, trip(개요), itinerary, map, ledger, journal, settings
src/data/seed-shizuoka.js  예시 여행
```

외부 의존: Leaflet 1.9.4 (unpkg), OpenStreetMap 타일, Google Fonts(Fraunces · Noto Serif KR · JetBrains Mono), Pretendard(jsDelivr), Nominatim(장소 검색), frankfurter.app(환율). 모두 키 없이 사용합니다.
