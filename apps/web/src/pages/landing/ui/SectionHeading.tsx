import type { ReactNode } from "react";

/** A section's title (the serif face the app uses for page titles) and an optional one-paragraph lead. */
export function SectionHeading({ id, title, children }: { id: string; title: string; children?: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <h2 id={id} className="font-display text-3xl leading-tight font-normal sm:text-4xl">
        {title}
      </h2>
      {children && <p className="mt-3 text-base text-[var(--color-text-muted)] sm:text-lg">{children}</p>}
    </div>
  );
}
