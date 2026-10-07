# 0047 - Continuous integration with GitHub Actions

Status: Accepted - 2026-10-07. Phase 9 slice 9.3. Builds on ADR 0020 (e2e suite), 0045 (hosting) and 0046 (production server).

## Context

Every check so far runs by hand or in the `pre-push` hook on the owner's machine: typecheck, lint, the API tests, the e2e suite, the production smoke test. A hook can be skipped (`--no-verify`) and only covers one machine. CI runs the same checks on a clean machine for every push and pull request, so "works on my machine" (a leftover `.env`, a database that happens to have the right data, an unbuilt package) cannot hide a break. The e2e suite is the slow part (about 12 minutes on one machine).

## Decision

One workflow, `.github/workflows/ci.yml`, with four jobs that start at the same time:

- **check**: `pnpm typecheck` and `pnpm lint`.
- **api-tests**: `pnpm test` against a `postgres:16` service container. The test setup migrates the database itself.
- **build-and-smoke**: `pnpm test:e2e:prod`, which builds everything and runs the BUILT app as one process in production mode (ADR 0046). This is the same shape Render will run, so a build that only works with files on the owner's disk fails here.
- **e2e**: the browser suite split into **4 shards** (`playwright test --shard=n/4`) that run on four machines at the same time. Each shard has **its own Postgres**. The suite resets the whole database before every test, so tests cannot share a database, which is why it ran on one worker; separate databases are what make splitting safe. Wall time is roughly the slowest shard, not the sum (not measured on GitHub yet).

Choices, and why:

- **Throwaway values, no secrets.** The workflow sets dummy `JWT_SECRET`, `ATTACHMENT_SIGNING_SECRET`, `RESEND_API_KEY` and so on, only to let the API start in a database that exists for the length of the job. Nothing needs to be added in GitHub's secrets page. Mail is attempted and refused by the dummy key, exactly as in a local test run.
- **`permissions: contents: read`**: the jobs can read the code and nothing else, so a compromised dependency in a test run cannot push or touch the repository.
- **`concurrency` with cancel-in-progress**: a newer push to the same branch cancels the run still going, since its result is out of date.
- **`fail-fast: false` on the shards**: one failing shard must not hide the results of the others.
- **pnpm version from `packageManager`** in `package.json` (`pnpm/action-setup` reads it), Node 24 (`engines`), `pnpm install --frozen-lockfile` so CI fails if the lockfile and `package.json` disagree.
- **`HUSKY=0`**: the git hooks are for the owner's machine; CI has its own checks.
- **Failure artifacts**: Playwright traces and screenshots are uploaded for 7 days when a job fails, since a CI failure cannot be reproduced by looking at the machine.
- **Action versions are pinned to a major version** (`@v7`, `@v6`) as read from each action's releases page on 2026-10-07. A major tag moves with that action's own fixes; pinning each to a full commit hash is stricter and is a possible later hardening.

## One retry in CI (added after the first runs)

The first two CI runs each failed one browser test that passes on the owner's machine (a real session bug, ADR 0048, and a test reading a new tab's address too early). The browser suite on CI now **retries a failed test once** (`retries: 1` when the `CI` variable is set; locally none). A test that fails and then passes is reported as **flaky**, not as a plain pass, and its first-try screenshot and trace are uploaded (`if: always()`). The retry is a safety net for slow shared machines, not a licence: **every test reported as flaky is to be looked at**, because the first two were not noise. A test that fails twice fails the job. The production smoke test keeps no retry. Not verified: how GitHub's page shows a flaky test (the Playwright list output marks it).

## Not part of this slice

- **Blocking merges.** "Failing checks block merging" is a repository setting (Settings, Branches, a rule that requires the four checks), not a file in the code. The owner sets it after the first run, because the checks must have run once before GitHub lists them as selectable.
- **Deploying.** CI does not deploy; Render deploys from the repository on its own (slice 9.4).
- **Browsers other than Chromium**, Safari and Firefox included.
- **Caching Playwright's browser download.** It adds a few minutes per job; cache it only if it proves slow.

## Verified and not verified

Verified by me: the workflow file is valid YAML, and every command it runs was run from a clean copy of the tracked files (no `.env`, no `node_modules`) with only the environment the workflow sets. Results: install with the frozen lockfile, typecheck, lint, contracts build, the API suite (50 files, 492 tests), `pnpm test:e2e:prod` (4 tests) and e2e shard 1 of 4 (66 tests in 4.8 minutes) all passed. The shard run logs a Resend 401 for every email: that is the dummy key doing its job. The other three shards were not run (shard 1 only proves the command and environment work without a .env).

**Not verified: that GitHub accepts and runs the workflow.** It can only run once the repository is on GitHub, which the owner pushes. Things I could not check here: GitHub's hosted machines having enough memory for the e2e run, Playwright's `--with-deps` install on that image, the service container's health check timing, the real wall time.
