# The Buzzword Index

Paste a post, pitch or press release and get a 0–100 rating of how much buzzword-laden hype it contains, with a short roast. Every point is highlighted in your text, so you can see where the score came from.

## Two ways to run it

| | Static (GitHub Pages) | Local server |
|---|---|---|
| Paste text | ✅ | ✅ |
| Rate a link | — | ✅ |
| AI-written roasts | — (built-in roasts) | ✅ if you configure a provider |

Scoring and the built-in roasts run in the browser, so `public/` works as a plain static site. The server adds what a static host can't do: fetching URLs (browsers block that through CORS) and calling an AI provider with a secret key.

### Local

```sh
npm install
npm start            # http://127.0.0.1:3000
npm test
```

### AI roasts (optional, any provider)

The score never comes from the model. The AI only writes the commentary. If the provider fails or refuses, the app quietly uses a built-in roast instead.

| Variable | Meaning |
|---|---|
| `AI_PROVIDER` | `anthropic` or `openai` (meaning any OpenAI-compatible `/chat/completions` API) |
| `AI_API_KEY` | Your key. For `anthropic`, falls back to `ANTHROPIC_API_KEY` |
| `AI_MODEL` | Model ID. Defaults to `claude-haiku-4-5` for `anthropic`; required for `openai` |
| `AI_BASE_URL` | Optional. Points `openai` at another provider |

```sh
AI_PROVIDER=anthropic AI_API_KEY=sk-ant-… npm start
AI_PROVIDER=openai AI_API_KEY=sk-… AI_MODEL=<model> npm start
AI_PROVIDER=openai AI_BASE_URL=https://openrouter.ai/api/v1 AI_API_KEY=… AI_MODEL=<model> npm start
AI_PROVIDER=openai AI_BASE_URL=http://localhost:11434/v1 AI_MODEL=llama3.2 npm start   # Ollama, no key
```

`HOST` and `PORT` are also read (default `127.0.0.1:3000`).

### GitHub Pages

Push to `main`. Then set **Settings → Pages → Source** to **GitHub Actions**. The workflow in `.github/workflows/pages.yml` runs the tests and publishes `public/`. The page detects that no server is present and hides link mode.

## How the score works

`public/lib/buzzwords.js` has 119 terms in five categories, each worth 1–3 points. The score is buzzword points per 100 words, on a curve that tops out at 100 (`public/lib/score.js`). The same text always gets the same score. To change what counts, edit the word list.

## Security note

The URL fetcher (`lib/fetch-page.js`) follows any address, including private ones. That's fine on your own machine, which is why the server binds to `127.0.0.1` by default. **Before exposing the server publicly**, add private-IP blocking (checked after DNS lookup and on every redirect) and rate limiting. Otherwise it's an open proxy into whatever network it runs on.
