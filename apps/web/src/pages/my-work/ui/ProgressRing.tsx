/** A ring of `done` out of `total`, with "3/5" in the middle. The green is the same "added / finished" colour the activity icons use. */
export function ProgressRing({ done, total }: { done: number; total: number }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" role="img" aria-label={`${done} of ${total} done`}>
      <circle cx="36" cy="36" r={radius} fill="none" strokeWidth="7" stroke="var(--color-bg-lane)" />
      <circle
        cx="36"
        cy="36"
        r={radius}
        fill="none"
        strokeWidth="7"
        strokeLinecap="round"
        stroke="var(--color-event-added)"
        strokeDasharray={`${total === 0 ? 0 : (done / total) * circumference} ${circumference}`}
        transform="rotate(-90 36 36)"
      />
      <text x="36" y="41" textAnchor="middle" fontSize="15" fontWeight="600" fill="var(--color-text-default)">
        {done}/{total}
      </text>
    </svg>
  );
}
