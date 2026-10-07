import { useMutationState } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { DEMO_START_KEY, formatLifetime, useDemoInfo } from "../../../entities/demo";
import { Button, cn } from "../../../shared/ui";
import { useEnterDemo } from "./useEnterDemo";

/**
 * "Try the demo": one click gives the visitor a private copy of the demo with sample data (ADR 0044). Drawn only when the server offers it
 * (never a dead button). `onStarted` runs after the visitor is in (the landing page starts the guided tour).
 */
export function TryDemoButton({ onStarted, className }: { onStarted?: () => void; className?: string }) {
  const info = useDemoInfo();
  const enter = useEnterDemo(onStarted);
  if (!info.data?.enabled) return null;

  return (
    <Button
      type="button"
      variant="secondary"
      pending={enter.isPending}
      disabled={enter.isPending}
      onClick={() => enter.mutate()}
      className={cn("inline-flex items-center justify-center gap-2", className)}
    >
      {!enter.isPending && <Sparkles size={18} aria-hidden="true" />}
      {enter.isPending ? "Preparing your demo…" : "Try the demo"}
    </Button>
  );
}

/**
 * The sentence under the buttons: what the demo is and that it is deleted. If the last attempt to start one failed (for example "the demo
 * is busy right now"), that message replaces it. Not shown when the demo is off.
 */
export function DemoNote({ className }: { className?: string }) {
  const info = useDemoInfo();
  const errors = useMutationState({ filters: { mutationKey: DEMO_START_KEY }, select: (mutation) => mutation.state.error });
  const error = errors.at(-1);
  if (!info.data?.enabled) return null;
  if (error instanceof Error) {
    return (
      <p role="alert" className={cn("text-sm text-[var(--color-text-danger)]", className)}>
        {error.message}
      </p>
    );
  }
  return (
    <p className={cn("text-sm text-[var(--color-text-muted)]", className)} data-testid="demo-note">
      The demo is a private copy with sample data. It is deleted after about {formatLifetime(info.data.ttlMinutes)}.
    </p>
  );
}
