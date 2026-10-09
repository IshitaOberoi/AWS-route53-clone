import type { AliasTargetType, FailoverType, RoutingPolicy, ZoneType } from './types';

/** "example.com." → "example.com" (the console never shows the trailing dot for zones). */
export function displayZoneName(fqdn: string): string {
  return fqdn.endsWith('.') && fqdn.length > 1 ? fqdn.slice(0, -1) : fqdn;
}

/** Record names are shown as FQDNs without the trailing dot, like the console. */
export const displayRecordName = displayZoneName;

/** "123456789012" → "1234-5678-9012". */
export function formatAccountId(accountId: string): string {
  return accountId.replace(/^(\d{4})(\d{4})(\d{4})$/, '$1-$2-$3');
}

export function zoneTypeLabel(type: ZoneType): string {
  return type === 'PUBLIC' ? 'Public' : 'Private';
}

export const ROUTING_POLICY_LABELS: Record<RoutingPolicy, string> = {
  SIMPLE: 'Simple',
  WEIGHTED: 'Weighted',
  GEOLOCATION: 'Geolocation',
  LATENCY: 'Latency',
  FAILOVER: 'Failover',
  MULTIVALUE: 'Multivalue answer',
};

export const FAILOVER_LABELS: Record<FailoverType, string> = {
  PRIMARY: 'Primary',
  SECONDARY: 'Secondary',
};

export const ALIAS_TARGET_LABELS: Record<AliasTargetType, string> = {
  RECORD_IN_ZONE: 'Alias to another record in this hosted zone',
  CLOUDFRONT: 'Alias to CloudFront distribution',
  S3_WEBSITE: 'Alias to S3 website endpoint',
  ELB: 'Alias to Application and Classic Load Balancer',
  API_GATEWAY: 'Alias to API Gateway API',
};

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
