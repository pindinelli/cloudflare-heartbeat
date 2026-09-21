# cloudflare-heartbeat

A lightweight uptime monitor built on Cloudflare Workers. A monitored service
pings an authenticated HTTP endpoint at regular intervals; a scheduled
Cron Trigger checks whether that heartbeat has gone stale and sends a
Telegram notification when the status changes.

## How it works

- **`fetch`** — receives an authenticated request (Bearer token) from the
  monitored service and stores the current timestamp in KV as the latest
  heartbeat.
- **`scheduled`** — runs on a Cron Trigger (every 5 minutes by default),
  reads the last heartbeat, and compares the elapsed time against a
  configurable time window. If the computed status (`UP` / `DOWN`) differs
  from the last notified status, it sends a Telegram message and persists
  the new state.

Two separate KV keys are used, each with a single writer, to avoid race
conditions caused by KV's eventual consistency:

| Key | Written by | Purpose |
|---|---|---|
| `heartbeat` | `fetch` only | Timestamp of the last received ping |
| `notificationState` | `scheduled` only | Last notified status, to avoid duplicate alerts |

On the very first run (no prior notification state), the worker stores the
initial status silently, without sending a notification.

## Project structure

```
src/
├── index.ts           # Worker entry point (fetch + scheduled handlers)
├── i18n.ts             # Locale contract, loading and message lookup
└── locales/
    ├── it.json         # Italian notification text
    └── en.json          # English notification text
```

Notification text lives in plain JSON files under `src/locales/`, separate
from the worker logic — add a language by creating a new `xx.json` file and
registering it in `i18n.ts`, no need to touch `index.ts`.

## Prerequisites

- Node.js 20 or 22 (LTS). Avoid odd-numbered "Current" releases (e.g. 21, 23),
  which can be less stable with some npm/Wrangler tooling.
- A Cloudflare account
- A Telegram bot token and chat ID ([BotFather](https://t.me/BotFather) to
  create a bot)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Log in to Cloudflare

```bash
npx wrangler login
```

### 3. Create the KV namespace

```bash
npx wrangler kv namespace create SERVER_STATUS
```

Copy the returned `id` into `wrangler.jsonc`:

```jsonc
{
  "kv_namespaces": [
    {
      "binding": "SERVER_STATUS",
      "id": "your-namespace-id-here"
    }
  ]
}
```

### 4. Configure non-sensitive variables

In `wrangler.jsonc`:

```jsonc
{
  "vars": {
    "LAST_SEEN_WINDOW_MINUTES": "10",
    "NOTIFICATION_LANGUAGE": "it"
  }
}
```

### 4b. Configure the Cron Trigger

Still in `wrangler.jsonc`, make sure the `triggers` section is present —
without it, `scheduled` is never invoked in production, even though
everything else works fine:

```jsonc
{
  "triggers": {
    "crons": ["*/5 * * * *"]
  }
}
```

This is created/updated on Cloudflare automatically on every `wrangler
deploy`. After the first deploy, verify it actually shows up under
**Settings → Triggers** on the Cloudflare dashboard, and that the
**Invocations** count in **Metrics** increases over time — if it stays at
zero, the trigger isn't firing and this section is the first thing to
check.

### 5. Configure secrets

For local development, copy the example file and fill in real values:

```bash
cp .dev.vars.example .dev.vars
```

```
APP_TOKEN=your-bearer-token
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_CHAT_ID=your-telegram-chat-id
```

`.dev.vars` is gitignored and never committed.

For production, set the same secrets on Cloudflare:

```bash
npx wrangler secret put APP_TOKEN
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
```

### 6. Generate TypeScript types (required)

```bash
npx wrangler types
```

This generates `worker-configuration.d.ts`, which declares the `Env`
interface (KV bindings, vars, secrets) based on `wrangler.jsonc`. The file
is **not committed to the repository** (it's derived, listed in
`.gitignore`), so this step is required right after cloning and installing
— the project won't type-check or run without it.

Re-run this command whenever you change `wrangler.jsonc` (new binding, new
var, etc.) so `Env` stays in sync.

## Local development

Start the dev server:

```bash
npx wrangler dev
```

The worker runs at `http://localhost:8787`. KV is emulated locally by
default — no production data is touched.

### Test the heartbeat endpoint

```bash
curl http://localhost:8787/ \
  -H "Authorization: Bearer YOUR_APP_TOKEN"
```

### Test the scheduled check manually

Start the dev server with scheduled-event support:

```bash
npx wrangler dev --test-scheduled
```

In another terminal, trigger the scheduled handler on demand:

```bash
curl "http://localhost:8787/__scheduled"
```

Logs — including any errors caught inside `scheduled` — appear directly in
the terminal running `wrangler dev`, so there's no need to wait for the real
cron interval or dig through the dashboard log stream while testing.

## Deployment

```bash
npx wrangler deploy
```

The Cron Trigger defined in `wrangler.jsonc` is created/updated
automatically on deploy. Verify it under **Settings → Triggers** on the
Cloudflare dashboard after the first deploy.

## Monitoring in production

Tail live logs from the deployed worker:

```bash
npx wrangler tail
```

## Configuration reference

| Variable | Type | Required | Default | Description |
|---|---|---|---|---|
| `APP_TOKEN` | secret | yes | — | Bearer token expected on the heartbeat endpoint |
| `TELEGRAM_BOT_TOKEN` | secret | yes | — | Telegram bot token |
| `TELEGRAM_CHAT_ID` | secret | yes | — | Telegram chat ID to notify |
| `LAST_SEEN_WINDOW_MINUTES` | var | no | `10` | Minutes of silence before the service is considered down (clamped between 1 and 120) |
| `NOTIFICATION_LANGUAGE` | var | no | `it` | Language used for Telegram notifications (see `src/locales/`) |

## License

MIT