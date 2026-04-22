import { Router } from 'express';
import { extractBookFromUrl } from '../lib/snsParser.js';

const router = Router();

router.post('/', async (req, res, next) => {
  try {
    const { url } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'url (string) required' });
    }
    const info = await extractBookFromUrl(url);
    res.json(info);
  } catch (err) {
    next(err);
  }
});

export default router;
