# 0007 — Fractional board ranking

Status: Accepted — 2026-09-26

## Context

CLAUDE.md's conventions already lock the decision that board position
uses fractional ranking, never integer indexes — the classic reason being
that inserting a card between positions 3 and 4 with integer indexes
means renumbering every row after it, an `O(n)` write for what should be
a single-row move. Fractional ranking instead stores a comparable value
per row and inserts between two neighbors by picking a value between
them — no renumbering. What was undecided was the concrete scheme:
what type stores the rank, how a new value gets computed, and what
happens when two neighbors run out of room between them.

## Decision

**A `numeric` column** (Postgres's arbitrary-precision exact decimal
type), not `double precision`. `double precision` is an IEEE-754 float —
repeatedly bisecting the same gap (inserting between the same two
neighbors many times) accumulates rounding error and can eventually
collapse two distinct ranks into the same float value. `numeric`'s `+`,
`-`, and `*` are genuinely exact with no such ceiling — but its `/`
operator is not (see below); the exhaustion check this ADR designs
exists specifically because of that.

**All rank arithmetic happens in Postgres, in SQL — never in JS.**
Parsing a `numeric` string into a JS `number` to average two ranks would
silently reintroduce exactly the float-precision problem `numeric` exists
to avoid (JS numbers are IEEE-754 doubles too). Every computed rank is
produced by a SQL expression and only ever round-tripped as an opaque
string on the JS side, never parsed into a number.

**Initial spacing: a gap of 1000** between ranks within a
`(project_id, status)` column, assigned oldest-first
(`1000, 2000, 3000, ...`). Appending a new card (creating an issue, or
moving one to a column with no explicit position) is `MAX(board_rank) +
1000` — no bisection needed for the common case of adding to the end.

**Inserting between two neighbors** (the move endpoint, Phase 5 slice 2)
computes the midpoint via SQL: `trim_scale((prev + next) / 2)`.
`trim_scale()` (Postgres 13+) matters here, discovered while
implementing this: plain numeric division pads its result to a
generous display scale even when the value is exactly whole —
`3000::numeric / 2` returns `1500.0000000000000000`, not `1500`.
Checking `scale()` on that raw, padded result would measure division's
own padding, not the rank's real precision. `trim_scale()` reduces the
value to the minimal scale it actually needs before either storing it
or checking its scale, so both reflect true precision.

**A second, more fundamental discovery about `/` specifically, also made
while implementing this and worth being explicit about**: unlike `+`,
`-`, and `*`, Postgres's `numeric` division operator is *not*
unlimited-precision. It computes a heuristic result scale targeting
roughly 16 significant digits total (integer part plus decimal part
combined) — confirmed directly against this project's own Postgres 16
instance: `5::numeric/2` gets scale 16, but `12345678::numeric/2` (an
8-digit dividend) only gets scale 12, and it keeps shrinking as the
integer part grows. A naive exhaustion threshold anywhere near that
ceiling (an earlier version of this ADR suggested 20, before this was
caught) would never actually fire — `/` would silently round two
genuinely different bisections down to the *same* stored value first,
exactly the collision fractional ranking exists to prevent, with the
safety net never tripping because `scale()` never appeared to exceed a
threshold that was already unreachable. The fix is a conservative
threshold with real margin below the observed worst case, not a
theoretical one: `MAX_RANK_SCALE = 10`, comfortably under the ~12
significant-digit floor seen even for a large (7-8 digit) rank. That
trimmed `scale(numeric)` is checked against this ceiling; a midpoint
needing more decimal places means the gap is exhausted, and rather than
risk `/`'s own rounding, the whole column is rebalanced (every row in
that `(project_id, status)` group renumbered to fresh, evenly-spaced
integer multiples of 1000) and the insert recomputed against the fresh
neighbors. Checking `scale()` is still exact and Postgres-native — no
JS-side distance/epsilon comparison — the threshold just has to respect
`/`'s real ceiling, not an assumed unlimited one.

**Rank is an internal implementation detail, never sent to the client.**
The client expresses intent as "put this issue relative to issue X,"
never as a raw rank value — the server always returns pre-sorted lists
and does all rank computation itself. `board_rank` is not part of the
public `Issue` contract type.

## Consequences

- No card move ever requires touching more than one row's rank in the
  common case (append, or insert into a column with headroom) — the
  `O(n)` renumbering integer indexes would need never happens for a
  normal move.
- The rare rebalance (a whole column renumbered) is itself bounded by
  that column's size, not the whole project's issue count, and is a rare
  event by design (roughly a thousand same-spot bisections between the
  exact same two neighbors, in a single column, before it triggers).
- `/`'s heuristic result scale means the *safe* number of bisections
  before a rebalance shrinks slightly as a column's ranks grow into more
  digits (append-heavy columns get larger integer parts over time). Not
  a real concern at this project's scale — the margin between
  `MAX_RANK_SCALE` and `/`'s observed floor stays comfortable well past
  any row count a small team would realistically reach — but a genuine
  reason this isn't "provably unlimited" the way `+`/`-`/`*` alone
  would be.
- The `numeric` column and its arithmetic stay entirely server-side, so
  the frontend never has a chance to get rank math wrong — it only ever
  says "before/after this issue."
- Every rank-producing repository function is a small amount of extra
  SQL beyond a plain `INSERT`/`UPDATE`, but no more custom algorithm code
  than that — no string-bisection or alphabet-bucket logic to write or
  maintain.

## Alternatives rejected

- **LexoRank-style base62 string ranking** (what Jira actually uses) —
  strings support unbounded bisection by construction (there's always a
  string "between" two others by appending characters) and are a genuine,
  battle-tested approach, but implementing it means writing and testing a
  custom string-bisection algorithm plus its own rebalancing/bucket
  scheme from scratch. Postgres's native arbitrary-precision `numeric`
  type plus its built-in `scale()` function gets the same fractional-
  ordering guarantee with a fraction of the custom code — the right
  trade here, where the lesson worth learning is fractional ranking
  itself, not a bespoke string algorithm.
- **`double precision`** — the obvious first instinct, and wrong for
  exactly the reason floats are always wrong for this: repeated
  bisection of the same gap accumulates rounding error with a real
  ceiling on how many times it can happen before two ranks collapse.
- **Global rebalancing on every write** (renumber the whole project
  every time, to guarantee tidy integer-ish ranks) — unnecessary churn;
  a lazy, scale()-triggered rebalance scoped to just the one column that
  actually ran out of room is strictly less work and just as correct.
