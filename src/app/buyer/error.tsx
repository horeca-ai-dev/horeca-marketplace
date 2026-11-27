"use client";

/** Error boundary of the buyer area (D4-A2): renders inside the AppShell, so navigation stays usable. */
import { DomainErrorBoundary } from "@/components/domain/errors/domain-error-boundary";
import { AREAS } from "@/components/domain/shell/nav";

export default function BuyerError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <DomainErrorBoundary
      error={error}
      retry={retry}
      homeHref={AREAS.buyer.home}
    />
  );
}
