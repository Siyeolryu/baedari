import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import extractRoute from './routes/extract.js';
import libraryRoute from './routes/library.js';
import summarizeRoute from './routes/summarize.js';
import searchRoute from './routes/search.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/extract-book', extractRoute);
app.use('/api/library-search', libraryRoute);
app.use('/api/summarize', summarizeRoute);
app.use('/api/search', searchRoute);

app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ error: err.message || 'internal error' });
});

const port = Number(process.env.PORT) || 5173;
app.listen(port, '127.0.0.1', () => {
  console.log(`baedari-book-finder listening on http://127.0.0.1:${port}`);
});
