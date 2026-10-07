import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { DEMO_START_KEY, startDemo } from "../../../entities/demo";
import { useAuth } from "../../../shared/auth/useAuth";
import { withViewTransition } from "../../../shared/lib/motion";

/**
 * Starts a private demo and goes into it (ADR 0044): the server makes the copy and answers with a session, the page signs in with it and
 * cross-fades to My work (the same fade as a login), and then `onStarted` runs (the landing page starts the guided tour there).
 */
export function useEnterDemo(onStarted?: () => void) {
  const { login } = useAuth();
  const navigate = useNavigate();
  return useMutation({
    mutationKey: DEMO_START_KEY,
    mutationFn: startDemo,
    onSuccess: (session) => {
      withViewTransition(() => {
        login(session);
        void navigate("/");
      });
      onStarted?.();
    },
  });
}
