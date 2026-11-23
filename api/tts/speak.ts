import type { VercelRequest, VercelResponse } from '@vercel/node';
import https from 'node:https';

export const config = {
  maxDuration: 15,
};

// Rate limiting: max 40 requests per 60s per client IP
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 40;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(ip) || []).filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 1. Fetch metadata & origin guard in production
  const secFetchSite = req.headers['sec-fetch-site'];
  if (secFetchSite === 'cross-site') {
    return res.status(403).json({ error: 'Forbidden: Cross-site request rejected' });
  }

  const originHeader = req.headers.origin || req.headers.referer;
  const origin = Array.isArray(originHeader) ? originHeader[0] : (originHeader || '');
  const hostHeader = req.headers.host;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : (hostHeader || '');

  if (process.env.NODE_ENV === 'production' && origin && host && !origin.includes(host)) {
    return res.status(403).json({ error: 'Forbidden: Origin mismatch' });
  }

  // 2. Client IP rate limiting
  const forwardedFor = req.headers['x-forwarded-for'];
  const clientIp = Array.isArray(forwardedFor) ? forwardedFor[0] : (typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : (req.socket?.remoteAddress || 'unknown'));
  if (!checkRateLimit(clientIp)) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Rate limit exceeded. Please wait 60 seconds.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }
  }

  const { text, provider, voice } = body || {};
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Text string is required' });
  }

  // 3. Payload length cap to prevent credit exhaustion
  if (text.length > 1500) {
    return res.status(400).json({ error: 'Text exceeds maximum limit of 1,500 characters per request' });
  }

  const deepgramKey = (process.env.DEEPGRAM_API_KEY || '').replace(/^["']|["']$/g, '').trim();
  const elevenKey = (process.env.ELEVENLABS_API_KEY || '').replace(/^["']|["']$/g, '').trim();
  const groqKey = (process.env.GROQ_API_KEY || '').replace(/^["']|["']$/g, '').trim();

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
        path: `/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
        method: 'POST',
        headers: {
          'xi-api-key': elevenKey,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (upRes) => {
        const isOk = (upRes.statusCode || 200) < 400;
        res.writeHead(upRes.statusCode || 200, {
          'Content-Type': isOk ? 'audio/mpeg' : (upRes.headers['content-type'] || 'application/json'),
          'Cache-Control': isOk ? 'public, max-age=86400, s-maxage=86400' : 'no-cache',
        });
        upRes.pipe(res);
      }
    );

    upstream.on('error', (err) => {
      if (!res.headersSent) {
        res.status(502).json({ error: `Upstream error: ${err.message}` });
      }
    });
    upstream.write(payload);
    upstream.end();
    return;
  }

  // 2. Groq Orpheus Provider
  if (provider === 'groq') {
    if (!groqKey) {
      return res.status(503).json({ error: 'Groq API key not configured on server' });
    }
    const model = voice || 'canopylabs/orpheus-v1-english';
    const payload = JSON.stringify({
      model,
      input: text.slice(0, 200),
      voice: 'autumn',
    });

    const upstream = https.request(
      {
        hostname: 'api.groq.com',
        port: 443,
        path: '/openai/v1/audio/speech',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (upRes) => {
        const isOk = (upRes.statusCode || 200) < 400;
        res.writeHead(upRes.statusCode || 200, {
          'Content-Type': isOk ? 'audio/wav' : (upRes.headers['content-type'] || 'application/json'),
          'Cache-Control': isOk ? 'public, max-age=86400, s-maxage=86400' : 'no-cache',
        });
        upRes.pipe(res);
      }
    );

    upstream.on('error', (err) => {
      if (!res.headersSent) {
        res.status(502).json({ error: `Upstream error: ${err.message}` });
      }
    });
    upstream.write(payload);
    upstream.end();
    return;
  }

  // 3. Default Provider: Deepgram Aura
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
      const isOk = (upRes.statusCode || 200) < 400;
      res.writeHead(upRes.statusCode || 200, {
        'Content-Type': isOk ? 'audio/mpeg' : (upRes.headers['content-type'] || 'application/json'),
        'Cache-Control': isOk ? 'public, max-age=86400, s-maxage=86400' : 'no-cache',
      });
      upRes.pipe(res);
    }
  );

  upstream.on('error', (err) => {
    if (!res.headersSent) {
      res.status(502).json({ error: `Upstream error: ${err.message}` });
    }
  });
  upstream.write(payload);
  upstream.end();
}
