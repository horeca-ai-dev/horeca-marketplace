import { AppShell } from "@/components/domain/shell/app-shell";
import { requireArea } from "@/server/auth/guard";

export default async function Layout({ children }: LayoutProps<"/buyer">) {
  const { orgName } = await requireArea("/buyer");
  return (
    <AppShell area="buyer" orgName={orgName}>
      {children}
    </AppShell>
  );
}
