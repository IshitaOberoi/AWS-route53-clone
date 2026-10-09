// Record form model shared by "Create record" and the split-panel edit form.

import { displayRecordName } from './format';
import type {
  AliasTargetType,
  DnsRecord,
  FailoverType,
  RecordInput,
  RecordType,
  RoutingPolicy,
  UserRecordType,
} from './types';
import { GEO_CONTINENTS, validateRecordName, validateTtl, validateValueLines } from './validation';

export const DEFAULT_TTL = 300;
export const ALIAS_TYPES: RecordType[] = ['A', 'AAAA', 'CNAME'];

export const RECORD_TYPE_OPTIONS: { value: UserRecordType; label: string }[] = [
  { value: 'A', label: 'A – Routes traffic to an IPv4 address and some AWS resources' },
  { value: 'AAAA', label: 'AAAA – Routes traffic to an IPv6 address and some AWS resources' },
  {
    value: 'CNAME',
    label: 'CNAME – Routes traffic to another domain name and to some AWS resources',
  },
  { value: 'MX', label: 'MX – Specifies mail servers' },
  {
    value: 'TXT',
    label: 'TXT – Used to verify email senders and for application-specific values',
  },
  { value: 'PTR', label: 'PTR – Maps an IP address to a domain name' },
  { value: 'SRV', label: 'SRV – Application-specific values that identify servers' },
  { value: 'NS', label: 'NS – Name servers for a hosted zone' },
  {
    value: 'CAA',
    label: 'CAA – Restricts CAs that can create SSL/TLS certificates for the domain',
  },
];

export const SOA_TYPE_OPTION = { value: 'SOA' as const, label: 'SOA – Start of authority record' };

export const VALUE_PLACEHOLDERS: Record<RecordType, string> = {
  A: '192.0.2.235',
  AAAA: '2001:0db8:85a3:0:0:8a2e:0370:7334',
  CNAME: 'www.example.com',
  MX: '10 mailserver.example.com',
  TXT: '"Sample Text Entries"',
  PTR: 'www.example.com',
  SRV: '1 10 5269 xmpp-server.example.com.',
  NS: 'ns-1.awsdns-01.org.',
  CAA: '0 issue "caauthority.com"',
  SOA: 'ns-2048.awsdns-64.net. hostmaster.awsdns.com. 1 1 1 1 60',
};

export const VALUE_DESCRIPTIONS: Partial<Record<RecordType, string>> = {
  A: 'IPv4 address. Enter multiple values on separate lines.',
  AAAA: 'IPv6 address. Enter multiple values on separate lines.',
  CNAME: 'The domain name that you want to resolve to instead of the value in the record name.',
  MX: 'Priority and mail server name. Enter multiple values on separate lines.',
  TXT: 'Text in double quotes. Enter multiple values on separate lines.',
  SRV: 'Priority, weight, port and target. Enter multiple values on separate lines.',
  CAA: 'Flags, tag and value. Enter multiple values on separate lines.',
};

export const TTL_PRESETS = [
  { label: '1m', seconds: 60 },
  { label: '1h', seconds: 3600 },
  { label: '1d', seconds: 86400 },
];

export const ROUTING_POLICY_OPTIONS: { value: RoutingPolicy; label: string }[] = [
  { value: 'SIMPLE', label: 'Simple routing' },
  { value: 'WEIGHTED', label: 'Weighted' },
  { value: 'GEOLOCATION', label: 'Geolocation' },
  { value: 'LATENCY', label: 'Latency' },
  { value: 'FAILOVER', label: 'Failover' },
  { value: 'MULTIVALUE', label: 'Multivalue answer' },
];

export const GEO_LOCATION_OPTIONS: { value: string; label: string }[] = [
  { value: '*', label: 'Default' },
  { value: 'AF', label: 'Africa' },
  { value: 'AN', label: 'Antarctica' },
  { value: 'AS', label: 'Asia' },
  { value: 'EU', label: 'Europe' },
  { value: 'NA', label: 'North America' },
  { value: 'OC', label: 'Oceania' },
  { value: 'SA', label: 'South America' },
  { value: 'AU', label: 'Australia' },
  { value: 'BR', label: 'Brazil' },
  { value: 'CA', label: 'Canada' },
  { value: 'DE', label: 'Germany' },
  { value: 'FR', label: 'France' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'IN', label: 'India' },
  { value: 'JP', label: 'Japan' },
  { value: 'SG', label: 'Singapore' },
  { value: 'US', label: 'United States' },
  { value: 'US-CA', label: 'United States – California' },
  { value: 'US-NY', label: 'United States – New York' },
];

