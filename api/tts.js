// POST /api/tts  { text, lang:'de'|'en' }  ->  { audio: <base64 mp3/wav>, mime }
// Voice priority:
//   1. ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID -> Mateus' cloned voice on ElevenLabs (one voice for DE and EN)
//   2. Google Cloud Text-to-Speech, also the fallback when ElevenLabs fails:
//      TTS_VOICE_CLONING_KEY  -> cloned voice (Chirp 3: Instant Custom Voice, allow-listed)
//      TTS_VOICE_NAME_DE / _EN -> a Chirp 3 HD stock voice (works for every Google Cloud project)
// Google auth: GOOGLE_SERVICE_ACCOUNT_JSON (recommended; needed for the cloned voice) or TTS_API_KEY.
const crypto = require('crypto');

const LANG = { de: 'de-DE', en: 'en-US' };
const DEFAULT_VOICE = { de: 'de-DE-Chirp3-HD-Charon', en: 'en-US-Chirp3-HD-Charon' };
const MAX_CHARS = 700;
let tokenCache = { token: null, exp: 0 };

const b64u = b => Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

async function accessToken(sa) {
  if (tokenCache.token && Date.now() < tokenCache.exp - 60_000) return tokenCache.token;
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64u(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
  }));
  const sig = crypto.createSign('RSA-SHA256').update(`${head}.${claim}`).sign(sa.private_key);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${b64u(sig)}` })
  });
  if (!r.ok) throw new Error('token ' + r.status);
  const j = await r.json();
  tokenCache = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return tokenCache.token;
}

const hits = new Map();
function limited(ip) {
  const now = Date.now(), arr = (hits.get(ip) || []).filter(t => now - t < 60_000);
  arr.push(now); hits.set(ip, arr); if (hits.size > 500) hits.clear();
  return arr.length > 10;
}

async function elevenlabs(text) {
  const url = 'https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(process.env.ELEVENLABS_VOICE_ID) + '?output_format=mp3_44100_128';
  const r = await fetch(url, {
    method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    // the multilingual model picks German or English from the text, so one cloned voice covers both
    body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.85 } })
  });
  if (!r.ok) throw new Error('elevenlabs ' + r.status + ' ' + (await r.text()).slice(0, 300));
  return { audio: Buffer.from(await r.arrayBuffer()).toString('base64'), mime: 'audio/mpeg' };
}

async function google(text, lang, saJson, apiKey) {
  const cloneKey = process.env.TTS_VOICE_CLONING_KEY;
  const voice = cloneKey
    ? { languageCode: process.env.TTS_CLONE_LANGUAGE || LANG[lang], voiceClone: { voiceCloningKey: cloneKey } }
    : { languageCode: LANG[lang], name: process.env[`TTS_VOICE_NAME_${lang.toUpperCase()}`] || DEFAULT_VOICE[lang] };
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  let url = 'https://texttospeech.googleapis.com/v1beta1/text:synthesize';
  if (saJson) {
    const sa = JSON.parse(saJson);
    headers.Authorization = 'Bearer ' + await accessToken(sa);
    headers['x-goog-user-project'] = sa.project_id;
  } else url += '?key=' + encodeURIComponent(apiKey);
  const r = await fetch(url, {
    method: 'POST', headers,
    body: JSON.stringify({ input: { text }, voice, audioConfig: { audioEncoding: cloneKey ? 'LINEAR16' : 'MP3' } })
  });
  if (!r.ok) throw new Error('google ' + r.status + ' ' + (await r.text()).slice(0, 300));
  const j = await r.json();
  return { audio: j.audioContent, mime: cloneKey ? 'audio/wav' : 'audio/mpeg' };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const hasEleven = !!(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID);
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON, apiKey = process.env.TTS_API_KEY, hasGoogle = !!(saJson || apiKey);
  if (!hasEleven && !hasGoogle) return res.status(503).json({ error: 'not_configured' });
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
  if (limited(ip)) return res.status(429).json({ error: 'rate_limited' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const lang = body.lang === 'en' ? 'en' : 'de';
  const text = String(body.text || '').replace(/[*_`#>]/g, '').trim().slice(0, MAX_CHARS);
  if (!text) return res.status(400).json({ error: 'bad_request' });

  if (hasEleven) {
    try { return res.status(200).json(await elevenlabs(text)); }
    catch (e) { console.error(e.message); if (!hasGoogle) return res.status(502).json({ error: 'upstream' }); }
  }
  try { return res.status(200).json(await google(text, lang, saJson, apiKey)); }
  catch (e) { console.error(e.message); return res.status(502).json({ error: 'upstream' }); }
};
