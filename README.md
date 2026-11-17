# Promptly

Write an idea in your own words. Promptly turns it into a clearer prompt for an AI tool.

![Promptly interface](assets/preview-desktop.webp)

The app gives you three versions of the same request:

- **Simple** — short and direct
- **Professional** — clear and polished
- **Advanced** — more detail where it helps

It works with everyday questions, writing, research, coding, and image prompts. It keeps the original intent rather than adding unrelated instructions.

## What it does

- Improves rough or incomplete English
- Suggests three prompts to choose from
- Copies the result with one click
- Keeps recent prompts in your own browser
- Works without sign-up or a database

## Run locally

Node.js 20 or newer:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Add either `OPENROUTER_API_KEY` or `GEMINI_API_KEY` to `.env.local`. The server handles API requests; visitors don't need their own keys. The default OpenRouter model is `openrouter/free`, subject to provider limits.

If deploying publicly, set the same key in your hosting environment. Never commit your API key. API requests are processed by the selected provider, and its usage/privacy terms apply.

## Stack

Next.js · TypeScript · OpenRouter / Gemini

MIT License.
