import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";
import { buttonVariants } from "./buttonVariants";
import { cn } from "./lib/cn";
import { NavigationNotice } from "./NavigationNotice";

/**
 * The frame every logged-in page renders: the one <main> landmark, responsive
 * padding, and a width. "reading" is a centered, readable column for lists,
 * forms and detail pages; "wide" is for pages whose content is wide (board,
 * sprints, analytics). Loading and not-found states use it too, so every state
 * of a page has a main landmark, not only the loaded one.
 */
export function Page({
  width = "reading",
  children,
}: {
  width?: "reading" | "wide";
  children: ReactNode;
}) {
  return (
    <main
      className={cn(
        "mx-auto w-full px-4 py-6 sm:px-8 sm:py-8",
        width === "reading" ? "max-w-5xl" : "max-w-7xl",
      )}
    >
      <NavigationNotice />
      {children}
    </main>
  );
}

/**
 * The top of a page: an optional small eyebrow (the project name on project
 * pages, an issue key on an issue), the serif title, an optional back link,
 * and `children` for a meta row under the title. A back link with `history: true` goes back to
 * the page the person came from (labelled "Back"), and to its own address with its own label only
 * when there is no previous page (opened from a bookmark or a new tab). It imports react-router's
 * Link, the one router dependency in this library, so a page does not
 * hand-write the same back-link markup.
 */
export function PageHeader({
  eyebrow,
  title,
  back,
  children,
}: {
  eyebrow?: string;
  title: string;
  back?: { to: string; label: string; history?: boolean };
  children?: ReactNode;
}) {
  const navigate = useNavigate();
  // React Router gives the first page of a session the key "default": there is nothing to go back to.
  const hasPreviousPage = useLocation().key !== "default";
  const backByHistory = Boolean(back?.history) && hasPreviousPage;
  return (
    <header className="mb-6">
      {back && (
        <Link
          to={back.to}
          // history: go to where the person actually came from (a plain click only; a middle click or
          // "open in new tab" still uses the fallback address). With no previous page, the fallback.
          onClick={
            backByHistory
              ? (event) => {
                  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  navigate(-1);
                }
              : undefined
          }
          className={cn(buttonVariants({ variant: "link" }), "mb-2 inline-flex items-center gap-1")}
        >
          <ArrowLeft size={14} aria-hidden="true" />
          {backByHistory ? "Back" : back.label}
        </Link>
      )}
      {eyebrow && <p className="text-sm text-[var(--color-text-muted)]">{eyebrow}</p>}
      <h1 className="font-display text-3xl font-normal [overflow-wrap:anywhere]">{title}</h1>
      {children && <div className="mt-2">{children}</div>}
    </header>
  );
}
