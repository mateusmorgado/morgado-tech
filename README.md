# Mateus Morgado Portfolio

Bilingual (DE/EN) portfolio website with a Gemini chat that can answer in my cloned voice (ElevenLabs), and a live avatar.

Live: [morgado.tech](https://morgado.tech)

- Static single page (`index.html`): no framework and no build step.
- Two Vercel serverless functions for the chat and the voice.
- A separate Google Cloud Run service for the live avatar.
- Light/dark theme and DE/EN language, both remembered per visitor.

## Project layout

| Path | Contents |
| --- | --- |
| `index.html` | The whole website: markup, styles and browser scripts |
| `assets/` | Public images, videos and PDF documents |
| `assets/fonts/` | Self-hosted fonts (Cabinet Grotesk, Satoshi, JetBrains Mono) |
| `api/chat.js` | Vercel function: chat via the Gemini API |
| `api/tts.js` | Vercel function: chat voice via ElevenLabs, with Google Cloud Text-to-Speech as fallback |
| `lib/knowledge.js` | Assistant instructions and the shared knowledge loader (no built-in biography) |
| `avatar-proxy/` | Separate Cloud Run service for avatar WebSockets and the `/knowledge` endpoint |

Secrets are never in this repo. They live in Vercel and Cloud Run environment variables.

## Development

Install Node.js and pnpm, then install the Vercel CLI:

```sh
pnpm add -g vercel
vercel login
vercel link
```

When linking, select the existing `mateus-morgado` project. Do not create another project.
If global pnpm commands are not on your PATH, run `pnpm setup`, reopen your terminal, and retry.

**Full site, including chat and voice:**

```sh
vercel dev
```

**Page only** (layout, styles, scripts; `/api/*` returns 404):

```sh
npx http-server@14.1.1 -p 3030 -c-1
```

Locally, `/_vercel/insights/script.js` returns 404. That's expected: the analytics script only exists on Vercel.

### Environment variables

Production secrets already live in Vercel. For local tests, configure their Development
scope; for branch deployments, configure Preview. Never commit `.env` files or keys.

| Variable | Used by | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | chat | Gemini API authentication (required) |
| `GEMINI_MODEL` | chat | Optional model override |
| `KNOWLEDGE_URL` | chat | Cloud Run `/knowledge` endpoint |
| `KNOWLEDGE_SECRET` | chat | Authentication for the knowledge endpoint |
| `ELEVENLABS_API_KEY` | tts | ElevenLabs key (text-to-speech access is enough). With the voice ID set, ElevenLabs is used first |
| `ELEVENLABS_VOICE_ID` | tts | ID of the cloned voice in ElevenLabs |
| `ELEVENLABS_MODEL` | tts | Optional model override (default: `eleven_multilingual_v2`, speaks DE and EN) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | tts | Service account for Text-to-Speech (recommended; required for the cloned voice) |
| `TTS_API_KEY` | tts | Alternative to the service account |
| `TTS_VOICE_CLONING_KEY` | tts | Optional: use the cloned voice (Chirp 3 Instant Custom Voice) |
| `TTS_CLONE_LANGUAGE` | tts | Optional language code for the cloned voice |
| `TTS_VOICE_NAME_DE` / `TTS_VOICE_NAME_EN` | tts | Optional stock voice per language (default: Chirp 3 HD Charon) |

The Cloud Run service has its own variables. See `avatar-proxy/README.md`.

### Live avatar locally

The page connects to the production avatar service (`AVATAR_WS` in `index.html`). That
service only accepts origins listed in its `ALLOWED_ORIGINS` variable, currently
`https://morgado.tech`, `http://localhost:3000` and the old `*.vercel.app` URL. Other
local ports and preview URLs are rejected. Prefer a separate staging service for avatar development.

## Privacy (DSGVO)

- **No cookies, so no cookie banner.** Vercel Web Analytics is cookieless.
- **`localStorage`** keeps only settings the visitor chose themselves: `pref-lang`,
  `pref-theme`, `pref-voice`. These count as strictly necessary (§25 Abs. 2 TDDDG).
- **Fonts are self-hosted**, so the page makes no requests to Google Fonts or Fontshare.
  Don't add external font, script or embed URLs without updating the privacy policy.
- **Third parties visitors' data reaches:**
  - Vercel: hosting and analytics.
  - formsubmit.co: the contact form.
  - Google: Gemini, Text-to-Speech (voice fallback) and Cloud Run, but only when the chat, voice or avatar is used.
  - ElevenLabs: the chat's reply text, only when "Voice on" is active, to speak it in the cloned voice.

## Website deployments

Push a feature branch and review its Vercel preview. Merge to `main` only when ready:
the connected Vercel project automatically deploys that branch to production.
No manual Vercel CLI deployment is necessary.

The `.vercelignore` excludes the separately deployed avatar source from CLI uploads.
Keep the Vercel Framework Preset as Other and the root directory at repository root.
Do not configure Vercel to run `avatar-proxy/server.js`.

## Avatar service deployments

See `avatar-proxy/README.md`. Pushing changes to this folder does not update Cloud Run.
Deploy that service explicitly when its code changes. Its existing identity, secrets,
environment variables and bucket are independent of Vercel.

## Knowledge updates

Upload `.md` and `.txt` files to the private Cloud Storage bucket.
Both assistants use this bucket; there is no duplicate biography in this repository.
The current implementation loads the combined files into prompts, not a retrieval index:
keep the total manageable, and add retrieval/chunking before growing to a large document library.

The proxy caches for five minutes and the chat caches for another five minutes;
chat updates can therefore take roughly ten minutes. An existing avatar session retains
its starting knowledge; start a new session after an update.

If the chat cannot load knowledge, it returns an unavailable response rather than using
old biography text. The proxy currently starts with empty knowledge on loading errors;
its prompt tells the avatar not to invent missing facts.
