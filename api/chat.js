// POST /api/chat  { messages:[{role:'user'|'assistant', content:string}], lang:'de'|'en' }
// Env: GEMINI_API_KEY (required), GEMINI_MODEL (optional)
const { buildPrompt } = require('../lib/knowledge');

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const MAX_MESSAGES = 12;      // history sent to the model
const MAX_CHARS = 600;        // per user message
const hits = new Map();       // very small per-instance rate limit
function limited(ip) {
  const now = Date.now(), win = 60_000, max = 12;
  const arr = (hits.get(ip) || []).filter(t => now - t < win);
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 500) hits.clear();
  return arr.length > max;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'not_configured' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
  if (limited(ip)) return res.status(429).json({ error: 'rate_limited' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const lang = body.lang === 'en' ? 'en' : 'de';
  const msgs = (Array.isArray(body.messages) ? body.messages : [])
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_MESSAGES)
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content.slice(0, MAX_CHARS) }] }));
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return res.status(400).json({ error: 'bad_request' });

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: (await buildPrompt()) + `\n\nSITE LANGUAGE: ${lang === 'de' ? 'German' : 'English'}` }] },
        contents: msgs,
        generationConfig: { temperature: 0.7, maxOutputTokens: 2000 }
      })
    });
    if (!r.ok) {
      const t = (await r.text()).slice(0, 400); console.error('gemini', r.status, t);
      let msg = ''; try { msg = JSON.parse(t).error?.message || ''; } catch (_) {}
      return res.status(502).json({ error: 'upstream', status: r.status, detail: msg.slice(0, 200) });
    }
    const data = await r.json();
    const reply = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
    if (!reply) return res.status(502).json({ error: 'empty' });
    return res.status(200).json({ reply });
  } catch (e) {
    console.error(e);
    if (e.message.startsWith('knowledge_')) {
      return res.status(503).json({ error: 'knowledge_unavailable' });
    }
    return res.status(500).json({ error: 'server' });
  }
};
