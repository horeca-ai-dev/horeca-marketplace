"use client";
/** THROWAWAY (G0 check) — calls the Server Action and shows exactly what came back. */
import { useAction } from "next-safe-action/hooks";
import { pingAction } from "./actions";

export function PingButton() {
  const { execute, result, isPending } = useAction(pingAction);
  return (
    <div>
      <button
        type="button"
        disabled={isPending}
        onClick={() => execute({ note: "hello from G0" })}
      >
        {isPending ? "Pinging…" : "Run the Server Action"}
      </button>
      <pre>{JSON.stringify(result, null, 2)}</pre>
    </div>
  );
}
