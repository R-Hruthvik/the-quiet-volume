import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import https from 'node:https';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      // Streaming TTS backend endpoint connecting to Deepgram Aura (primary) and ElevenLabs
      {
        name: 'tts-proxy-middleware',
        configureServer(server) {
          server.middlewares.use('/api/tts/speak', (req, res) => {
            if (req.method !== 'POST') {
              res.statusCode = 405;
              res.end('Method Not Allowed');
              return;
            }
            let body = '';
            req.on('data', (chunk) => {
              body += chunk;
            });
            req.on('end', () => {
              try {
                const { text, provider, voice } = JSON.parse(body || '{}');
                if (!text) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: 'Text is required' }));
                  return;
                }
                const deepgramKey = process.env.DEEPGRAM_API_KEY || '';
                const elevenKey = process.env.ELEVENLABS_API_KEY || '';

                if (provider === 'elevenlabs' && elevenKey) {
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
                      family: 4,
                      headers: {
                        'xi-api-key': elevenKey,
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(payload),
                      },
                    },
                    (upRes) => {
                      res.writeHead(upRes.statusCode || 200, {
                        'Content-Type': 'audio/mpeg',
                        'Transfer-Encoding': 'chunked',
                      });
                      upRes.pipe(res);
                    }
                  );
                  upstream.on('error', (err) => {
                    res.statusCode = 502;
                    res.end(JSON.stringify({ error: err.message }));
                  });
                  upstream.write(payload);
                  upstream.end();
                  return;
                }

                // Default / Primary: Deepgram Aura
                const model = voice || 'aura-asteria-en';
                const payload = JSON.stringify({ text });
                const upstream = https.request(
                  {
                    hostname: 'api.deepgram.com',
                    port: 443,
                    path: `/v1/speak?model=${encodeURIComponent(model)}`,
                    method: 'POST',
                    family: 4,
                    headers: {
                      Authorization: `Token ${deepgramKey}`,
                      'Content-Type': 'application/json',
                      'Content-Length': Buffer.byteLength(payload),
                    },
                  },
                  (upRes) => {
                    res.writeHead(upRes.statusCode || 200, {
                      'Content-Type': 'audio/mpeg',
                      'Transfer-Encoding': 'chunked',
                    });
                    upRes.pipe(res);
                  }
                );
                upstream.on('error', (err) => {
                  res.statusCode = 502;
                  res.end(JSON.stringify({ error: err.message }));
                });
                upstream.write(payload);
                upstream.end();
              } catch (err: any) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: err?.message || 'Invalid JSON' }));
              }
            });
          });
        },
      },
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const rootDir = import.meta.dirname || process.cwd();
          const distDir = path.resolve(rootDir, 'dist');
          const srcAssets = path.resolve(rootDir, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname || process.cwd(), '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
