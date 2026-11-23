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

  // Origin guard checking origin and referer against host in production to prevent external quota abuse
  const originHeader = req.headers.origin || req.headers.referer;
  const origin = Array.isArray(originHeader) ? originHeader[0] : (originHeader || '');
  const hostHeader = req.headers.host;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : (hostHeader || '');

  if (process.env.NODE_ENV === 'production' && origin && host && !origin.includes(host)) {
    return res.status(403).json({ error: 'Forbidden: Origin mismatch' });
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
