'use client';

import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import CollectionPreferences from '@cloudscape-design/components/collection-preferences';
import Header from '@cloudscape-design/components/header';
import Multiselect from '@cloudscape-design/components/multiselect';
import Pagination from '@cloudscape-design/components/pagination';
import PropertyFilter from '@cloudscape-design/components/property-filter';
import type { PropertyFilterProps } from '@cloudscape-design/components/property-filter';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import type { TableProps } from '@cloudscape-design/components/table';
import type { ReactNode } from 'react';
import { useEffect, useMemo } from 'react';

import { selectionLabels } from '@/components/common/table-config';
import InfoLink from '@/components/shell/InfoLink';
import { useApi } from '@/hooks/useApi';
import { useFlash } from '@/hooks/useFlash';
import {
  fromCollectionPreferences,
  PAGE_SIZES,
  toCollectionPreferences,
  usePreferences,
} from '@/hooks/usePreferences';
import type { TablePreferences } from '@/hooks/usePreferences';
import { intParam, useUrlQuery } from '@/hooks/useUrlQuery';
import { listRecords } from '@/lib/api';
import { displayRecordName, ROUTING_POLICY_LABELS } from '@/lib/format';
import { RECORD_TYPES, ROUTING_POLICIES } from '@/lib/types';
import type {
  DnsRecord,
  HostedZone,
  RecordListQuery,
  RecordSortField,
  RecordType,
  RoutingPolicy,
} from '@/lib/types';

const SORT_FIELDS: RecordSortField[] = ['name', 'type', 'ttl', 'routing_policy'];

const DEFAULT_PREFERENCES: TablePreferences = {
  pageSize: 10,
  wrapLines: true,
  stripedRows: false,
  contentDensity: 'comfortable',
  contentDisplay: [
    { id: 'name', visible: true },
    { id: 'type', visible: true },
    { id: 'routingPolicy', visible: true },
    { id: 'differentiator', visible: true },
    { id: 'alias', visible: true },
    { id: 'value', visible: true },
    { id: 'ttl', visible: true },
    { id: 'healthCheckId', visible: true },
    { id: 'evaluateTargetHealth', visible: true },
    { id: 'recordId', visible: false },
  ],
};

const FILTERING_PROPERTIES: PropertyFilterProps.FilteringProperty[] = [
  {
    key: 'name',
    propertyLabel: 'Record name',
    groupValuesLabel: 'Record name values',
    operators: [':'],
  },
  { key: 'type', propertyLabel: 'Type', groupValuesLabel: 'Type values', operators: ['='] },
  {
    key: 'policy',
    propertyLabel: 'Routing policy',
    groupValuesLabel: 'Routing policy values',
    operators: ['='],
  },
  { key: 'alias', propertyLabel: 'Alias', groupValuesLabel: 'Alias values', operators: ['='] },
  { key: 'value', propertyLabel: 'Value', groupValuesLabel: 'Value values', operators: [':'] },
];

const FILTERING_OPTIONS: PropertyFilterProps.FilteringOption[] = [
  ...RECORD_TYPES.map((type) => ({ propertyKey: 'type', value: type })),
  ...ROUTING_POLICIES.map((policy) => ({
    propertyKey: 'policy',
    value: ROUTING_POLICY_LABELS[policy],
  })),
  { propertyKey: 'alias', value: 'Yes' },
  { propertyKey: 'alias', value: 'No' },
];

function policyFromLabel(label: string): RoutingPolicy | undefined {
  return ROUTING_POLICIES.find(
    (policy) =>
      ROUTING_POLICY_LABELS[policy].toLowerCase() === label.toLowerCase() ||
      policy === label.toUpperCase(),
  );
}

export function evaluateTargetHealthLabel(record: DnsRecord): string {
  if (!record.is_alias) return '-';
  return record.evaluate_target_health ? 'Yes' : 'No';
}

export function recordValueLines(record: DnsRecord): string[] {
  if (record.is_alias) return record.alias_target ? [record.alias_target] : [];
  return record.values;
}

