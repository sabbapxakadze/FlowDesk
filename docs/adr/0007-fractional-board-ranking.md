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
collapse two distinct ranks into the same float value. `numeric` has no
such ceiling within any practical row count.

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

**Inserting between two neighbors** (a future slice's move/reorder
operation) computes the midpoint via SQL: `(prev + next) / 2`, using
Postgres's exact decimal division. Before trusting that midpoint,
Postgres's built-in `scale(numeric)` function — which returns the number
of digits after the decimal point of a value — is checked against a
fixed ceiling (e.g. 20). A midpoint needing more decimal places than that
means the gap has been bisected so many times it's effectively
exhausted; rather than keep bisecting into more and more decimal places,
the whole column is rebalanced (every row in that `(project_id, status)`
group renumbered to fresh, evenly-spaced integer multiples of 1000) and
the insert is recomputed against the fresh neighbors. Checking `scale()`
directly is exact and Postgres-native — no JS-side distance/epsilon
comparison is needed, which would reintroduce the same float-precision
trap this whole scheme exists to avoid.

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
  event by design (thousands of same-spot bisections between the exact
  same two neighbors, in a single column, before it triggers).
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
