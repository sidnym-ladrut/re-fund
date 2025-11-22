import type { Metadata, ResolvedMetadata, ResolvingMetadata } from 'next';

// https://nextjs.org/docs/app/api-reference/functions/generate-metadata#generatemetadata-function
export async function generateMetadata(
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const meta: ResolvedMetadata = (await parent);
  return {
    title: 're-fund | funder dashboard',
    description: meta.description,
  };
}

export default function FundLayout({
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
