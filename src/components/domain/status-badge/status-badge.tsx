/**
 * StatusBadge (DESIGN.md → Badges): one component for every status in every area.
 *
 *   <StatusBadge entity="subOrder" status={row.status} />
 *   <StatusBadge entity="stock" status="in_stock" values={{ qty: "24", unit: "kom" }} />
 *   <StatusBadge entity="cardPayment" status="refunded" values={{ amount: formatMoney(c) }} />
 *
 * Tone from STATUS_MAP, label from the catalogue (`status.<entity>.<value>`). A hidden status
 * (orderPayment `not_applicable`) renders nothing. No "use client": works in Server and Client
 * Components alike (useTranslations is allowed in both when the component is not async).
 */
import { useTranslations } from "next-intl";
import {
  STATUS_MAP,
  type StatusEntity,
  type StatusEntry,
  type StatusValue,
} from "./status-map";
import { ToneBadge } from "./tone-badge";

export function StatusBadge<E extends StatusEntity>({
  entity,
  status,
  values,
  className,
}: {
  entity: E;
  status: StatusValue<E>;
  /** ICU arguments of the label: stock {qty} {unit}, refunded card payment {amount} (already formatted). */
  values?: Record<string, string | number>;
  className?: string;
}) {
  const t = useTranslations("status");
  const entry = (STATUS_MAP[entity] as Record<string, StatusEntry>)[status];
  if ("hidden" in entry) return null;
  // The key is built from typed parts; status-map.test.ts proves every combination exists.
  const key = `${entity}.${status}` as Parameters<typeof t>[0];
  return (
    <ToneBadge tone={entry.tone} className={className}>
      {t(key, values)}
    </ToneBadge>
  );
}
