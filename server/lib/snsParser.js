import got from 'got';
import * as cheerio from 'cheerio';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/128.0 Safari/537.36';

async function fetchHtml(url) {
  const res = await got(url, {
    headers: { 'user-agent': UA, 'accept-language': 'ko-KR,ko;q=0.9,en;q=0.8' },
    followRedirect: true,
    timeout: { request: 15_000 },
    retry: { limit: 1 },
  });
  return { finalUrl: res.url, html: res.body };
}

function clean(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

function dedupe(arr) {
  return [...new Set(arr.filter(Boolean))];
}

// 『제목』, 「제목」, 《제목》, <제목> 등에서 책 제목 후보 추출
function extractBracketedTitles(text) {
  const patterns = [
    /『([^『』\n]{1,60})』/g,
    /「([^「」\n]{1,60})」/g,
    /《([^《》\n]{1,60})》/g,
    /<([^<>\n]{2,60})>/g,
    /\[([^\[\]\n]{2,60})\]/g,
  ];
  const out = [];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) {
      out.push(clean(m[1]));
    }
  }
  return dedupe(out);
}

function extractIsbn(text) {
  const m = text.match(/\b(?:97[89][- ]?)?\d{1,5}[- ]?\d{1,7}[- ]?\d{1,7}[- ]?[\dXx]\b/g);
  if (!m) return undefined;
  const candidates = m
    .map((s) => s.replace(/[- ]/g, ''))
    .filter((s) => s.length === 10 || s.length === 13);
  return candidates[0];
}

function looksLikeBookTitle(s) {
  if (!s) return false;
  if (s.length < 2 || s.length > 80) return false;
  // 뉴스/카테고리 태그 같은 잡음 제거
  if (/^(홈|home|메뉴|category|카테고리|더보기|공유|로그인)$/i.test(s)) return false;
  return true;
}

export async function extractBookFromUrl(url) {
  const { finalUrl, html } = await fetchHtml(url);
  const $ = cheerio.load(html);

  const og = (p) => $(`meta[property="og:${p}"]`).attr('content');
  const meta = (n) => $(`meta[name="${n}"]`).attr('content');

  const title =
    clean(og('title')) ||
    clean(meta('twitter:title')) ||
    clean($('title').first().text());
  const description =
    clean(og('description')) ||
    clean(meta('description')) ||
    clean(meta('twitter:description'));
  const image = og('image') || meta('twitter:image');
  const siteName = og('site_name');

  // 본문 텍스트: 스크립트/스타일 제거 후 일부만
  $('script, style, noscript').remove();
  const body = clean($('body').text()).slice(0, 6000);

  const bracketCandidates = [
    ...extractBracketedTitles(title || ''),
    ...extractBracketedTitles(description || ''),
    ...extractBracketedTitles(body),
  ].filter(looksLikeBookTitle);

  // og:title 자체가 책 제목인 경우도 흔함 → 후보에 포함
  const candidates = dedupe([...bracketCandidates, title].filter(looksLikeBookTitle));

  const isbn = extractIsbn(`${title} ${description} ${body}`);

  // 저자 힌트: "저자 홍길동", "지은이: ..." 류
  let author;
  const authorMatch =
    body.match(/(?:저자|지은이|글쓴이|author)\s*[:：]?\s*([가-힣A-Za-z .·]{2,30})/i);
  if (authorMatch) author = clean(authorMatch[1]);

  return {
    sourceUrl: finalUrl,
    siteName: clean(siteName),
    pageTitle: title,
    description,
    thumbnail: image,
    isbn,
    author,
    bestGuessTitle: candidates[0] || title || null,
    candidates,
  };
}
