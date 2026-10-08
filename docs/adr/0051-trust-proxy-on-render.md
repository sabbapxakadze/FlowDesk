# 0051 - On Render the proxy chain is three hops: TRUST_PROXY=3

Status: Accepted - 2026-10-08. Amends ADR 0046 (which assumed one proxy, `TRUST_PROXY=1`) and ADR 0049.

## Context

ADR 0046 set `TRUST_PROXY=1` for Render on the assumption of one proxy in front, and listed "how Render's proxy forwards X-Forwarded-For" as not verified. After the first deploy the owner read one request's header in Render's log: `x-forwarded-for` held **three** addresses, `visitor, 162.158.x.x, 10.x.x.x`. The first is the visitor, the second is in Cloudflare's address range (from memory, not checked), the third is a Render-internal address. The server's own socket peer (also a 10.x address, seen as `remoteAddress` in the log) is a fourth, internal one that never appears in the header.

Express's `trust proxy` with a number N trusts the N addresses nearest the server and takes the next one as the visitor. With N=1 that next address is the **internal 10.x address**, so every visitor would have looked like the same internal address: one shared bucket for the login, register and demo-start limits, and the wrong address in logs.

## Decision

`TRUST_PROXY=3` on Render (in the dashboard's environment, `render.yaml` and `.env.example`). Counted from the server: the socket peer, the internal address, the Cloudflare address, so the next entry is the visitor. Because every hop appends the address it saw, a visitor who sends their own `X-Forwarded-For` only pushes the real chain to the right; counting from the server's end still lands on the real visitor.

## Tested

`lib/proxy.test.ts`: with the real chain shape, N=1 gives the internal address (the mistake, now pinned down) and N=3 gives the visitor; a forged first entry does not win at N=3.

## Limits, named

- **A fixed hop count is brittle.** If Render or Cloudflare adds or removes a hop, the value is wrong again, silently. The signs: the logged visitor address turns into a 10.x or Cloudflare address, or the limiters trip for unrelated people. Re-read a log line after any Render change of infrastructure.
- Not verified on the live site until `TRUST_PROXY` is changed there and redeployed, and a limit is then seen counting per visitor (for example from two different networks).
- The rate limiters are in memory per server instance (unchanged, ADR 0044).
