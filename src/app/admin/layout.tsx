import { AppShell } from "@/components/domain/shell/app-shell";
import { requireArea } from "@/server/auth/guard";

export default async function Layout({ children }: LayoutProps<"/admin">) {
  await requireArea("/admin");
  return <AppShell area="admin">{children}</AppShell>;
}
