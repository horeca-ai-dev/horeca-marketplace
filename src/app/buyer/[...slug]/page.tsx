/** Placeholder for the screens of this area that are not built yet (see PlaceholderPage). */
import { PlaceholderPage } from "@/components/domain/shell/placeholder-page";

export default async function Page({ params }: PageProps<"/buyer/[...slug]">) {
  const { slug } = await params;
  return <PlaceholderPage area="buyer" path={`/buyer/${slug.join("/")}`} />;
}
