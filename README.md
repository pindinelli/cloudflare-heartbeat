![Still Alive](logo.jpg)

# still-alive

A lightweight dead man's switch on Cloudflare Workers. Your server or job
checks in at regular intervals; if the heartbeats stop, you get a Telegram
alert. Runs on the Cloudflare free tier.

Because the monitored service is the one that calls out, it works behind
NAT, CGNAT or a firewall, where an external ping can't reach it. Typical uses:

- a home server or Raspberry Pi without a public IP
- a nightly backup or cron job that must keep running
- any machine whose connection you want to know about when it drops

## How it works

The project is made of two Workers that share one KV namespace:

| Worker | Config | Entry | Role |
|---|---|---|---|
| `still-alive` | `wrangler.jsonc` | `src/monitor/index.ts` | Receives heartbeats (`fetch`) and checks them on a schedule (`scheduled`) |
| `still-alive-webhook` | `wrangler.webhook.jsonc` | `src/webhook/index.ts` | Telegram webhook that answers the `/status` command |

**`still-alive` (heartbeat + scheduler)**

- **`fetch`**: receives an authenticated request (Bearer token) from the
  monitored service and stores the current timestamp in KV as the latest
  heartbeat.
- **`scheduled`**: runs on a Cron Trigger (every 5 minutes by default), reads
  the last heartbeat and compares the elapsed time against a configurable
  window. If the computed status (`UP` / `DOWN`) differs from the last
  notified status, it sends a Telegram message and persists the new state.

**`still-alive-webhook` (Telegram webhook)**

- Receives updates from Telegram, verifies the `X-Telegram-Bot-Api-Secret-Token`
  header, and replies to `/status` with the current status and the last time
  the service was seen.
- Always answers `200` to updates it accepts or ignores, so Telegram doesn't
  retry the delivery. Requests with a wrong secret get `401`.

### KV keys

Two KV keys are used, each with a single writer, to avoid race conditions
caused by KV's eventual consistency:

| Key | Written by | Purpose |
|---|---|---|
| `heartbeat` | `fetch` only | Timestamp of the last received heartbeat |
| `notificationState` | `scheduled` only | Last notified status, to avoid duplicate alerts |

The bot Worker only reads these keys.

### Behavior to know about

- Alerts are sent only when the status **changes**, not on every check.
- On the very first run (no prior notification state) the Worker stores the
  initial status silently, without sending a notification.
- If no heartbeat has ever been received, the check exits silently and no
  alert is sent. Send at least one heartbeat after deploying.
- A missing or malformed `last_seen` value is treated as "down", never as "up".

## Project structure

```
src/
├── monitor/
│   └── index.ts      # Heartbeat Worker (fetch + scheduled handlers)
├── webhook/
│   └── index.ts      # Telegram webhook Worker
├── shared/
│   ├── env.ts        # requireEnv: validates required variables per handler
│   ├── i18n.ts       # Locale loading and message lookup
│   ├── telegram.ts   # Telegram API calls
│   └── types.ts      # Shared types
└── locales/
    ├── it.json       # Italian text
    └── en.json       # English text
test/                 # Vitest tests (Workers runtime)
wrangler.jsonc                # Config for the heartbeat Worker
wrangler.webhook.jsonc        # Config for the Telegram webhook Worker
```

Notification text lives in plain JSON files under `src/locales/`, separate
from the Worker logic. To add a language, create a new `xx.json` file and
register it in `src/shared/i18n.ts`, without touching the Workers' code.

## Prerequisites

- Node.js 22 or 24 (LTS). Avoid odd-numbered "Current" releases, which can be
  less stable with some tooling.