/** Mock endpoints offered by the alias target autosuggest for AWS resource types. */
export const ALIAS_TARGET_SUGGESTIONS: Record<
  Exclude<AliasTargetType, 'RECORD_IN_ZONE'>,
  string[]
> = {
  CLOUDFRONT: ['d111111abcdef8.cloudfront.net', 'd2222222abcdef8.cloudfront.net'],
  S3_WEBSITE: ['s3-website-us-east-1.amazonaws.com', 's3-website.ap-south-1.amazonaws.com'],
  ELB: [
    'dualstack.my-alb-1234567890.us-east-1.elb.amazonaws.com',
    'dualstack.my-clb-987654321.ap-south-1.elb.amazonaws.com',
  ],
  API_GATEWAY: ['d-abcde12345.execute-api.us-east-1.amazonaws.com'],
};

export interface RecordDraft {
  key: string;
  name: string;
  type: RecordType;
  value: string;
  ttl: string;
  isAlias: boolean;
  aliasTargetType: AliasTargetType | null;
  aliasTarget: string;
  evaluateTargetHealth: boolean;
  routingPolicy: RoutingPolicy;
  setIdentifier: string;
  weight: string;
  region: string;
  failover: FailoverType | null;
  geoLocation: string;
  healthCheckId: string;
}

let draftCounter = 0;

export function emptyDraft(): RecordDraft {
  draftCounter += 1;
  return {
    key: `draft-${draftCounter}`,
    name: '',
    type: 'A',
    value: '',
    ttl: String(DEFAULT_TTL),
    isAlias: false,
    aliasTargetType: null,
    aliasTarget: '',
    evaluateTargetHealth: true,
    routingPolicy: 'SIMPLE',
    setIdentifier: '',
    weight: '',
    region: '',
    failover: null,
    geoLocation: '',
    healthCheckId: '',
  };
}

/** "www.example.com." in zone "example.com." → "www"; apex → "". */
export function relativeName(fqdn: string, zoneFqdn: string): string {
  if (fqdn === zoneFqdn) return '';
  const suffix = `.${zoneFqdn}`;
  return fqdn.endsWith(suffix) ? fqdn.slice(0, -suffix.length) : displayRecordName(fqdn);
}

export function recordToDraft(record: DnsRecord, zoneFqdn: string): RecordDraft {
  return {
    ...emptyDraft(),
    name: relativeName(record.name, zoneFqdn),
    type: record.type,
    value: record.values.join('\n'),
    ttl: record.ttl === null ? String(DEFAULT_TTL) : String(record.ttl),
    isAlias: record.is_alias,
    aliasTargetType: record.alias_target_type,
    aliasTarget: record.alias_target ? displayRecordName(record.alias_target) : '',
    evaluateTargetHealth: record.evaluate_target_health,
    routingPolicy: record.routing_policy,
    setIdentifier: record.set_identifier,
    weight: record.weight === null ? '' : String(record.weight),
    region: record.region ?? '',
    failover: record.failover,
    geoLocation: record.geo_location ?? '',
    healthCheckId: record.health_check_id ?? '',
  };
}

export function draftToInput(draft: RecordDraft): RecordInput {
  const alias = draft.isAlias && ALIAS_TYPES.includes(draft.type);
  const simple = draft.routingPolicy === 'SIMPLE';
  return {
    name: draft.name.trim(),
    type: draft.type,
    ttl: alias ? null : Number(draft.ttl),
    values: alias ? [] : draft.value.split('\n'),
    routing_policy: draft.routingPolicy,
    set_identifier: simple ? '' : draft.setIdentifier.trim(),
    weight: draft.routingPolicy === 'WEIGHTED' && draft.weight !== '' ? Number(draft.weight) : null,
    region: draft.routingPolicy === 'LATENCY' ? draft.region || null : null,
    failover: draft.routingPolicy === 'FAILOVER' ? draft.failover : null,
    geo_location: draft.routingPolicy === 'GEOLOCATION' ? draft.geoLocation || null : null,
    health_check_id: simple ? null : draft.healthCheckId.trim() || null,
    is_alias: alias,
    alias_target: alias ? draft.aliasTarget.trim() || null : null,
    alias_target_type: alias ? draft.aliasTargetType : null,
    evaluate_target_health: alias ? draft.evaluateTargetHealth : false,
  };
}

