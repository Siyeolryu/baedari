import { Router } from 'express';
import { extractBookFromUrl } from '../lib/snsParser.js';
import { searchBaedari } from '../lib/ptlib.js';
import { exaSearchWithContents } from '../lib/exaClient.js';
import { summarizeBook } from '../lib/gemini.js';

const router = Router();

async function processOne(entry) {
  const isUrl = /^https?:\/\//i.test(entry.trim());

  let extract;
  if (isUrl) {
    try {
      extract = await extractBookFromUrl(entry);
    } catch (e) {
      return { input: entry, error: `URL 추출 실패: ${e.message}` };
    }
  } else {
    // URL 이 아니면 사용자가 입력한 문자열을 제목으로 간주 (폴백)
    extract = { bestGuessTitle: entry, candidates: [entry], sourceUrl: null };
  }

  const title = extract.bestGuessTitle;
  if (!title) {
    return {
      input: entry,
      extract,
      error: '책 제목을 찾지 못했어요. 제목을 직접 입력해 주세요.',
    };
  }

  // 도서관 검색 + 요약 병렬
  const [libRes, summaryRes] = await Promise.allSettled([
    searchBaedari({ title, isbn: extract.isbn }),
    (async () => {
      const query = `${title} ${extract.author || ''} 책 리뷰 줄거리`.trim();
      const { results, skipped: exaSkip } = await exaSearchWithContents(query);
      const { summary, skipped: gemSkip } = await summarizeBook({
        title,
        author: extract.author,
        sources: results,
      });
      return {
        summary,
        sources: results.map((r) => ({ title: r.title, url: r.url })),
        skipped: [exaSkip, gemSkip].filter(Boolean),
      };
    })(),
  ]);

  return {
    input: entry,
    extract,
    library:
      libRes.status === 'fulfilled'
        ? libRes.value
        : { error: libRes.reason?.message || '도서관 조회 실패' },
    summary:
      summaryRes.status === 'fulfilled'
        ? summaryRes.value
        : { error: summaryRes.reason?.message || '요약 실패' },
  };
}

router.post('/', async (req, res, next) => {
  try {
    const { inputs } = req.body || {};
    if (!Array.isArray(inputs) || inputs.length === 0) {
      return res.status(400).json({ error: 'inputs (array of urls/titles) required' });
    }
    const results = await Promise.all(
      inputs.map((s) => processOne(String(s)).catch((e) => ({ input: s, error: e.message }))),
    );
    res.json({ results });
  } catch (err) {
    next(err);
  }
});

export default router;