- pnpm
- A Cloudflare account
- A Telegram bot token and chat ID ([BotFather](https://t.me/BotFather) to
  create a bot)

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Log in to Cloudflare

```bash
npx wrangler login
```

### 3. Create the KV namespace

```bash
npx wrangler kv namespace create SERVER_STATUS
```

Copy the returned `id` into **both** `wrangler.jsonc` and
`wrangler.webhook.jsonc`. The two Workers must point to the **same**
namespace, otherwise `/status` can't see the heartbeats:

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

### 4. Configure variables

Non-sensitive variables go in `vars`. `NOTIFICATION_LANGUAGE` must be set in
**both** config files, so notifications and bot replies use the same language:

```jsonc
{
  "vars": {
    "NOTIFICATION_LANGUAGE": "en"
  }
}
```

`wrangler.jsonc` (heartbeat Worker) also takes the silence window:

```jsonc
{
  "vars": {
    "LAST_SEEN_WINDOW_MINUTES": "10",
    "NOTIFICATION_LANGUAGE": "en"
  }
}
```

Keep the window larger than the heartbeat interval (see
[Sending heartbeats](#sending-heartbeats)).

In `wrangler.jsonc`, also make sure the Cron Trigger is present. Without it,
`scheduled` is never invoked in production:

```jsonc
{
  "triggers": {
    "crons": ["*/5 * * * *"]
  }
}
```

### 5. Configure secrets

For local development, copy the example file and fill in real values:

```bash
cp .dev.vars.example .dev.vars
```

`.dev.vars` is gitignored and never committed.

For production, set the secrets on each Worker.

Heartbeat Worker:

```bash
npx wrangler secret put APP_TOKEN
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
```

Webhook Worker (note the `-c` flag):

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN -c wrangler.webhook.jsonc
npx wrangler secret put TELEGRAM_CHAT_ID -c wrangler.webhook.jsonc
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET -c wrangler.webhook.jsonc
```

`TELEGRAM_WEBHOOK_SECRET` is a random string **you** choose. BotFather doesn't
generate it. Create one with:

```bash
openssl rand -hex 32
```

### 6. Generate TypeScript types

```bash
pnpm cf-typegen
pnpm cf-typegen:webhook
```

These generate `worker-configuration.d.ts` and
`webhook-worker-configuration.d.ts`, which declare the `Env` interface for
each Worker. Re-run them whenever you change a `wrangler` config (new binding,
new var), so `Env` stays in sync.

### 7. Deploy

```bash
pnpm run deploy
pnpm run deploy:webhook
```

Use `pnpm run deploy`, not `pnpm deploy`: the latter is a built-in pnpm
command and doesn't run the script.

After the first deploy, check under **Settings → Triggers** in the Cloudflare
dashboard that the Cron Trigger shows up, and that **Invocations** under
**Metrics** increase over time. If they stay at zero, the trigger isn't firing.

### 8. Register the Telegram webhook

Tell Telegram where to send updates **and** which secret to attach to each
request. The `secret_token` must be identical to `TELEGRAM_WEBHOOK_SECRET`:

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=https://still-alive-webhook.<your-account>.workers.dev" \
  -d "secret_token=<YOUR_WEBHOOK_SECRET>"
```

Telegram stores the secret and sends it in the
`X-Telegram-Bot-Api-Secret-Token` header on every delivery. If you change the
secret, run `setWebhook` again with the new value.

Verify the registration:

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```

Check `last_error_message`: `Wrong response from the webhook: 401` means the
secret on the Worker and the one given to `setWebhook` don't match.

## Sending heartbeats

The monitored machine must call the heartbeat endpoint regularly. Example
crontab entry (every 5 minutes):

```bash
*/5 * * * * curl -fsS -m 10 https://still-alive.<your-account>.workers.dev/ -H "Authorization: Bearer YOUR_APP_TOKEN"
```

The heartbeat interval must be **shorter than** `LAST_SEEN_WINDOW_MINUTES`,
ideally half of it, otherwise a single delayed ping triggers a false alert.

On the free tier, KV has a daily write limit (check Cloudflare's current
limits). A heartbeat every 5 minutes is 288 writes per day, while one per
minute would be 1,440.

## Local development

Start the heartbeat Worker:

```bash
pnpm dev
```

It runs at `http://localhost:8787`, with KV emulated locally, so no
production data is touched.

Send a test heartbeat:

```bash
curl http://localhost:8787/ -H "Authorization: Bearer YOUR_APP_TOKEN"
```

Test the scheduled check on demand:

```bash
pnpm dev --test-scheduled
curl "http://localhost:8787/__scheduled"
```

`/__scheduled` exists only in local dev. Logs appear in the terminal running
`wrangler dev`.

Start the webhook Worker:

```bash
pnpm dev:webhook
```

Simulate a Telegram update:

```bash
curl -X POST http://localhost:8787/ \
  -H "X-Telegram-Bot-Api-Secret-Token: YOUR_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"message":{"text":"/status","chat":{"id":123456}}}'
```

### Tests

```bash
pnpm test           # watch mode
pnpm test --run     # single run
```

## Monitoring in production

Tail live logs from either deployed Worker:

```bash
npx wrangler tail
npx wrangler tail still-alive-webhook
```

The Cron Trigger shows up in the tail as a separate event, with the cron
expression, before its logs. Logs end up in Cloudflare, so never log tokens
or secrets.

## Configuration reference

| Variable | Type | Worker | Required | Default | Description |
|---|---|---|---|---|---|
| `APP_TOKEN` | secret | heartbeat | yes | none | Bearer token expected on the heartbeat endpoint |
| `TELEGRAM_BOT_TOKEN` | secret | both | yes | none | Telegram bot token |
| `TELEGRAM_CHAT_ID` | secret | both | yes | none | Telegram chat ID to notify |
| `TELEGRAM_WEBHOOK_SECRET` | secret | webhook | yes | none | Secret Telegram sends in the webhook header (same value given to `setWebhook`) |
| `LAST_SEEN_WINDOW_MINUTES` | var | heartbeat | no | `10` | Minutes of silence before the service is considered down (clamped between 1 and 120) |
| `NOTIFICATION_LANGUAGE` | var | both | no | `it` | Language of notifications and bot replies (see `src/locales/`) |

## Security notes

- Never commit `.dev.vars`. If a token ever appears in logs, a commit or a
  chat, revoke it (`/revoke` in BotFather) and set the new one with
  `wrangler secret put`.
- The webhook endpoint rejects requests that don't carry the right secret
  header, so knowing the URL isn't enough to send it commands.

## Roadmap

- Show how long an outage lasted in the recovery message
- CI pipeline running the tests
- More notification channels besides Telegram

## License

MIT