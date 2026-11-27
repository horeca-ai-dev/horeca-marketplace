import { AppShell } from "@/components/domain/shell/app-shell";
import { requireArea } from "@/server/auth/guard";

export default async function Layout({ children }: LayoutProps<"/supplier">) {
  await requireArea("/supplier");
  return <AppShell area="supplier">{children}</AppShell>;
}
