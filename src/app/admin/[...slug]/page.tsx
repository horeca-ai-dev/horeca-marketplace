/** Placeholder for the screens of this area that are not built yet (see PlaceholderPage). */
import { PlaceholderPage } from "@/components/domain/shell/placeholder-page";

export default async function Page({ params }: PageProps<"/admin/[...slug]">) {
  const { slug } = await params;
  return <PlaceholderPage area="admin" path={`/admin/${slug.join("/")}`} />;
}
