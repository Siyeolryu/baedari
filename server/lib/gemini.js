import { GoogleGenAI } from '@google/genai';

let clientPromise;
function getClient() {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!clientPromise) {
    clientPromise = Promise.resolve(
      new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }),
    );
  }
  return clientPromise;
}

const MODEL = 'gemini-2.5-flash';

export async function summarizeBook({ title, author, sources }) {
  const ai = await getClient();
  if (!ai) return { summary: null, skipped: 'GEMINI_API_KEY not set' };

  const joined = (sources || [])
    .slice(0, 6)
    .map((s, i) => `[${i + 1}] ${s.title || ''}\n${s.text || (s.highlights || []).join(' ')}`)
    .join('\n\n')
    .slice(0, 12_000);

  const prompt = [
    `다음은 책 "${title}"${author ? `(${author})` : ''} 에 대해 웹에서 수집한 리뷰/소개 발췌입니다.`,
    '사실 위주로 한국어 3~5줄 요약을 만들어 주세요.',
    '- 스포일러 금지, 과장 금지',
    '- 마지막 줄에 "독자 반응:" 으로 시작하는 한 줄 톤(호평/엇갈림/혹평) 요약 포함',
    '',
    '=== 발췌 ===',
    joined,
  ].join('\n');

  const res = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
  });

  const summary =
    res.text ||
    res.response?.text ||
    res.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ||
    null;

  return { summary };
}
