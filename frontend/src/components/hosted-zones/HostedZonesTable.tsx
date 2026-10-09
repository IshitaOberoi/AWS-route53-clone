'use client';

import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import CollectionPreferences from '@cloudscape-design/components/collection-preferences';
import Header from '@cloudscape-design/components/header';
import Link from '@cloudscape-design/components/link';
import Pagination from '@cloudscape-design/components/pagination';
import PropertyFilter from '@cloudscape-design/components/property-filter';
import type { PropertyFilterProps } from '@cloudscape-design/components/property-filter';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import type { TableProps } from '@cloudscape-design/components/table';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { selectionLabels } from '@/components/common/table-config';
import DeleteZoneModal from '@/components/hosted-zones/DeleteZoneModal';
import InfoLink from '@/components/shell/InfoLink';
import { BASE } from '@/components/shell/Navigation';
import { usePageActions } from '@/context/ShellContext';
import { useApi } from '@/hooks/useApi';
import { useFlash } from '@/hooks/useFlash';
import { useFollow } from '@/hooks/useFollow';
import {
  fromCollectionPreferences,
  PAGE_SIZES,
  toCollectionPreferences,
  usePreferences,
} from '@/hooks/usePreferences';
import type { TablePreferences } from '@/hooks/usePreferences';
import { intParam, useUrlQuery } from '@/hooks/useUrlQuery';
import { listHostedZones } from '@/lib/api';
import { displayZoneName, zoneTypeLabel } from '@/lib/format';
import type { HostedZoneSummary, ZoneListQuery, ZoneSortField, ZoneType } from '@/lib/types';

const COLUMN_SORT_FIELDS: Record<string, ZoneSortField> = {
  name: 'name',
  type: 'type',
  recordCount: 'record_count',
  id: 'id',
};

const DEFAULT_PREFERENCES: TablePreferences = {
  pageSize: 10,
  wrapLines: false,
  stripedRows: false,
  contentDensity: 'comfortable',
  contentDisplay: [
    { id: 'name', visible: true },
    { id: 'type', visible: true },
    { id: 'createdBy', visible: true },
    { id: 'recordCount', visible: true },
    { id: 'description', visible: true },
    { id: 'id', visible: true },
  ],
};

const FILTER_KEYS = ['name', 'type', 'description', 'id'] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

const FILTERING_PROPERTIES: PropertyFilterProps.FilteringProperty[] = [
  {
    key: 'name',
    propertyLabel: 'Hosted zone name',
    groupValuesLabel: 'Hosted zone name values',
    operators: [':'],
  },
  { key: 'type', propertyLabel: 'Type', groupValuesLabel: 'Type values', operators: ['='] },
  {
    key: 'description',
    propertyLabel: 'Description',
    groupValuesLabel: 'Description values',
    operators: [':'],
  },
  {
    key: 'id',
    propertyLabel: 'Hosted zone ID',
    groupValuesLabel: 'Hosted zone ID values',
    operators: [':'],
  },
];

const FILTERING_OPTIONS: PropertyFilterProps.FilteringOption[] = [
  { propertyKey: 'type', value: 'Public' },
  { propertyKey: 'type', value: 'Private' },
];

function typeFromLabel(label: string): ZoneType | undefined {
  const value = label.trim().toLowerCase();
  if (value === 'public') return 'PUBLIC';
  if (value === 'private') return 'PRIVATE';
  return undefined;
}

