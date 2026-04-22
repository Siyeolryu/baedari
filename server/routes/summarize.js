import { Router } from 'express';
import { exaSearchWithContents } from '../lib/exaClient.js';
import { summarizeBook } from '../lib/gemini.js';

const router = Router();

router.post('/', async (req, res, next) => {
  try {
    const { title, author } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title required' });

    const query = `${title} ${author || ''} 책 리뷰 줄거리`.trim();
    const { results, skipped: exaSkip } = await exaSearchWithContents(query);
    const { summary, skipped: gemSkip } = await summarizeBook({
      title,
      author,
      sources: results,
    });

    res.json({
      summary,
      sources: results.map((r) => ({ title: r.title, url: r.url })),
      skipped: [exaSkip, gemSkip].filter(Boolean),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
