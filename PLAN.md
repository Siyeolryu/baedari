# 배다리 도서관 SNS 추천도서 검색기 — 계획서

## 1. 목표 (What)

SNS(인스타, 블로그, 유튜브 등)에서 추천받아 카카오톡으로 공유한 URL을
하나의 웹 페이지에 붙여넣으면, 해당 URL에서 언급된 **책**을

1. **배다리도서관(평택시립도서관, ptlib.go.kr)** 에 보유 여부 / 위치 / 대출 상태 확인
2. **구글 크롤링(Exa MCP)** 으로 책 내용을 요약해서 제공

하는 단일 HTML 기반 도구를 만든다.

---

## 2. 전체 흐름 (User Flow)

```
[카카오톡에서 URL 복사]
        │
        ▼
[HTML 입력창에 URL 붙여넣기]  ←─ 여러 개 가능 (한 줄에 하나)
        │
        ▼
[① URL → 책 제목/저자 추출]           (OG 태그 + 본문 파싱)
        │
        ├──► [② 배다리도서관 검색]      → 소장/위치/대출상태
        │
        └──► [③ Exa MCP 구글 검색]      → 책 요약·리뷰
        │
        ▼
[결과 카드 UI로 렌더링]
```

---

## 3. 아키텍처 (How)

### ⚠️ 순수 HTML만으로는 불가능한 이유
- 브라우저의 **CORS 정책**으로 `ptlib.go.kr`, 블로그/인스타, 구글 등을
  클라이언트에서 직접 호출할 수 없다.
- 도서관 로그인은 **세션 쿠키**가 필요해서 서버 측 처리가 필수.
- 계정 정보를 HTML에 박으면 **누구나 볼 수 있어 보안 사고**.

### 그래서 최소 백엔드 + 프론트엔드 구조로 간다

```
┌──────────────────────┐       ┌───────────────────────────┐
│  index.html (UI)     │ ────► │  server (Node.js/Express) │
│  - URL 입력          │       │  - /api/extract-book      │
│  - 결과 카드         │ ◄──── │  - /api/library-search    │
│                      │       │  - /api/summarize         │
└──────────────────────┘       └─────────────┬─────────────┘
                                             │
                    ┌────────────────────────┼─────────────────────────┐
                    ▼                        ▼                         ▼
          [SNS 페이지 fetch]          [ptlib.go.kr 로그인      [Exa MCP 호출]
          - og:title                   후 검색]                 - 웹 검색
          - og:description             - 소장 도서관            - 요약
          - 본문 텍스트                 - 자료실/청구기호
          - 제목 추정                   - 대출 가능 여부
```

### 사용 스택
| 레이어       | 선택안                                          |
|--------------|-------------------------------------------------|
| Frontend     | 단일 `index.html` + Vanilla JS + Tailwind(CDN)  |
| Backend      | Node.js + Express (or Fastify)                  |
| HTML 파서    | `cheerio`                                       |
| HTTP         | `undici` / `node-fetch`                         |
| 도서관 세션  | `tough-cookie` + `got`  (쿠키 유지)             |
| 검색/요약    | **Exa MCP** (smithery `exa`)                    |
| UI 레퍼런스  | **Context7 MCP** (smithery `upstash/context7-mcp`) |
| 시크릿 관리  | `.env` + `dotenv` (절대 커밋 금지)              |

---

## 4. 보안 / 시크릿 처리 (중요)

> **현재 이 이슈 본문에 ID/PW가 평문으로 공유되어 있음.
> 아래 원칙을 반드시 지켜서 저장소에는 절대 남기지 않는다.**

1. `tlduf1 / guswk0925!` 자격증명을 코드/HTML/커밋에 **쓰지 않는다**.
2. 서버 루트에 `.env` 파일로만 보관:
   ```
   PTLIB_ID=tlduf1
   PTLIB_PW=guswk0925!
   EXA_API_KEY=...
   ```
3. `.gitignore` 에 `.env`, `node_modules/`, `dist/` 추가.
4. (권장) 공유된 비밀번호는 계획서 확정 후 **반드시 재설정**.
5. 백엔드는 로컬/사내 네트워크에서만 동작하도록 `localhost` 바인딩
   기본값. 외부에 올릴 경우 최소한 Basic Auth + HTTPS 필수.

---

## 5. 모듈 설계

### 5.1 프론트엔드 `public/index.html`
- URL 입력 `<textarea>` (줄바꿈으로 여러 URL 지원)
- “검색” 버튼 → `/api/search` 호출
- 결과 카드
  - 썸네일 / 제목 / 저자 / 출처(SNS 링크)
  - 📚 **도서관 상태** 배지: 보유 ✅ / 미보유 ❌ / 대출중 ⏳
  - 📍 소장 위치(자료실/청구기호)
  - 📝 구글 요약(펼치기)
- 스타일: Context7 MCP로 best-practice 예시(Tailwind, shadcn) 참조

### 5.2 `/api/extract-book`
입력: `{ url }`
처리:
1. `fetch(url)` → HTML
2. `<meta property="og:title">`, `og:description`, `og:image` 파싱
3. 본문에서 “『...』”, “「...」”, “책 제목:”, ISBN(10/13) 패턴 추출
4. 여러 후보 중 최우선 후보 1개 + 대안 리스트 반환
출력: `{ title, author?, isbn?, thumbnail?, candidates[] }`

