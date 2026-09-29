# 0010 — Cycle time: first start to first finish

Status: Accepted (Phase 8, slice 2)

## Context

ADR 0009 fixed how analytics reads history (replay each issue's own
events, a transition is real only if the status changed) and defined a
*completion*. Cycle time needs one more definition: when does the clock
start, and what happens with issues that skip a stage or get reopened?

## Decision

1. **Cycle time = first entry into `in_progress` -> first completion at
   or after it**, one value per issue.
   - "First entry": bouncing an issue back to todo and into progress again
     does not reset the clock; the work started when it first started.
   - "First completion": a reopened-and-finished-again issue is one cycle,
     not two. Counting repeat finishes is throughput's job (ADR 0009).
2. **An issue completed without ever being `in_progress` has no cycle
   time.** It is left out of the statistics and reported as `withoutStart`
   so the gap is visible instead of silently shrinking the sample.
3. **Window**: issues whose first finish falls in the last N UTC weeks,
   the same `?weeks=` as throughput.
4. **Reported as a summary plus a fixed histogram**: mean, median (p50),
   p90 (`percentile_cont`), and six buckets (`< 1 day`, `1-3 days`,
   `3-7 days`, `1-2 weeks`, `2-4 weeks`, `4+ weeks`) with an inclusive
   lower bound. The UI leads with the median. Statistics use unrounded
   values; days are rounded to one decimal only in the output.
5. **Transitions come from the same shared CTE as throughput**, so the two
   metrics cannot disagree about what a status change is.

## Consequences

- Median-first reporting is honest for skewed data; a mean alone would be
  dragged around by a few long-running issues.
- Teams that move straight from todo to done get a large `withoutStart`
  and thin cycle-time data. That is the correct signal, not a bug.
- Fixed buckets mean the histogram is comparable week to week but not
  tuned to any one project's scale.

## Alternatives rejected

- **created -> done (lead time)**: mostly measures time spent waiting in
  the backlog, not how long the work took.
- **Start from the last entry into in_progress**: a bounce would erase
  the real time already spent.
- **Count each completion as its own cycle**: double-counts reopened
  issues and muddies the distribution.
- **Treat skipped-in-progress issues as zero-length**: fabricates data
  points and drags every statistic down.
