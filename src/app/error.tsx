"use client";

/**
 * Root error boundary (D4-A2): errors outside the areas (public pages, the root page). The areas have
 * their own, which render inside the AppShell. Errors in the root layout itself are not caught here —
 * Next's built-in global error page covers that rare case.
 */
import { DomainErrorBoundary } from "@/components/domain/errors/domain-error-boundary";

export default function RootError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <DomainErrorBoundary error={error} retry={retry} homeHref="/" standalone />
  );
}
