"use client";

/**
 * The error summary at the top of a form (D4-A3): what is wrong, with a link to every field that
 * needs attention. After a failed submit the form moves focus here, so a keyboard or screen-reader
 * user hears the errors first and can jump to each field.
 *
 *   const summary = useErrorSummary();
 *   …on a failed submit: summary.focus();
 *   <ErrorSummary focusRequest={summary.focusRequest} title=… message=… items=… />
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type ErrorSummaryItem = { id: string; text: string };

/** A counter, not a flag: every failed submit asks for focus again. */
export function useErrorSummary() {
  const [focusRequest, setFocusRequest] = useState(0);
  const focus = useCallback(() => setFocusRequest((n) => n + 1), []);
  return { focusRequest, focus };
}

export function ErrorSummary({
  focusRequest,
  title,
  message,
  items,
}: {
  /** From useErrorSummary(): when it grows, the summary takes focus. */
  focusRequest: number;
  title: string;
  /** An error that belongs to no field (wrong credentials, rate limit, server failure). */
  message?: string;
  items: ErrorSummaryItem[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const handledRequest = useRef(0);
  const visible = Boolean(message) || items.length > 0;
  // The request can arrive one render BEFORE the errors do (React Hook Form publishes them after it
  // has called the form's "invalid" callback). So: wait until the summary is on the page, then
  // focus once per request.
  useEffect(() => {
    if (visible && focusRequest > handledRequest.current) {
      handledRequest.current = focusRequest;
      ref.current?.focus();
    }
  }, [focusRequest, visible]);

  if (!visible) return null;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      className="rounded-md bg-negative-bg p-3 text-sm text-negative-text"
    >
      <p className="font-semibold">{message ?? title}</p>
      {items.length > 0 ? (
        <ul className="mt-1 flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="underline"
                onClick={(event) => {
                  // A plain #link only scrolls; the user should land IN the field.
                  event.preventDefault();
                  document.getElementById(item.id)?.focus();
                }}
              >
                {item.text}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
