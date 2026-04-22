import got from 'got';
import { CookieJar } from 'tough-cookie';
import * as cheerio from 'cheerio';

const BASE = 'https://www.ptlib.go.kr';
// 배다리 도서관 전용 검색 경로 (자동으로 배다리 소장본만 검색됨)
const SEARCH_PATH = '/bdrlib/plusSearchResultList.do';
const SEARCH_HOME = '/bdrlib/plusSearchNew.do';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/128.0 Safari/537.36';

function clean(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

function makeClient() {
  const jar = new CookieJar();
  const client = got.extend({
    prefixUrl: BASE,
    cookieJar: jar,
    headers: {
      'user-agent': UA,
      'accept-language': 'ko-KR,ko;q=0.9,en;q=0.8',
      accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    followRedirect: true,
    timeout: { request: 20_000 },
    retry: { limit: 1 },
  });
  return { client, jar };
}

// 세션 워밍업: 검색 페이지를 먼저 방문해 JSESSIONID 쿠키 확보.
async function warmup(client) {
  await client.get(SEARCH_HOME.replace(/^\//, ''));
}

function parseResults(html) {
  const $ = cheerio.load(html);
  const items = [];

  // 총 N건
  const totalText = $('.resultHead, .resultTop').text();
  const totalMatch = totalText.match(/총\s*([\d,]+)\s*건/);
  const total = totalMatch ? Number(totalMatch[1].replace(/,/g, '')) : undefined;

  $('ul.resultList > li').each((_, el) => {
    const $el = $(el);
    if ($el.hasClass('emptyNote')) return;

    const titleRaw = clean($el.find('dt.tit a').first().text());
    // 앞의 "1. " 같은 번호 제거
    const title = titleRaw.replace(/^\s*\d+\.\s*/, '');

    const authorSpans = $el.find('dd.author span').map((_, s) => clean($(s).text())).get();
    const dataSpans = $el.find('dd.data span').map((_, s) => clean($(s).text())).get();
    const siteSpans = $el.find('dd.site span').map((_, s) => clean($(s).text())).get();

    const pick = (arr, label) => {
      const hit = arr.find((t) => t.startsWith(label));
      if (!hit) return undefined;
      return clean(hit.slice(label.length).replace(/^[:：]\s*/, ''));
    };

    const author = pick(authorSpans, '저자');
    const publisher = pick(authorSpans, '발행자');
    const year = pick(authorSpans, '발행년도');
    const isbn = pick(dataSpans, 'ISBN');
    const callNumber = pick(dataSpans, '청구기호');
    const branch = pick(siteSpans, '도서관');
    const room = pick(siteSpans, '자료실');

    const stateText = clean($el.find('.bookStateBar .txt').text());
    let availability = 'unknown';
    if (/대출가능/.test(stateText)) availability = 'available';
    else if (/대출중|대출\s*불가/.test(stateText)) availability = 'checkedOut';
    else if (/예약/.test(stateText)) availability = 'reserved';

    const cover = $el.find('img.bookCoverImg').attr('src');

    items.push({
      title,
      author,
      publisher,
      year,
      isbn,
      callNumber,
      branch,
      room,
      availability,
      stateText,
      cover,
    });
  });

  return { total, items };
}

export async function searchBaedari({ title, isbn } = {}) {
  const keyword = clean(isbn || title);
  if (!keyword) throw new Error('searchBaedari: title or isbn required');

  const { client } = makeClient();
  await warmup(client);

  const searchParams = new URLSearchParams({
    searchType: 'SIMPLE',
    searchCategory: 'ALL',
    searchKeyword: keyword,
    currentPageNo: '1',
    viewStatus: 'IMAGE',
  });

  const res = await client.get(`${SEARCH_PATH.replace(/^\//, '')}?${searchParams}`, {
    headers: { referer: `${BASE}${SEARCH_HOME}` },
  });

  const { total, items } = parseResults(res.body);

  return {
    query: keyword,
    total: total ?? items.length,
    found: items.length > 0,
    items,
  };
}

// 로그인이 필요한 기능(예약 등)을 위해 남겨두는 스텁.
// 검색만 할 땐 호출하지 않아도 됨.
export async function login(id, pw) {
  if (!id || !pw) throw new Error('login requires id and pw');
  const { client } = makeClient();
  await warmup(client);
  // 실제 로그인 엔드포인트는 `/intro/menu/.../memberLoginProc.do` 형태로 추정.
  // 사이트 구조가 바뀔 수 있어 현재는 검색에만 집중하고, 필요 시 여기 구현.
  throw new Error('login: not implemented yet (search works without login)');
}
