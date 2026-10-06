import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Button } from "../ui";
import {
  closeTour,
  goToStep,
  useTour,
  waitForTarget,
  type TourPlacement,
  type TourState,
  type TourStep,
} from "./tour-store";

const GAP = 14; // between the highlighted part and the card
const MARGIN = 12; // the card keeps this far from the window's edge
const PAD = 6; // the highlight is a little larger than the element

/**
 * The guided tour on screen (ADR 0040). Mount it once, inside the router. While a tour runs it dims the page, cuts a hole around the
 * current step's target and puts a card beside it with Back, Next and Skip; Esc ends it, the arrow keys step. Everything else on the
 * page is blocked so a stray click cannot start something halfway through a tour, and the tour itself never changes any data.
 */
export function TourOverlay() {
  const tour = useTour();
  if (!tour) return null;
  // Keyed by the step, so each step starts from a clean state (no target yet, nothing measured).
  return <StepView key={tour.steps[tour.index]!.id} tour={tour} />;
}

type Box = { left: number; top: number; width: number; height: number };

function place(
  target: Box,
  card: { width: number; height: number },
  preferred: TourPlacement,
): { left: number; top: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const sides: TourPlacement[] = [preferred, "bottom", "top", "right", "left"];
  const spot = (side: TourPlacement) => {
    switch (side) {
      case "bottom":
        return {
          left: target.left + target.width / 2 - card.width / 2,
          top: target.top + target.height + GAP,
        };
      case "top":
        return {
          left: target.left + target.width / 2 - card.width / 2,
          top: target.top - card.height - GAP,
        };
      case "right":
        return {
          left: target.left + target.width + GAP,
          top: target.top + target.height / 2 - card.height / 2,
        };
      case "left":
        return {
          left: target.left - card.width - GAP,
          top: target.top + target.height / 2 - card.height / 2,
        };
    }
  };
  const fits = (p: { left: number; top: number }) =>
    p.left >= MARGIN &&
    p.top >= MARGIN &&
    p.left + card.width <= vw - MARGIN &&
    p.top + card.height <= vh - MARGIN;
  const chosen = sides.map(spot).find(fits) ?? spot(preferred);
  // Whatever is left over is held inside the window.
  return {
    left: Math.min(
      Math.max(chosen.left, MARGIN),
      Math.max(MARGIN, vw - card.width - MARGIN),
    ),
    top: Math.min(
      Math.max(chosen.top, MARGIN),
      Math.max(MARGIN, vh - card.height - MARGIN),
    ),
  };
}

function StepView({ tour }: { tour: TourState }) {
  const step: TourStep = tour.steps[tour.index]!;
  const total = tour.steps.length;
  const isLast = tour.index === total - 1;
  const navigate = useNavigate();
  const location = useLocation();
  const titleId = useId();
  const bodyId = useId();
  const card = useRef<HTMLDivElement | null>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [ready, setReady] = useState(!step.target); // a step with no target is ready at once
  const pathAtStart = useRef(location.pathname);

  // Go to the step's page if needed, wait for its target to appear, bring it into view. A target that never appears (a phone, where the
  // sidebar is a drawer; a project without issues) skips the step in the direction the person was going, so a tour never gets stuck.
  useEffect(() => {
    let cancelled = false;
    async function show() {
      const navigated = Boolean(step.path && pathAtStart.current !== step.path);
      if (navigated && step.path) navigate(step.path);
      if (!step.target) return;
      // A page we just navigated to needs a few seconds to load its data; a part of the page we are already on is either there or not.
      const element = await waitForTarget(step.target, navigated ? 3000 : 1200);
      if (cancelled) return;
      if (!element) {
        goToStep(tour.index + tour.direction, tour.direction);
        return;
      }
      element.scrollIntoView({ block: "center", inline: "nearest" });
      setTarget(element);
      setReady(true);
    }
    void show();
    return () => {
      cancelled = true;
    };
    // The step is fixed for this component's life (it is keyed by the step), so this runs once per step.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Measure the target and the card, and again whenever the window, the scroll position or the target's size changes.
  useLayoutEffect(() => {
    if (!ready) return;
    function update() {
      const cardNode = card.current;
      if (!cardNode) return;
      const size = { width: cardNode.offsetWidth, height: cardNode.offsetHeight };
      if (!target) {
        setBox(null);
        setPosition({
          left: (window.innerWidth - size.width) / 2,
          top: Math.max(MARGIN, (window.innerHeight - size.height) / 2),
        });
        return;
      }
      const rect = target.getBoundingClientRect();
      const around = {
        left: rect.left - PAD,
        top: rect.top - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      };
      setBox(around);
      setPosition(place(around, size, step.placement ?? "bottom"));
    }
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const observer = new ResizeObserver(update);
    if (target) observer.observe(target);
    observer.observe(document.body);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      observer.disconnect();
    };
  }, [ready, target, step.placement]);

  // Focus the primary button on every step, so Enter moves on and a keyboard user never has to hunt for the card.
  useEffect(() => {
    if (ready)
      card.current
        ?.querySelector<HTMLElement>("[data-tour-next]")
        ?.focus({ preventScroll: true });
  }, [ready]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeTour();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goToStep(tour.index + 1, 1);
      } else if (event.key === "ArrowLeft" && tour.index > 0) {
        event.preventDefault();
        goToStep(tour.index - 1, -1);
      } else if (event.key === "Tab") {
        // Keep focus inside the card: the page behind is not available during a tour.
        const focusable = Array.from(
          card.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? [],
        );
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        const active = document.activeElement;
        if (event.shiftKey && (active === first || !card.current?.contains(active))) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (active === last || !card.current?.contains(active))
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [tour.index]);

  // While a step is still finding its part (or about to be passed over), the page behind stays blocked, so nothing is clicked half-way.
  if (!ready) return <div aria-hidden="true" className="fixed inset-0 z-[70]" />;
  return (
    <>
      {/* Blocks the page behind; with no target it is also the dimming. */}
      <div
        aria-hidden="true"
        className={`fixed inset-0 z-[70] ${box ? "" : "bg-black/55"}`}
      />
      {box && (
        <div
          aria-hidden="true"
          data-tour-spot=""
          className="pointer-events-none fixed z-[71] rounded-[var(--radius-card)] shadow-[0_0_0_9999px_rgb(0_0_0/0.55)] ring-2 ring-[var(--color-border-focus)]"
          style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
        />
      )}
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        data-tour-card=""
        className="fixed z-[72] w-80 max-w-[calc(100vw-1.5rem)] rounded-[var(--radius-card)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-4 text-[var(--color-text-default)] shadow-xl"
        style={{
          left: position?.left ?? 0,
          top: position?.top ?? 0,
          visibility: position ? "visible" : "hidden",
        }}
      >
        <p className="text-xs text-[var(--color-text-muted)]">
          Step {tour.index + 1} of {total}
        </p>
        <h2 id={titleId} className="mt-1 font-display text-xl leading-tight">
          {step.title}
        </h2>
        <p id={bodyId} className="mt-2 text-sm">
          {step.body}
        </p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button type="button" variant="link" onClick={closeTour}>
            Skip tour
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={tour.index === 0}
              onClick={() => goToStep(tour.index - 1, -1)}
            >
              Back
            </Button>
            <Button
              data-tour-next=""
              type="button"
              variant="create"
              size="sm"
              onClick={() => goToStep(tour.index + 1, 1)}
            >
              {isLast ? "Done" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