interface RecordsTableProps {
  zone: HostedZone;
  selected: DnsRecord[];
  onSelectionChange: (records: DnsRecord[]) => void;
  onCreate: () => void;
  onDelete: () => void;
  /** Extra header actions (import / export) rendered before "Create record". */
  extraActions?: ReactNode;
  /** Change to force a reload (after create/edit/delete elsewhere on the page). */
  refreshToken: number;
  /** Refresh button: reloads the records (and the zone's record count). */
  onRefresh: () => void;
  filterRef?: React.Ref<PropertyFilterProps.Ref>;
}

export default function RecordsTable({
  zone,
  selected,
  onSelectionChange,
  onCreate,
  onDelete,
  extraActions,
  refreshToken,
  onRefresh,
  filterRef,
}: RecordsTableProps) {
  const flash = useFlash();
  const { params, update } = useUrlQuery();
  const [preferences, setPreferences] = usePreferences(
    'r53.records.preferences',
    DEFAULT_PREFERENCES,
  );

  const page = intParam(params.get('page'), 1);
  const sortParam = params.get('sort') as RecordSortField | null;
  const sortField = sortParam && SORT_FIELDS.includes(sortParam) ? sortParam : null;
  const descending = params.get('order') === 'desc';
  const search = params.get('q') ?? '';
  const types = params
    .getAll('type')
    .filter((type): type is RecordType => (RECORD_TYPES as readonly string[]).includes(type));
  const policyLabel = params.get('policy') ?? '';
  const aliasParam = params.get('alias') ?? '';
  const nameFilter = params.get('name') ?? '';
  const valueFilter = params.get('value') ?? '';
  const policy = policyLabel ? policyFromLabel(policyLabel) : undefined;
  const alias =
    aliasParam.toLowerCase() === 'yes'
      ? true
      : aliasParam.toLowerCase() === 'no'
        ? false
        : undefined;

  const query: RecordListQuery = {
    page,
    page_size: preferences.pageSize,
    sort_by: sortField ?? undefined,
    sort_order: sortField && descending ? 'desc' : sortField ? 'asc' : undefined,
    search: search || undefined,
    type: types.length ? types : undefined,
    routing_policy: policy ? [policy] : undefined,
    alias,
    name: nameFilter || undefined,
    value: valueFilter || undefined,
  };
  const { data, loading, error } = useApi(
    (signal) => listRecords(zone.id, query, signal),
    `${zone.id}:${JSON.stringify(query)}:${refreshToken}`,
  );

  useEffect(() => {
    if (error) flash.error(error, 'Failed to load records');
  }, [error, flash]);

  // Drop selected records that are no longer visible (deleted, filtered out, other page).
  useEffect(() => {
    if (!data) return;
    const visible = new Map(data.items.map((record) => [record.id, record]));
    const next = selected.flatMap((record) => {
      const fresh = visible.get(record.id);
      return fresh ? [fresh] : [];
    });
    if (next.length !== selected.length || next.some((record, i) => record !== selected[i])) {
      onSelectionChange(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when new data arrives
  }, [data]);

  const filtered = Boolean(
    search || types.length || policyLabel || aliasParam || nameFilter || valueFilter,
  );
  const total = data?.total ?? 0;
  const pagesCount = Math.max(1, Math.ceil(total / preferences.pageSize));

  useEffect(() => {
    if (data && page > pagesCount)
      update({ page: pagesCount > 1 ? pagesCount : null }, { replace: true });
  }, [data, page, pagesCount, update]);

  const filterQuery: PropertyFilterProps.Query = useMemo(() => {
    const tokens: PropertyFilterProps.Token[] = [];
    if (nameFilter) tokens.push({ propertyKey: 'name', operator: ':', value: nameFilter });
    types.forEach((type) => tokens.push({ propertyKey: 'type', operator: '=', value: type }));
    if (policyLabel) tokens.push({ propertyKey: 'policy', operator: '=', value: policyLabel });
    if (aliasParam) tokens.push({ propertyKey: 'alias', operator: '=', value: aliasParam });
    if (valueFilter) tokens.push({ propertyKey: 'value', operator: ':', value: valueFilter });
    if (search) tokens.push({ operator: ':', value: search });
    return { tokens, operation: 'and' };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- derived from the URL string
  }, [params]);

  const onFilterChange = (next: PropertyFilterProps.Query) => {
    const patch: Record<string, string | string[] | null> = {
      page: null,
      q: null,
      type: null,
      policy: null,
      alias: null,
      name: null,
      value: null,
    };
    const freeText: string[] = [];
    const nextTypes: string[] = [];
    for (const token of next.tokens) {
      const value = String(token.value ?? '').trim();
      if (!value) continue;
      switch (token.propertyKey) {
        case 'type':
          if ((RECORD_TYPES as readonly string[]).includes(value.toUpperCase())) {
            nextTypes.push(value.toUpperCase());
          }
          break;
        case 'policy':
        case 'alias':
        case 'name':
        case 'value':
          patch[token.propertyKey] = value;
          break;
        default:
          freeText.push(value);
      }
    }
    patch.type = nextTypes.length ? Array.from(new Set(nextTypes)) : null;
    patch.q = freeText.join(' ') || null;
    update(patch);
  };

  const columns: TableProps.ColumnDefinition<DnsRecord>[] = [
    {
      id: 'name',
      width: 220,
      header: 'Record name',
      cell: (record) => displayRecordName(record.name),
      sortingField: 'name',
      isRowHeader: true,
    },
    { id: 'type', header: 'Type', width: 90, cell: (record) => record.type, sortingField: 'type' },
    {
      id: 'routingPolicy',
      width: 140,
      header: 'Routing policy',
      cell: (record) => ROUTING_POLICY_LABELS[record.routing_policy],
      sortingField: 'routing_policy',
    },
    {
      id: 'differentiator',
      width: 140,
      header: 'Differentiator',
      cell: (record) => record.set_identifier || '-',
    },
    { id: 'alias', header: 'Alias', width: 90, cell: (record) => (record.is_alias ? 'Yes' : 'No') },
    {
      id: 'value',
      header: 'Value/Route traffic to',
      cell: (record) => (
        <div data-testid="record-value">
          {recordValueLines(record).map((line, index) => (
            <div key={`${index}-${line}`}>{line}</div>
          ))}
        </div>
      ),
      width: 320,
      minWidth: 200,
    },
    {
      id: 'ttl',
      width: 130,
      header: 'TTL (seconds)',
      cell: (record) => (record.ttl === null ? '-' : record.ttl),
      sortingField: 'ttl',
    },
    {
      id: 'healthCheckId',
      width: 150,
      header: 'Health check ID',
      cell: (record) => record.health_check_id || '-',
    },
    {
      id: 'evaluateTargetHealth',
      width: 190,
      header: 'Evaluate target health',
      cell: (record) => evaluateTargetHealthLabel(record),
    },
    { id: 'recordId', width: 300, header: 'Record ID', cell: (record) => record.id },
  ];
  const sortingColumn = columns.find((column) => column.sortingField === (sortField ?? 'name'));
  const deletable = selected.filter((record) => !record.is_default);

  const counter = data
    ? selected.length > 0
      ? `(${selected.length} selected)`
      : `(${total})`
    : undefined;

  return (
    <Table<DnsRecord>
      variant="container"
      resizableColumns
      enableKeyboardNavigation
      items={data?.items ?? []}
      trackBy="id"
      loading={loading && !data}
      loadingText="Loading records"
      columnDefinitions={columns}
      columnDisplay={preferences.contentDisplay}
      wrapLines={preferences.wrapLines}
      stripedRows={preferences.stripedRows}
      contentDensity={preferences.contentDensity}
      selectionType="multi"
      selectedItems={selected}
      isItemDisabled={(record) => record.is_default}
      onSelectionChange={({ detail }) => onSelectionChange(detail.selectedItems)}
      ariaLabels={selectionLabels<DnsRecord>(
        'Records',
        (record) => `${displayRecordName(record.name)} ${record.type}`,
      )}
      sortingColumn={sortingColumn}
      sortingDescending={Boolean(sortField) && descending}
      onSortingChange={({ detail }) => {
        const field = (detail.sortingColumn.sortingField ?? 'name') as RecordSortField;
        const isDefault = field === 'name' && !detail.isDescending;
        update({
          sort: isDefault ? null : field,
          order: detail.isDescending ? 'desc' : null,
          page: null,
        });
      }}
      empty={
        filtered ? (
          <Box textAlign="center" color="inherit" margin={{ vertical: 'xs' }}>
            <Box variant="strong" color="inherit">
              No matches
            </Box>
            <Box variant="p" color="inherit">
              We can&apos;t find a match.
            </Box>
            <Box margin={{ top: 's' }}>
              <Button onClick={() => onFilterChange({ tokens: [], operation: 'and' })}>
                Clear filter
              </Button>
            </Box>
          </Box>
        ) : (
          <Box textAlign="center" color="inherit" margin={{ vertical: 'xs' }}>
            <Box variant="strong" color="inherit">
              No records
            </Box>
            <Box variant="p" color="inherit">
              This hosted zone doesn&apos;t have any records.
            </Box>
            <Box margin={{ top: 's' }}>
              <Button onClick={onCreate}>Create record</Button>
            </Box>
          </Box>
        )
      }
      header={
        <Header
          variant="h2"
          counter={counter}
          info={<InfoLink topic="records" />}
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button
                iconName="refresh"
                ariaLabel="Refresh records"
                loading={loading && Boolean(data)}
                onClick={onRefresh}
                data-testid="refresh-records"
              />
              <Button
                disabled={deletable.length === 0}
                onClick={onDelete}
                data-testid="delete-records"
              >
                Delete record
              </Button>
              {extraActions}
              <Button variant="primary" onClick={onCreate} data-testid="create-record">
                Create record
              </Button>
            </SpaceBetween>
          }
        >
          Records
        </Header>
      }
      filter={
        <SpaceBetween direction="horizontal" size="xs" alignItems="center">
          <div style={{ minWidth: 280, flexGrow: 1 }}>
            <PropertyFilter
              ref={filterRef}
              query={filterQuery}
              onChange={({ detail }) => onFilterChange(detail)}
              filteringProperties={FILTERING_PROPERTIES}
              filteringOptions={FILTERING_OPTIONS}
              filteringPlaceholder="Filter records by property or value"
              filteringAriaLabel="Filter records"
              countText={
                filtered && data ? `${total} ${total === 1 ? 'match' : 'matches'}` : undefined
              }
              hideOperations
              expandToViewport
            />
          </div>
          <div style={{ minWidth: 200 }}>
            <Multiselect
              selectedOptions={types.map((type) => ({ value: type, label: type }))}
              onChange={({ detail }) =>
                update({
                  type: detail.selectedOptions.map((item) => item.value ?? '').filter(Boolean),
                  page: null,
                })
              }
              options={RECORD_TYPES.map((type) => ({ value: type, label: type }))}
              placeholder="Type"
              hideTokens
              inlineTokens
              ariaLabel="Filter by record type"
              data-testid="record-type-filter"
            />
          </div>
        </SpaceBetween>
      }
      pagination={
        <Pagination
          currentPageIndex={Math.min(page, pagesCount)}
          pagesCount={pagesCount}
          disabled={loading && !data}
          onChange={({ detail }) =>
            update({ page: detail.currentPageIndex > 1 ? detail.currentPageIndex : null })
          }
        />
      }
      preferences={
        <CollectionPreferences
          title="Preferences"
          confirmLabel="Confirm"
          cancelLabel="Cancel"
          preferences={toCollectionPreferences(preferences)}
          onConfirm={({ detail }) => {
            const next = fromCollectionPreferences(detail, preferences);
            setPreferences(next);
            if (next.pageSize !== preferences.pageSize) update({ page: null });
          }}
          pageSizePreference={{
            title: 'Page size',
            options: PAGE_SIZES.map((size) => ({ value: size, label: `${size} records` })),
          }}
          wrapLinesPreference={{
            label: 'Wrap lines',
            description: 'Select to see all the text and wrap the lines',
          }}
          stripedRowsPreference={{
            label: 'Striped rows',
            description: 'Select to add alternating shaded rows',
          }}
          contentDensityPreference={{
            label: 'Compact mode',
            description: 'Select to display content in a denser, more compact mode',
          }}
          contentDisplayPreference={{
            title: 'Column preferences',
            description: 'Customize the columns visibility and order.',
            options: columns.map((column) => ({
              id: column.id ?? '',
              label: String(column.header),
              alwaysVisible: column.id === 'name',
            })),
          }}
        />
      }
    />
  );
}
