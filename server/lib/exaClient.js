import got from 'got';

const EXA_API = 'https://api.exa.ai';

export async function exaSearchWithContents(query, { numResults = 5 } = {}) {
  const key = process.env.EXA_API_KEY;
  if (!key) return { results: [], skipped: 'EXA_API_KEY not set' };

  const res = await got.post(`${EXA_API}/search`, {
    headers: {
      'x-api-key': key,
      'content-type': 'application/json',
    },
    json: {
      query,
      numResults,
      type: 'auto',
      contents: {
        text: { maxCharacters: 2000 },
        highlights: { numSentences: 3, highlightsPerUrl: 2 },
      },
    },
    timeout: { request: 30_000 },
    responseType: 'json',
  });

  const results = (res.body.results || []).map((r) => ({
    title: r.title,
    url: r.url,
    text: r.text,
    highlights: r.highlights || [],
  }));
  return { results };
}