export default function HostedZonesTable() {
  const router = useRouter();
  const follow = useFollow();
  const flash = useFlash();
  const { params, update } = useUrlQuery();
  const [preferences, setPreferences] = usePreferences(
    'r53.hostedZones.preferences',
    DEFAULT_PREFERENCES,
  );
  const [selected, setSelected] = useState<HostedZoneSummary[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const filterRef = useRef<PropertyFilterProps.Ref>(null);

  usePageActions({
    create: () => router.push(`${BASE}/hostedzones/create`),
    focusFilter: () => filterRef.current?.focus(),
  });

  // --- URL → query ---------------------------------------------------------------------
  const page = intParam(params.get('page'), 1);
  const sortField = (params.get('sort') ?? 'name') as ZoneSortField;
  const descending = params.get('order') === 'desc';
  const search = params.get('q') ?? '';
  const filters: Record<FilterKey, string> = {
    name: params.get('name') ?? '',
    type: params.get('type') ?? '',
    description: params.get('description') ?? '',
    id: params.get('id') ?? '',
  };

  const query: ZoneListQuery = {
    page,
    page_size: preferences.pageSize,
    sort_by: Object.values(COLUMN_SORT_FIELDS).includes(sortField) ? sortField : 'name',
    sort_order: descending ? 'desc' : 'asc',
    search: search || undefined,
    name: filters.name || undefined,
    type: typeFromLabel(filters.type),
    description: filters.description || undefined,
    id: filters.id || undefined,
  };
  const queryKey = JSON.stringify(query);
  const { data, loading, error, reload } = useApi(
    (signal) => listHostedZones(query, signal),
    queryKey,
  );

  useEffect(() => {
    if (error) flash.error(error, 'Failed to load hosted zones');
  }, [error, flash]);

  // Keep the selection only if the selected zone is still on the current page.
  useEffect(() => {
    if (!data) return;
    setSelected((current) =>
      current.filter((zone) => data.items.some((item) => item.id === zone.id)),
    );
  }, [data]);

  const filterQuery: PropertyFilterProps.Query = useMemo(() => {
    const tokens: PropertyFilterProps.Token[] = [];
    for (const key of FILTER_KEYS) {
      if (filters[key]) {
        tokens.push({
          propertyKey: key,
          operator: key === 'type' ? '=' : ':',
          value: filters[key],
        });
      }
    }
    if (search) tokens.push({ operator: ':', value: search });
    return { tokens, operation: 'and' };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- derived from the URL string
  }, [params]);

  const onFilterChange = (next: PropertyFilterProps.Query) => {
    const patch: Record<string, string | null> = { q: null, page: null };
    FILTER_KEYS.forEach((key) => (patch[key] = null));
    const freeText: string[] = [];
    for (const token of next.tokens) {
      const value = (token.value as string | undefined)?.toString().trim() ?? '';
      if (!value) continue;
      if (token.propertyKey && (FILTER_KEYS as readonly string[]).includes(token.propertyKey)) {
        patch[token.propertyKey] = value;
      } else {
        freeText.push(value);
      }
    }
    patch.q = freeText.join(' ') || null;
    update(patch);
  };

  const filtered = Boolean(search || Object.values(filters).some(Boolean));
  const total = data?.total ?? 0;
  const pagesCount = Math.max(1, Math.ceil(total / preferences.pageSize));
  const selectedZone = selected[0];

  // If the current page is past the end (e.g. after deleting), go to the last page.
  useEffect(() => {
    if (data && page > pagesCount)
      update({ page: pagesCount > 1 ? pagesCount : null }, { replace: true });
  }, [data, page, pagesCount, update]);

  const columns: TableProps.ColumnDefinition<HostedZoneSummary>[] = [
    {
      id: 'name',
      header: 'Hosted zone name',
      cell: (zone) => (
        <Link href={`${BASE}/hostedzones/${zone.id}`} onFollow={follow}>
          {displayZoneName(zone.name)}
        </Link>
      ),
      sortingField: 'name',
      isRowHeader: true,
    },
    { id: 'type', header: 'Type', cell: (zone) => zoneTypeLabel(zone.type), sortingField: 'type' },
    { id: 'createdBy', header: 'Created by', cell: () => 'Route 53' },
    {
      id: 'recordCount',
      header: 'Record count',
      cell: (zone) => zone.record_count,
      sortingField: 'recordCount',
    },
    { id: 'description', header: 'Description', cell: (zone) => zone.description || '-' },
    { id: 'id', header: 'Hosted zone ID', cell: (zone) => zone.id, sortingField: 'id' },
  ];
  const sortingColumn =
    columns.find((column) => COLUMN_SORT_FIELDS[column.sortingField ?? ''] === sortField) ??
    columns[0];

  const emptyState = (
    <Box textAlign="center" color="inherit" margin={{ vertical: 'xs' }}>
      <SpaceBetween size="xxs">
        <Box variant="strong" color="inherit">
          No hosted zones
        </Box>
        <Box variant="p" color="inherit">
          You don&apos;t have any hosted zones.
        </Box>
      </SpaceBetween>
      <Box margin={{ top: 's' }}>
        <Button onClick={() => router.push(`${BASE}/hostedzones/create`)}>
          Create hosted zone
        </Button>
      </Box>
    </Box>
  );
  const noMatchState = (
    <Box textAlign="center" color="inherit" margin={{ vertical: 'xs' }}>
      <SpaceBetween size="xxs">
        <Box variant="strong" color="inherit">
          No matches
        </Box>
        <Box variant="p" color="inherit">
          We can&apos;t find a match.
        </Box>
      </SpaceBetween>
      <Box margin={{ top: 's' }}>
        <Button onClick={() => onFilterChange({ tokens: [], operation: 'and' })}>
          Clear filter
        </Button>
      </Box>
    </Box>
  );

  return (
    <>
      <Table<HostedZoneSummary>
        variant="full-page"
        stickyHeader
        resizableColumns
        enableKeyboardNavigation
        items={data?.items ?? []}
        trackBy="id"
        loading={loading && !data}
        loadingText="Loading hosted zones"
        columnDefinitions={columns}
        columnDisplay={preferences.contentDisplay}
        wrapLines={preferences.wrapLines}
        stripedRows={preferences.stripedRows}
        contentDensity={preferences.contentDensity}
        selectionType="single"
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        ariaLabels={selectionLabels<HostedZoneSummary>('Hosted zones', (zone) =>
          displayZoneName(zone.name),
        )}
        sortingColumn={sortingColumn}
        sortingDescending={descending}
        onSortingChange={({ detail }) => {
          const field = COLUMN_SORT_FIELDS[detail.sortingColumn.sortingField ?? 'name'] ?? 'name';
          update({
            sort: field === 'name' ? null : field,
            order: detail.isDescending ? 'desc' : null,
            page: null,
          });
        }}
        empty={filtered ? noMatchState : emptyState}
        header={
          <Header
            variant="awsui-h1-sticky"
            counter={data ? `(${total})` : undefined}
            info={<InfoLink topic="hosted-zones" />}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button
                  iconName="refresh"
                  ariaLabel="Refresh hosted zones"
                  loading={loading && Boolean(data)}
                  onClick={reload}
                  data-testid="refresh-hosted-zones"
                />
                <Button
                  disabled={!selectedZone}
                  onClick={() =>
                    selectedZone && router.push(`${BASE}/hostedzones/${selectedZone.id}`)
                  }
                >
                  View details
                </Button>
                <Button
                  disabled={!selectedZone}
                  onClick={() =>
                    selectedZone && router.push(`${BASE}/hostedzones/${selectedZone.id}/edit`)
                  }
                >
                  Edit
                </Button>
                <Button disabled={!selectedZone} onClick={() => setDeleteOpen(true)}>
                  Delete
                </Button>
                <Button
                  variant="primary"
                  data-testid="create-hosted-zone"
                  onClick={() => router.push(`${BASE}/hostedzones/create`)}
                >
                  Create hosted zone
                </Button>
              </SpaceBetween>
            }
          >
            Hosted zones
          </Header>
        }
        filter={
          <PropertyFilter
            ref={filterRef}
            query={filterQuery}
            onChange={({ detail }) => onFilterChange(detail)}
            filteringProperties={FILTERING_PROPERTIES}
            filteringOptions={FILTERING_OPTIONS}
            filteringPlaceholder="Filter hosted zones by property or value"
            filteringAriaLabel="Filter hosted zones"
            countText={
              filtered && data ? `${total} ${total === 1 ? 'match' : 'matches'}` : undefined
            }
            hideOperations
            expandToViewport
            data-testid="zones-filter"
          />
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
              options: PAGE_SIZES.map((size) => ({ value: size, label: `${size} hosted zones` })),
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
      <DeleteZoneModal
        zone={selectedZone ?? null}
        visible={deleteOpen}
        onDismiss={() => setDeleteOpen(false)}
        onDeleted={() => {
          setDeleteOpen(false);
          setSelected([]);
          reload();
        }}
      />
    </>
  );
}
