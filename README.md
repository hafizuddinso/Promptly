# Promptly

Write an idea in your own words. Promptly turns it into a clearer prompt for an AI tool.

![Promptly interface](assets/preview-desktop.webp)

The app gives you three versions of the same request:

- **Simple** — short and direct
- **Professional** — clear and polished
- **Advanced** — more detail where it helps

It works with everyday questions, writing, research, coding, and image prompts. The target AI setting adapts the wording of the prompts, **not the AI service used to generate them**. It keeps the original intent rather than adding unrelated instructions.

## What it does

- Improves rough or incomplete English
- Suggests three prompts to choose from
- One target AI dropdown: Universal, GPT, Claude, Gemini, DeepSeek, Qwen, Grok or Image AI
- Remembers the selected target in your browser, so you choose it only once
- Copies the result with one click
- Keeps recent prompts in your own browser
- Press Enter to improve, or Shift + Enter for a new line
- Works without sign-up or a database

## Run locally

Node.js 20 or newer:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Add either `OPENROUTER_API_KEY` or `GEMINI_API_KEY` to `.env.local`. When both are set, OpenRouter takes priority. The server handles API requests; visitors don't need their own keys. The app first tries `google/gemma-4-26b-a4b-it:free`, a compact instruction-tuned free model, instead of randomly selecting a free model. If needed, it falls back once to `openrouter/free` (or another free model set with `OPENROUTER_MODEL`). Each attempt has a 12-second timeout, and typical responses use a shorter output budget. Free provider queues and rate limits can still cause delays. No paid OpenRouter models are selected automatically. Free models may be slow or rate-limited; the site does not guarantee instant responses.

If deploying publicly, set the same key in your hosting environment. In Vercel the **Key** field must be `OPENROUTER_API_KEY` and the **Value** field must contain the actual key. Select Production and redeploy after saving. A configured key is not proof that OpenRouter has accepted it: 401 means authentication failed, 403 means access was forbidden. Never commit your API key. API requests are processed by the selected provider, and its usage/privacy terms apply.

## Stack

Next.js · TypeScript · OpenRouter / Gemini

MIT License.
