import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import OpenAI from 'openai';

const app = express();
app.use(cors());
app.use(express.json());

// Basic per-IP rate limit: 30 requests / 5 minutes
const limiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
});
app.use('/api/', limiter);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Simple exponential backoff helper for 429s
async function withBackoff(fn, { tries = 4, baseMs = 500 } = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const status = err?.status || err?.response?.status;
      // Retry only on 429/503
      if ((status === 429 || status === 503) && attempt < tries - 1) {
        const wait = Math.round(baseMs * Math.pow(2, attempt));
        await new Promise(r => setTimeout(r, wait));
        attempt++;
        continue;
      }
      throw err;
    }
  }
}

app.post('/api/generate', async (req, res) => {
  try {
    const { topic, tone = 'Neutral' } = req.body || {};
    if (!topic || typeof topic !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "topic".' });
    }

    const prompt = `Generate a concise YouTube script for topic: "${topic}".
Return sections clearly labeled: Hook (<=20 words), Body (2-3 short paragraphs), and CTA (<=15 words).
Tone: ${tone}. Keep it punchy and practical.`;

    const result = await withBackoff(async () => {
      return openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 500 // cap to reduce cost & failures
      });
    });

    const script = result.choices?.[0]?.message?.content || '';
    res.json({ script });
  } catch (err) {
    const status = err?.status || err?.response?.status || 500;
    const message =
      err?.response?.data?.error?.message ||
      err?.message ||
      'Unexpected error';
    res.status(status).json({ error: message });
  }
});

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Inkwise server listening on :${port}`));
app.get('/', (_, res) => res.send('Inkwise API up'));
