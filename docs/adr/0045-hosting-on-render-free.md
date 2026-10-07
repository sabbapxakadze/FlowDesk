# 0045 - Free hosting: one web service on Render, Postgres on Neon, files on Cloudflare R2

Status: Accepted - 2026-10-07 (owner chose Render after the options below were compared). Checked on the providers' own pages the same day; things not checked are marked.

## Context

The owner wants FlowDesk live for free, without buying a domain yet. Facts about the app that shape the choice: the API keeps live-update state in memory (Socket.IO rooms, who is viewing an issue, the rate limiters), so it needs ONE long-running server, not many serverless copies; uploads and avatars are written to local disk (`lib/storage.ts`); the login's refresh cookie (path `/api/v1/auth`, SameSite=Lax, Secure) only works when the web app and the API share one address.

## Decision

- **One process serves the built web app and the API** (and Socket.IO) on one address: no CORS, no cross-site cookie problem, no second host. Deployed as a **Render free web service** from the repository with Render's **native Node build** (a build command and a start command, described in a `render.yaml` blueprint), reachable at a free `*.onrender.com` HTTPS address.
- **No Docker for now** (owner's decision, 2026-10-07): Render does not need it, it would only add work before anything is live, and CI does not need it either (GitHub Actions starts a Postgres service; the file-storage tests use a fake S3 inside the test). It can be added later as its own slice (a portable image, a one-command production-like run, a talking point).
- **Database: Neon free Postgres** (real Postgres, so generated columns, GIN indexes and `FOR UPDATE` keep working). Not Render's own free Postgres: it is deleted 30 days after creation.
- **Files: Cloudflare R2** behind the existing `lib/storage.ts` seam (an S3-compatible adapter), because a Render free web service has no persistent disk. Until that is built, production runs with uploads switched off (the first deploy does not wait for it).
- **Email: the fake/log sender at first.** Resend can only send to the owner's own address until a domain is verified, so mail to other people waits for a domain. The app already works without verified emails (login is not gated on them).
- **Migrations run when the server starts**, because Render's pre-deploy command is not available on free web services.
- **No Redis yet.** The in-memory design is correct for one instance; Redis (shared rate limits, Socket.IO adapter) is for the day there is more than one.

## What was verified (and where)

- Render free web services: spin down after 15 minutes without traffic, wake in about a minute, 750 free instance hours a month per workspace, no persistent disk; free Postgres capped at 1 GB and expires after 30 days ([Render free tier](https://render.com/docs/free)). Free instance size 512 MB RAM and 0.1 CPU (from Render's instance-types page, found by search, not opened directly).
- The pre-deploy command is not available on free web services ([Render deploys](https://render.com/docs/deploys)).
- Render web services accept WebSocket connections, with no fixed timeout; they close when the instance is replaced or spins down, so the client must reconnect ([Render WebSockets](https://render.com/docs/websocket)). Our socket client already reconnects (tested in earlier phases). Whether free instances are treated differently is not stated.
- Neon free: 1 GB per project, 100 compute-hours a month per project, sleeps after 5 minutes idle, limits pause the database without deleting data ([Neon limits](https://neon.com/faqs/free-plan-limits-and-quotas)).
- Cloudflare R2 free: 10 GB-month storage, 1 million Class A and 10 million Class B operations a month, no egress fee ([R2 pricing](https://developers.cloudflare.com/r2/pricing/)).
- Resend free: 3,000 emails a month, 100 a day; before a domain is verified it sends only to the account owner's address ([Resend pricing](https://resend.com/docs/knowledge-base/what-is-resend-pricing), [sending rules](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)).
- Vercel Hobby is personal and non-commercial only, and WebSocket support is a public beta ([Hobby plan](https://vercel.com/docs/plans/hobby), [WebSocket guide](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections)).

## NOT checked

Whether Render's free tier needs a credit card at sign-up (its docs do not say); whether R2 needs a payment method to enable; free bandwidth and build-minute limits on Render (only seen in third-party summaries); whether Neon's pooled connection works with our migrations (the plan uses the direct connection); whether our database client already connects over TLS; whether Render's native Node build handles our pnpm workspace (the first deploy tests it); how long Render keeps logs; free uptime-monitor and error-tracking services; Safari and Firefox.

## Trade-offs, named

- **The site sleeps.** The first visitor after 15 quiet minutes waits 30-60 seconds, and Neon sleeps after 5 minutes on top of that. A ping every few minutes keeps Render awake (one service running all month is about 744 hours, inside the 750 free hours), but Render's view of that practice was not checked, and the database still sleeps unless the ping touches it.
- **A weak machine** (512 MB, 0.1 CPU): fine for a portfolio, slow for heavy work such as photo processing.
- **Free tiers change.** The ADR records what was true on 2026-10-07.
- **Render is not Vercel**: the web app is not on a global CDN. Moving the web app to Vercel later is possible, but needs the API on a rewrite or a shared domain, and Redis for the live updates if the API ever runs as functions.

## Alternatives rejected

A Docker image deploy (the owner chose to skip Docker for now), Google Cloud Run (free quota is real, but it needs a billing account and the owner preferred not to attach a card), Vercel for the API (in-memory live state and local uploads do not fit functions), Fly.io and Railway (no real free tier any more, per third-party summaries, not checked), Render's own Postgres (30-day expiry).
