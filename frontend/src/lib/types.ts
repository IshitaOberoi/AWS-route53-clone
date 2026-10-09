// Mirrors the backend Pydantic schemas (backend/app/schemas/*). Keep in sync.

export type ZoneType = 'PUBLIC' | 'PRIVATE';

export const RECORD_TYPES = [
  'A',
  'AAAA',
  'CNAME',
  'TXT',
  'MX',
  'NS',
  'PTR',
  'SRV',
  'CAA',
  'SOA',
] as const;
export type RecordType = (typeof RECORD_TYPES)[number];
export type UserRecordType = Exclude<RecordType, 'SOA'>;

export const ROUTING_POLICIES = [
  'SIMPLE',
  'WEIGHTED',
  'GEOLOCATION',
  'LATENCY',
  'FAILOVER',
  'MULTIVALUE',
] as const;
export type RoutingPolicy = (typeof ROUTING_POLICIES)[number];
export type FailoverType = 'PRIMARY' | 'SECONDARY';
export type AliasTargetType =
  | 'RECORD_IN_ZONE'
  | 'CLOUDFRONT'
  | 'S3_WEBSITE'
  | 'ELB'
  | 'API_GATEWAY';

export type SortOrder = 'asc' | 'desc';
export type ZoneSortField = 'name' | 'type' | 'record_count' | 'description' | 'id' | 'created_at';
export type RecordSortField = 'name' | 'type' | 'ttl' | 'routing_policy';

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

// --- auth ------------------------------------------------------------------------------

export interface User {
  id: number;
  username: string;
  display_name: string;
  account_id: string;
}

export interface LoginInput {
  username: string;
  password: string;
}

// --- hosted zones ----------------------------------------------------------------------

export interface Vpc {
  region: string;
  vpc_id: string;
}

export interface Tag {
  key: string;
  value: string;
}

export interface HostedZoneSummary {
  id: string;
  name: string; // FQDN with trailing dot
  type: ZoneType;
  description: string;
  caller_reference: string;
  record_count: number;
  created_at: string;
  updated_at: string;
}

export interface HostedZone extends HostedZoneSummary {
  name_servers: string[];
  vpcs: Vpc[];
  tags: Tag[];
}

export interface HostedZoneCreate {
  name: string;
  description?: string;
  type: ZoneType;
  vpcs?: Vpc[];
  tags?: Tag[];
}

export interface HostedZoneUpdate {
  description?: string;
  vpcs?: Vpc[];
}

export interface ZoneListQuery {
  page?: number;
  page_size?: number;
  sort_by?: ZoneSortField;
  sort_order?: SortOrder;
  search?: string;
  type?: ZoneType;
  name?: string;
  description?: string;
  id?: string;
}

// --- records ---------------------------------------------------------------------------

export interface RecordInput {
  name: string;
  type: RecordType;
  ttl: number | null;
  values: string[];
  routing_policy: RoutingPolicy;
  set_identifier: string;
  weight: number | null;
  region: string | null;
  failover: FailoverType | null;
  geo_location: string | null;
  health_check_id: string | null;
  is_alias: boolean;
  alias_target: string | null;
  alias_target_type: AliasTargetType | null;
  evaluate_target_health: boolean;
}

export interface DnsRecord extends RecordInput {
  id: string;
  zone_id: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface RecordListQuery {
  page?: number;
  page_size?: number;
  sort_by?: RecordSortField;
  sort_order?: SortOrder;
  search?: string;
  type?: RecordType[];
  routing_policy?: RoutingPolicy[];
  alias?: boolean;
  name?: string;
  value?: string;
}

export interface LineIssue {
  line: number;
  message: string;
}

export interface ZoneFileImportResult {
  created: number;
  skipped: LineIssue[];
  errors: LineIssue[];
}

export type ExportFormat = 'json' | 'bind';

// --- meta ------------------------------------------------------------------------------

export interface Region {
  code: string;
  name: string;
}

export interface CatalogVpc {
  vpc_id: string;
  region: string;
  name: string;
  cidr: string;
}

// --- errors ----------------------------------------------------------------------------

export interface ErrorBody {
  code: string;
  message: string;
  field_errors: Record<string, string>;
}
