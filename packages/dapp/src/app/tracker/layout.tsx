import type { Metadata, ResolvedMetadata, ResolvingMetadata } from 'next';

// https://nextjs.org/docs/app/api-reference/functions/generate-metadata#generatemetadata-function
export async function generateMetadata(
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const meta: ResolvedMetadata = (await parent);
  return {
    title: 're-fund | global fund browser',
    description: meta.description,
  };
}

export default function TrackerLayout({
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
