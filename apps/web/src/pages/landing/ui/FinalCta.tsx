import { DemoNote } from "../../../features/try-demo";
import { buttonVariants, cn, FadeLink } from "../../../shared/ui";
import { LandingDemoButton } from "./LandingDemoButton";

/** The same two ways in as the top of the page, after the visitor has read what the app does. */
export function FinalCta() {
  return (
    <section aria-labelledby="landing-cta" className="mx-auto mt-20 w-full max-w-6xl px-4 sm:mt-28 sm:px-6">
      <div className="glass-card rounded-[var(--radius-card)] px-6 py-12 text-center sm:py-14">
        <h2 id="landing-cta" className="font-display text-3xl leading-tight font-normal sm:text-4xl">
          Ready to look around?
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-base text-[var(--color-text-muted)] sm:text-lg">
          Create an account and start with your first project, or log in if you already have one.
        </p>
        <div className="mx-auto mt-7 flex w-full max-w-xs flex-col gap-3 sm:w-auto sm:max-w-none sm:flex-row sm:justify-center">
          <FadeLink to="/register" className={cn(buttonVariants({ variant: "create" }), "inline-flex h-12 items-center justify-center px-8 text-base font-semibold")}>
            Create account
          </FadeLink>
          <FadeLink to="/login" className={cn(buttonVariants({ variant: "secondary" }), "inline-flex h-12 items-center justify-center bg-[var(--color-bg-surface)] px-8 text-base")}>
            Log in
          </FadeLink>
          <LandingDemoButton />
        </div>
        <DemoNote className="mx-auto mt-4 max-w-md" />
      </div>
    </section>
  );
}
