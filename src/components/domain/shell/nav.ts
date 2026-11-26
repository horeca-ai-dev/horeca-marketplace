/**
 * The navigation of the three areas, as data (DESIGN.md → Screens). One list feeds the sidebar /
 * header row, the mobile sheet and the placeholder pages, so they cannot drift apart.
 *
 * `labelKey` is a key of the message catalogue (type-checked). The first entry of an area is its
 * home page (`/buyer`, `/supplier`, `/admin`).
 */
import {
  Building2,
  ClipboardList,
  FileText,
  FolderTree,
  LayoutDashboard,
  LayoutGrid,
  type LucideIcon,
  Package,
  Percent,
  Truck,
  Upload,
  Wallet,
} from "lucide-react";
import type { MessageKeys, Messages, NestedKeyOf } from "next-intl";

export type Area = "buyer" | "supplier" | "admin";

type MessageKey = MessageKeys<Messages, NestedKeyOf<Messages>>;

export type NavEntry = {
  href: string;
  labelKey: Extract<MessageKey, `nav.${string}`>;
  icon: LucideIcon;
};

export const AREAS: Record<
  Area,
  {
    home: string;
    /** The organization type that works in this area — shown in the header as "who you act as". */
    orgTypeKey: Extract<MessageKey, `orgType.${string}`>;
    nav: readonly NavEntry[];
  }
> = {
  buyer: {
    home: "/buyer",
    orgTypeKey: "orgType.buyer",
    nav: [
      { href: "/buyer", labelKey: "nav.buyer.catalogue", icon: LayoutGrid },
      {
        href: "/buyer/orders",
        labelKey: "nav.buyer.orders",
        icon: ClipboardList,
      },
      {
        href: "/buyer/contracts",
        labelKey: "nav.buyer.contracts",
        icon: FileText,
      },
      {
        href: "/buyer/company",
        labelKey: "nav.buyer.company",
        icon: Building2,
      },
    ],
  },
  supplier: {
    home: "/supplier",
    orgTypeKey: "orgType.supplier",
    nav: [
      {
        href: "/supplier",
        labelKey: "nav.supplier.dashboard",
        icon: LayoutDashboard,
      },
      {
        href: "/supplier/products",
        labelKey: "nav.supplier.products",
        icon: Package,
      },
      {
        href: "/supplier/import",
        labelKey: "nav.supplier.import",
        icon: Upload,
      },
      {
        href: "/supplier/orders",
        labelKey: "nav.supplier.orders",
        icon: ClipboardList,
      },
      {
        href: "/supplier/contracts",
        labelKey: "nav.supplier.contracts",
        icon: FileText,
      },
      {
        href: "/supplier/ledger",
        labelKey: "nav.supplier.ledger",
        icon: Wallet,
      },
      {
        href: "/supplier/company",
        labelKey: "nav.supplier.company",
        icon: Building2,
      },
    ],
  },
  admin: {
    home: "/admin",
    orgTypeKey: "orgType.platform",
    nav: [
      { href: "/admin", labelKey: "nav.admin.overview", icon: LayoutDashboard },
      {
        href: "/admin/suppliers",
        labelKey: "nav.admin.suppliers",
        icon: Truck,
      },
      {
        href: "/admin/categories",
        labelKey: "nav.admin.categories",
        icon: FolderTree,
      },
      {
        href: "/admin/commission",
        labelKey: "nav.admin.commission",
        icon: Percent,
      },
      {
        href: "/admin/orders",
        labelKey: "nav.admin.orders",
        icon: ClipboardList,
      },
    ],
  },
};

/**
 * Is this entry the current page? The area's home matches only itself; every other entry also
 * matches the pages below it (/buyer/orders/123 keeps "Porudžbine" active).
 */
export function isActive(area: Area, href: string, pathname: string): boolean {
  if (href === AREAS[area].home) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
