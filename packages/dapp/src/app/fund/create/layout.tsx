import type { Metadata, ResolvedMetadata, ResolvingMetadata } from 'next';
import { trimAddress } from "@/lib/util";

// https://nextjs.org/docs/app/api-reference/functions/generate-metadata#generatemetadata-function
export async function generateMetadata(
  {params}: {params: Promise<{ id: string }>},
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const meta: ResolvedMetadata = (await parent);
  return {
    title: `re-fund | create fund`,
    description: meta.description,
  };
}

export default function CreateLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      {children}
    </>
  );
}
