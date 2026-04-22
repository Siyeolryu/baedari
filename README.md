# 배다리도서관 SNS 책 찾기 (개인 로컬 툴)

카카오톡으로 공유받은 SNS 링크 목록을 붙여넣으면,
**배다리도서관(ptlib.go.kr `/bdrlib/`)** 에서 해당 책이 있는지, 어느 자료실에
있는지, 대출 가능한지를 확인하고, **Gemini + Exa** 로 구글 리뷰 요약을
보여주는 개인용 로컬 도구.

> ⚠️ 개인 사용 전용. `127.0.0.1` 에서만 돌고 외부 공개 안 됨.

## 실행

```bash
npm install
cp .env.example .env
# .env 열어서 PTLIB_ID, PTLIB_PW, GEMINI_API_KEY, (선택) EXA_API_KEY 채우기
npm start
```

열림: <http://127.0.0.1:5173>

## 폴더

- `server/index.js` — Express 진입
- `server/routes/` — `/api/extract-book`, `/api/library-search`, `/api/summarize`, `/api/search`
- `server/lib/snsParser.js` — OG 태그 + 휴리스틱 제목 추출
- `server/lib/ptlib.js` — 배다리 검색 클라이언트 (`/bdrlib/`)
- `server/lib/exaClient.js` — Exa `search + contents`
- `server/lib/gemini.js` — Gemini 2.5 Flash 요약
- `public/index.html` — UI (Tailwind CDN)

## API

### `POST /api/search`
```json
{ "inputs": ["https://blog.naver.com/...", "채식주의자"] }
```
→ `results[]`: `{ input, extract, library, summary }`

### 개별
- `POST /api/extract-book`  `{ url }`
- `POST /api/library-search` `{ title, isbn? }`
- `POST /api/summarize` `{ title, author? }`

## 메모
- 검색은 `/bdrlib/plusSearchResultList.do` 를 그대로 긁어 파싱. 사이트 HTML
  구조가 바뀌면 `server/lib/ptlib.js::parseResults` 의 셀렉터 갱신 필요.
- 로그인 기능은 스텁만 있음. 소장 조회에는 로그인 불필요.
- EXA_API_KEY 가 없으면 요약은 자동 스킵됨.
