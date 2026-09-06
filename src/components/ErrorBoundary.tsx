/**
 * The last line of defence against a white screen.
 *
 * Every page in this app is behind `React.lazy`, and a throw during render —
 * a malformed relay event, a decrypt that returns something unexpected, a
 * chunk that fails to load after a deploy — unmounts the entire tree. Without
 * a boundary the user gets a blank page with no way back except typing a URL,
 * and on the packaged mobile app there is no URL bar to type into.
 *
 * Two placements, for two different failures:
 *
 *   - one inside the router, keyed on the pathname, so a crashed route leaves
 *     the navigation usable and navigating away clears it (React does not
 *     reset a boundary on its own — without the key, one bad route poisons
 *     every subsequent one);
 *   - one around the whole shell, for a crash in the navigation itself, where
 *     the only honest offer is a reload.
 *
 * `error.message` is shown behind a disclosure; `error.stack` never is. On a
 * private-event route a decrypt failure can carry key material into the stack,
 * and a screenshot of an error dialog is exactly the thing people paste into
 * a support thread.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { AlertTriangle, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  /** Shown instead of the default card. Receives a reset that clears the error. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The one place a stack is genuinely useful is the developer console, which
    // is local to the person debugging. It still never reaches the DOM.
    console.error("Unhandled render error:", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div className="container mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
        <div className="rounded-full bg-destructive/10 p-3">
          <AlertTriangle className="size-6 text-destructive" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            This part of Plektos hit an error and stopped. Your data is safe — nothing was
            saved or sent.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={this.reset} variant="default" className="rounded-2xl">
            <RotateCw className="mr-1.5 size-4" /> Try again
          </Button>
          <Button
            onClick={() => globalThis.location.reload()}
            variant="outline"
            className="rounded-2xl"
          >
            Reload the app
          </Button>
        </div>
        {error.message && (
          <details className="w-full text-left">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              Technical details
            </summary>
            <p className="mt-2 break-words rounded-lg bg-muted p-2 font-mono text-xs">
              {error.message}
            </p>
          </details>
        )}
      </div>
    );
  }
}

/**
 * A boundary that resets itself when the route changes.
 *
 * The `key` is the whole mechanism: React discards the old instance — error
 * state included — when the key changes, so navigating away from a broken page
 * genuinely recovers rather than showing the previous route's error forever.
 */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <ErrorBoundary key={pathname}>{children}</ErrorBoundary>;
}
