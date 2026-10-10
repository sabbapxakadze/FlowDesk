import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * The width of an element, kept up to date as it changes (a window resize, the side panel opening). A page uses it to lay itself out by the
 * room it really has, not by the window's width: with the floating panel open the content can be a third of the window. The first value is a
 * guess from the window (the app's sidebar and padding taken off) so the first paint is close; the real width replaces it at once.
 */
export function useElementWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(() => (typeof window === "undefined" ? 1200 : Math.max(window.innerWidth - 300, 0)));
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry!.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}
