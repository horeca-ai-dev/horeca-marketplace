/**
 * Root not-found (D4-A2): any URL that matches no route. Inside an area the area's own not-found.tsx
 * answers instead, within the AppShell.
 */
import { NotFoundPage } from "@/components/domain/errors/status-pages";

export default function NotFound() {
  return <NotFoundPage />;
}
