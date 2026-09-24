import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * shadcn's standard helper: clsx handles conditional/falsy classes,
 * tailwind-merge resolves conflicts when a caller's own className
 * overrides part of a variant's (e.g. a consumer passing `px-8` should
 * win over the component's own `px-4`, not just get appended after it).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