/** Field name (as used by the API: `values`, `ttl`, …) → message. */
export type DraftErrors = Partial<Record<string, string>>;

/** Client-side validation that mirrors backend rules (AGENTS.md §4.2). */
export function validateDraft(draft: RecordDraft, zoneFqdn: string): DraftErrors {
  const errors: DraftErrors = {};
  const nameError = validateRecordName(draft.name, zoneFqdn);
  if (nameError) errors.name = nameError;
  const isApex = draft.name.trim() === '' || draft.name.trim() === '@';
  const alias = draft.isAlias && ALIAS_TYPES.includes(draft.type);

  if (draft.type === 'CNAME' && isApex && !nameError) {
    errors.name = `RRSet of type CNAME with DNS name ${zoneFqdn} is not permitted at apex in zone ${zoneFqdn}`;
  }

  if (alias) {
    if (!draft.aliasTargetType) errors.alias_target_type = 'Choose an endpoint type.';
    if (!draft.aliasTarget.trim()) errors.alias_target = 'Choose the resource to route traffic to.';
    if (draft.routingPolicy === 'MULTIVALUE') {
      errors.routing_policy = 'Multivalue answer routing is not supported for alias records.';
    }
  } else {
    const ttlError = validateTtl(draft.ttl);
    if (ttlError) errors.ttl = ttlError;
    const lines = draft.value.split('\n');
    const nonEmpty = lines.filter((line) => line.trim());
    const problems = validateValueLines(draft.type, lines);
    if (problems.length) errors.values = problems.join('\n');
    else if (nonEmpty.length === 0) errors.values = 'Enter at least one value.';
    else if (draft.type === 'CNAME' && nonEmpty.length > 1) {
      errors.values = 'A CNAME record can have only one value.';
    }
  }

  if (draft.routingPolicy !== 'SIMPLE') {
    if (!draft.setIdentifier.trim()) {
      errors.set_identifier = 'Record ID is required for this routing policy.';
    }
    if (draft.routingPolicy === 'WEIGHTED') {
      const weight = Number(draft.weight);
      if (draft.weight === '' || !Number.isInteger(weight) || weight < 0 || weight > 255) {
        errors.weight = 'Weight is required for weighted routing (0-255).';
      }
    }
    if (draft.routingPolicy === 'LATENCY' && !draft.region) {
      errors.region = 'Region is required for latency routing.';
    }
    if (draft.routingPolicy === 'FAILOVER' && !draft.failover) {
      errors.failover = 'Choose Primary or Secondary.';
    }
    if (draft.routingPolicy === 'GEOLOCATION') {
      const code = draft.geoLocation.trim().toUpperCase();
      if (!code) errors.geo_location = 'Location is required for geolocation routing.';
      else if (
        !(GEO_CONTINENTS.includes(code) || /^(\*|[A-Z]{2}|[A-Z]{2}-[A-Z0-9]{1,3})$/.test(code))
      ) {
        errors.geo_location = 'Enter a continent code (e.g. EU), a country code (e.g. IN) or *.';
      }
    }
  }
  return errors;
}

/**
 * Maps API field errors (`records[1].values[0]`, or `values[0]` for single-record updates) to
 * per-record DraftErrors, turning value indexes into "Line n:" messages.
 */
export function mapApiFieldErrors(
  fieldErrors: Record<string, string>,
  recordCount: number,
  single = false,
): DraftErrors[] {
  const result: DraftErrors[] = Array.from({ length: recordCount }, () => ({}));
  for (const [key, message] of Object.entries(fieldErrors)) {
    const match = single
      ? /^()([a-z_]+)(?:\[(\d+)\])?/.exec(key)
      : /^records\[(\d+)\]\.([a-z_]+)(?:\[(\d+)\])?/.exec(key);
    if (!match) continue;
    const index = single ? 0 : Number(match[1]);
    const field = match[2] ?? '';
    const target = result[index];
    if (!target) continue;
    const text = match[3] !== undefined ? `Line ${Number(match[3]) + 1}: ${message}` : message;
    target[field] = target[field] ? `${target[field]}\n${text}` : text;
  }
  return result;
}
