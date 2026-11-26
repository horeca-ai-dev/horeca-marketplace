import { AppShell } from "@/components/domain/shell/app-shell";

export default function Layout({ children }: LayoutProps<"/supplier">) {
  return <AppShell area="supplier">{children}</AppShell>;
}
