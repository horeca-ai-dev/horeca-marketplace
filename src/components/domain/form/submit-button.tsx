/**
 * The form's one primary (solid green) button. While the request runs it is disabled, shows a
 * spinner and a changed label (DESIGN.md → States, "Pending action") — which also stops a second
 * submit.
 */
import { Button } from "@/components/ui/button";

export function SubmitButton({
  pending,
  label,
  pendingLabel,
}: {
  pending: boolean;
  label: string;
  pendingLabel: string;
}) {
  return (
    <Button
      type="submit"
      variant="primary"
      disabled={pending}
      className="w-full"
    >
      {pending ? (
        <>
          <span
            aria-hidden="true"
            className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
          {pendingLabel}
        </>
      ) : (
        label
      )}
    </Button>
  );
}