### 5.3 `/api/library-search`
입력: `{ title, author?, isbn? }`
처리:
1. 세션이 없거나 만료면 `ptlib.go.kr` 로그인 폼 POST (쿠키 저장)
2. 통합검색 엔드포인트 호출 (사전 조사 필요)
   - 먼저 비로그인 상태의 `/search` 로도 조회 가능한지 확인
   - 로그인 필수 기능(예약, 대출이력)만 세션 사용
3. 결과에서 소장관(배다리), 자료실, 청구기호, 대출상태 파싱
출력: `{ found, copies:[{branch, room, callNumber, status}] }`

> **사전 조사 TODO**: `ptlib.go.kr` 실제 검색 URL/파라미터/HTML 구조 확인.
> robots.txt 및 이용약관의 자동화 허용 범위 확인.

### 5.4 `/api/summarize`
입력: `{ title, author? }`
처리:
1. Exa MCP `search` 로 “`{title} {author} 책 리뷰 요약`” 질의
2. 상위 결과 본문을 Exa `contents` 로 수집
3. 3~5줄 한국어 요약으로 정리 (LLM 호출 또는 Exa 자체 요약)
출력: `{ summary, sources:[{title,url}] }`

### 5.5 `/api/search` (오케스트레이터)
- 입력 URL 배열 → 각 URL에 대해 `extract-book` →
  병렬로 `library-search` + `summarize` → 카드 결과 반환
- 실패한 URL은 에러와 함께 개별 카드로 표시

---

## 6. 저장소 구조(예정)

```
baedari/
├─ PLAN.md                  ← (현재 문서)
├─ README.md
├─ .env.example             ← 키 이름만 제공
├─ .gitignore
├─ package.json
├─ server/
│  ├─ index.js              ← Express 엔트리
│  ├─ routes/
│  │  ├─ extract.js
│  │  ├─ library.js
│  │  └─ summarize.js
│  ├─ lib/
│  │  ├─ ptlib.js           ← 배다리도서관 클라이언트
│  │  ├─ snsParser.js
│  │  └─ exaClient.js
│  └─ cache/                ← 책별 결과 캐시(선택)
└─ public/
   ├─ index.html
   ├─ app.js
   └─ styles.css
```

---

## 7. MCP 사용 계획

### 7.1 Exa MCP (구글 검색 & 요약)
- 설치: `smithery mcp add exa`
- 사용 호출: `exa.search`, `exa.contents`
- 용도: 책 리뷰/요약/ISBN 보강

### 7.2 Context7 MCP (UI 레퍼런스)
- 설치: `smithery mcp add upstash/context7-mcp`
- 용도: Tailwind / shadcn-ui / 카드 레이아웃 예제 받아
  `index.html` 디자인 품질 향상

> MCP 키/토큰도 반드시 `.env` 로만 관리.

---

## 8. 에지 케이스

- SNS URL이 **짧은 URL**(`me2.do`, `bit.ly`)인 경우 → HEAD redirect 따라가기
- OG 태그가 없는 페이지 → 본문에서 책 제목 휴리스틱 추출 실패 시
  사용자에게 **제목 수동 입력** 폴백 UI 제공
- 한 URL에 **여러 책**이 언급 → candidates 전체를 카드로 노출
- 배다리도서관 외 평택시 타관 보유 → “타관 보유” 배지로 구분
- 로그인 실패(비밀번호 변경 등) → 500 대신 사용자에게 안내

---

## 9. 단계별 작업 (Milestones)

- **M1. 인프라 스켈레톤**
  - `package.json`, Express 서버, 정적 HTML 서빙, `.env`/`.gitignore`
- **M2. SNS URL 파서** (`/api/extract-book`)
  - OG 기반 파싱 + 2~3개 실제 SNS URL로 테스트
- **M3. 배다리도서관 클라이언트** (`/api/library-search`)
  - 사이트 실제 호출 흐름 조사 → 로그인 → 검색 → 파싱
- **M4. Exa MCP 요약** (`/api/summarize`)
- **M5. 프론트엔드 결과 카드 UI** (Context7 MCP 참고)
- **M6. 통합 & 다건 테스트**
- **M7. (선택) 결과 캐시 + 즐겨찾기**

---

## 10. 확인이 필요한 사항 (사용자께)

1. 백엔드(Node.js) 돌리는 방식 괜찮은지? (완전한 `index.html` 1파일은
   기술적으로 불가능)
2. 우선 **로컬 PC에서만** 실행하는 버전으로 만들면 되는지,
   아니면 배포(HTTPS)까지 고려해야 하는지?
3. 공유해주신 도서관 **비밀번호 재설정** 의향이 있으신지?
   (이 이슈에 평문으로 남아있는 상태는 위험)
4. 파싱 대상 SNS 플랫폼 우선순위 (네이버블로그 / 인스타 / 유튜브 / 브런치…)?
5. 요약에 외부 LLM(API 키) 사용이 가능한지, 아니면 Exa 자체 요약만
   쓸지?

위 항목들 답변 주시면 M1부터 바로 착수하겠습니다.
