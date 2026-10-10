import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "./Button";

/**
 * Long content, folded: it shows its first `maxRem` rem with a soft fade at the bottom and a "Show more" button, and "Show less" folds it again. The
 * button is there only when the content is really taller than that, and the height is re-measured when the content or the window changes. One scroll
 * (the page's) instead of a scrolling box inside a scrolling page. Domain-free: it only knows its children.
 */
export function ShowMore({ children, maxRem = 15 }: { children: ReactNode; maxRem?: number }) {
  const inner = useRef<HTMLDivElement>(null);
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const element = inner.current;
    if (!element) return;
    const measure = () => setOverflowing(element.offsetHeight > maxRem * 16 + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [maxRem]);

  const folded = overflowing && !expanded;
  return (
    <div>
      <div
        id={id}
        className="overflow-hidden"
        style={folded ? { maxHeight: `${maxRem}rem`, maskImage: "linear-gradient(to bottom, black 70%, transparent)", WebkitMaskImage: "linear-gradient(to bottom, black 70%, transparent)" } : undefined}
      >
        <div ref={inner}>{children}</div>
      </div>
      {overflowing && (
        <Button type="button" variant="link" className="mt-1 text-sm" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Show less" : "Show more"}
        </Button>
      )}
    </div>
  );
}
