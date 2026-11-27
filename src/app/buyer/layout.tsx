import { AppShell } from "@/components/domain/shell/app-shell";
import { requireArea } from "@/server/auth/guard";

export default async function Layout({ children }: LayoutProps<"/buyer">) {
  await requireArea("/buyer");
  return <AppShell area="buyer">{children}</AppShell>;
}
