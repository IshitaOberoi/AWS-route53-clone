import SectionPlaceholder from '@/components/common/SectionPlaceholder';

export default async function DnsFirewallPage({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const { section = [] } = await params;
  return <SectionPlaceholder section="DNS Firewall" slug="dnsfirewall" segments={section} />;
}
