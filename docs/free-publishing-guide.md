# Free Publishing Guide: The Quiet Volume on Vercel

Follow these steps to deploy **The Quiet Volume** to Vercel Hobby Free Tier (\$0/month) backed by GitHub.

---

## 1. Create a GitHub Repository

Using GitHub CLI:
```bash
gh repo create the-quiet-volume --public --source=. --remote=origin
```
Or create an empty repository via https://github.com/new and link it locally:
```bash
git remote add origin https://github.com/<username>/the-quiet-volume.git
```

Push the project:
```bash
git branch -M master
git push -u origin master
```

---

## 2. Import into Vercel

1. Log in to [Vercel Dashboard](https://vercel.com).
2. Click **Add New... > Project**.
3. Import your `the-quiet-volume` GitHub repository.
4. Framework Preset will automatically detect **Vite** (configured in `vercel.json`).
5. Root Directory: `./`.
6. Build and Output Settings are managed automatically via `vercel.json` (`npm run build` -> `dist`).

---

## 3. Configure Environment Variables (Optional for Cloud TTS)

In the Vercel project setup screen (or later under **Settings > Environment Variables**):

| Variable Name | Description | Optional / Required |
|---|---|---|
| `DEEPGRAM_API_KEY` | Deepgram API key for Aura TTS streaming | Optional (WebSpeech fallback active if unset) |
| `ELEVENLABS_API_KEY` | ElevenLabs API key for Turbo v2.5 TTS | Optional |

> **Note**: Even without upstream API keys, The Quiet Volume falls back seamlessly to the client's built-in WebSpeech synthesis engine.

---

## 4. Deploy and Verify

1. Click **Deploy**.
2. Once the build finishes, Vercel provides a free `https://<project-name>.vercel.app` URL with automated SSL.
3. Test loading EPUB, PDF, and Markdown files in the live reader.
