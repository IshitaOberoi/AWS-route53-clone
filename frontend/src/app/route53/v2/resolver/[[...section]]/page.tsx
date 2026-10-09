import SectionPlaceholder from '@/components/common/SectionPlaceholder';

export default async function ResolverPage({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const { section = [] } = await params;
  return <SectionPlaceholder section="Resolver" slug="resolver" segments={section} />;
}
