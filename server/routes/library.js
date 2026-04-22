import { Router } from 'express';
import { searchBaedari } from '../lib/ptlib.js';

const router = Router();

router.post('/', async (req, res, next) => {
  try {
    const { title, isbn } = req.body || {};
    if (!title && !isbn) {
      return res.status(400).json({ error: 'title or isbn required' });
    }
    const result = await searchBaedari({ title, isbn });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
