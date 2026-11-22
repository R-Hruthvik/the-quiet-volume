# Implementation Plan: Free Publishing for The Quiet Volume

Comprehensive zero-cost production publishing strategy for **The Quiet Volume** using **Vercel Hobby Tier** and **GitHub**.

> [!IMPORTANT]
> **Workspace File Freeze In Effect**: Another session is actively editing frontend files. As requested, **no workspace files have been modified or will be modified** during this planning phase. The changes detailed below are scheduled for execution only after explicit approval and coordination with the frontend session.

---

## Architecture Overview

```mermaid
flowchart TD
    subgraph Git_and_Deployment["Source & Deployment Pipeline"]
        Dev[Local Repo] -->|git push| GH[GitHub Repository]
        GH -->|Webhook Trigger| VercelCI[Vercel CI/CD Build Engine]
    end

    subgraph Vercel_Platform["Vercel Free Tier (Production)"]
        VercelCI -->|Vite Build| StaticEdge["Vercel Edge CDN (dist/)"]
        VercelCI -->|Compile Function| APIFunction["Serverless Function: /api/tts/speak"]
        StaticEdge --> AppURL["https://the-quiet-volume.vercel.app"]
    end

    subgraph Client_Runtime["Browser Client (Reader)"]
        Browser[Client Browser] -->|Load Static Assets| StaticEdge
        Browser -->|EPUB/PDF/Markdown/TXT| LocalMemory[Local IndexedDB / Storage]
        Browser -->|WebSpeech TTS (Default/Fallback)| LocalTTS[Native Browser Speech]
        Browser -->|AI Voice Request (POST /api/tts/speak)| APIFunction
    end

    subgraph Upstream_APIs["Zero-Cost Upstream TTS Providers"]
        APIFunction -->|DEEPGRAM_API_KEY| Deepgram[Deepgram Aura API]
        APIFunction -->|ELEVENLABS_API_KEY (Optional)| ElevenLabs[ElevenLabs Turbo v2.5]
    end
```

---

## User Review Required

> [!NOTE]
> All architectural choices were validated through the `/grill-me` interview:
> 1. **Hosting Platform**: Vercel (Hobby Free Tier — \$0/month).
> 2. **CI/CD Integration**: Remote GitHub repository linked to Vercel dashboard for automatic deploys on `master`.
> 3. **TTS Production Backend**: Vercel Serverless Function (`api/tts/speak.ts`) proxying to Deepgram & ElevenLabs with environment variables and origin checks.
> 4. **Graceful Degradation**: Fallback to native browser `window.speechSynthesis` (WebSpeech) if keys are exhausted, rate limited, or absent.
> 5. **Domain**: Free `*.vercel.app` subdomain with automated HTTPS.
> 6. **Telemetry & Privacy**: 100% telemetry-free (no tracking cookies, no Google Analytics, no third-party beacons).

---

## Open Questions

> [!TIP]
> None currently blocking. Provider API keys (`DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY`) can be added directly into the Vercel Dashboard project settings under **Settings > Environment Variables** without checking them into Git.

---

## Proposed Changes

To ensure zero collision with the parallel frontend session, all deployment assets reside strictly in dedicated deployment files outside `src/components/` and `src/lib/`.

---

### Component 1: Vercel Serverless Function (Production TTS Proxy)

Resolves **RA-09** (Vite dev middleware missing in production). Provides a secure Node/Edge serverless endpoint on Vercel at `/api/tts/speak`.

#### [NEW] `api/tts/speak.ts`

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import https from 'node:https';

export const config = {
  maxDuration: 15,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Same-origin verification to prevent third-party quota draining
  const origin = req.headers.origin || req.headers.referer || '';
  const host = req.headers.host || '';
  if (process.env.NODE_ENV === 'production' && origin && !origin.includes(host)) {
    return res.status(403).json({ error: 'Forbidden: Origin mismatch' });
  }

  const { text, provider, voice } = req.body || {};
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Text string is required' });
  }

  const deepgramKey = process.env.DEEPGRAM_API_KEY || '';
  const elevenKey = process.env.ELEVENLABS_API_KEY || '';

  // 1. ElevenLabs Provider
  if (provider === 'elevenlabs') {
    if (!elevenKey) {
      return res.status(503).json({ error: 'ElevenLabs API key not configured on server' });
    }
    const voiceId = voice || 'nPczCjzI2devNBz1zQrb';
    const payload = JSON.stringify({
      text,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    });

    const upstream = https.request(
      {
        hostname: 'api.elevenlabs.io',
        port: 443,
        path: `/v1/text-to-speech/${voiceId}`,
        method: 'POST',
        headers: {
          'xi-api-key': elevenKey,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (upRes) => {
        res.writeHead(upRes.statusCode || 200, {
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        });
        upRes.pipe(res);
      }
    );

    upstream.on('error', (err) => {
      res.status(502).json({ error: `Upstream error: ${err.message}` });
    });
    upstream.write(payload);
    upstream.end();
    return;
  }

  // 2. Default Provider: Deepgram Aura
  if (!deepgramKey) {
    return res.status(503).json({ error: 'Deepgram API key not configured on server' });
  }

  const model = voice || 'aura-asteria-en';
  const payload = JSON.stringify({ text });

  const upstream = https.request(
    {
      hostname: 'api.deepgram.com',
      port: 443,
      path: `/v1/speak?model=${encodeURIComponent(model)}`,
      method: 'POST',
      headers: {
        Authorization: `Token ${deepgramKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    },
    (upRes) => {
      res.writeHead(upRes.statusCode || 200, {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      });
      upRes.pipe(res);
    }
  );

  upstream.on('error', (err) => {
    res.status(502).json({ error: `Upstream error: ${err.message}` });
  });
  upstream.write(payload);
  upstream.end();
}
```

---

### Component 2: Vercel Project Configuration

Ensures asset caching, SPA routing fallbacks, and security headers.

#### [NEW] `vercel.json`

```json
{
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "cleanUrls": true,
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
      ]
    },
    {
      "source": "/assets/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    }
  ],
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

---

### Component 3: Git Remote & Publishing Script / Runbook

Documentation and non-destructive helper scripts to push to GitHub and initialize Vercel.

#### [NEW] `docs/free-publishing-guide.md`

Step-by-step instructions for:
1. Creating a new public or private repository on GitHub (e.g. via `gh repo create` or web UI).
2. Adding git remote: `git remote add origin https://github.com/<username>/the-quiet-volume.git`.
3. Pushing branch: `git push -u origin master`.
4. Importing the repository in Vercel (`vercel.com/new`).
5. Setting Environment Variables in Vercel (`DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY`).
6. Deploying and verifying the live `*.vercel.app` URL.

---

## Verification Plan

### Automated Tests
1. **TypeScript Build Verification**:
   ```bash
   npm run lint
   ```
2. **Production Bundle Compilation**:
   ```bash
   npm run build
   ```
   Ensures `dist/index.html`, `dist/assets/*.js`, `dist/assets/*.css`, and unbundled asset copies succeed with 0 errors.

### Manual Verification
1. **Local Preview Test**:
   ```bash
   npm run preview
   ```
   Open `http://localhost:4173` to test the production build locally.
2. **Vercel Staging Deployment**:
   Inspect the preview URL generated by Vercel for:
   - Client binding of EPUB, PDF, and Markdown files.
   - WebSpeech fallback when no API key is provided.
   - Deepgram Aura streaming playback when `DEEPGRAM_API_KEY` is provided.
   - Responsive layout across desktop and mobile browsers.
