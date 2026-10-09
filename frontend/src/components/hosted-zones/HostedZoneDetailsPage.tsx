'use client';

import type { AppLayoutProps } from '@cloudscape-design/components/app-layout';
import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import ContentLayout from '@cloudscape-design/components/content-layout';
import CopyToClipboard from '@cloudscape-design/components/copy-to-clipboard';
import ExpandableSection from '@cloudscape-design/components/expandable-section';
import Header from '@cloudscape-design/components/header';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import type { PropertyFilterProps } from '@cloudscape-design/components/property-filter';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import Tabs from '@cloudscape-design/components/tabs';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';

import DeleteZoneModal from '@/components/hosted-zones/DeleteZoneModal';
import ZoneTagsTab from '@/components/hosted-zones/ZoneTagsTab';
import DeleteRecordsModal from '@/components/records/DeleteRecordsModal';
import RecordDetailsPanel from '@/components/records/RecordDetailsPanel';
import RecordsTable from '@/components/records/RecordsTable';
import ZoneFileActions from '@/components/records/ZoneFileActions';
import ConsoleLayout from '@/components/shell/ConsoleLayout';
import InfoLink from '@/components/shell/InfoLink';
import { BASE } from '@/components/shell/Navigation';
import { usePageActions } from '@/context/ShellContext';
import { useApi } from '@/hooks/useApi';
import { errorMessage } from '@/hooks/useFlash';
import { useHostedZone } from '@/hooks/useHostedZone';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { listRecords, listRegions } from '@/lib/api';
import { displayZoneName, zoneTypeLabel } from '@/lib/format';
import type { DnsRecord, HostedZone } from '@/lib/types';

function DetailsSection({ zone, onEdit }: { zone: HostedZone; onEdit: () => void }) {
  // Collapsed by default, like the console; the choice is remembered.
  const [expanded, setExpanded] = useLocalStorage('r53.zoneDetailsExpanded', false);
  return (
    <ExpandableSection
      variant="container"
      expanded={expanded}
      onChange={({ detail }) => setExpanded(detail.expanded)}
      headerText="Hosted zone details"
      headerActions={<Button onClick={onEdit}>Edit hosted zone</Button>}
    >
      <KeyValuePairs
        columns={3}
        items={[
          { label: 'Hosted zone name', value: displayZoneName(zone.name) },
          {
            label: 'Hosted zone ID',
            value: (
              <CopyToClipboard
                variant="inline"
                textToCopy={zone.id}
                copyButtonAriaLabel="Copy hosted zone ID"
                copySuccessText="Hosted zone ID copied"
                copyErrorText="Hosted zone ID failed to copy"
              />
            ),
          },
          { label: 'Description', value: zone.description || '-' },
          { label: 'Type', value: `${zoneTypeLabel(zone.type)} hosted zone` },
          { label: 'Record count', value: String(zone.record_count) },
          { label: 'Query log', value: '-' },
          {
            label: 'Name servers',
            value: (
              <div data-testid="name-servers">
                {zone.name_servers.map((server) => (
                  <div key={server}>
                    <CopyToClipboard
                      variant="inline"
                      textToCopy={server}
                      copyButtonAriaLabel={`Copy ${server}`}
                      copySuccessText="Name server copied"
                      copyErrorText="Name server failed to copy"
                    />
                  </div>
                ))}
              </div>
            ),
          },
          { label: 'Created by', value: 'Route 53' },
          ...(zone.type === 'PRIVATE'
            ? [
                {
                  label: 'VPCs',
                  value: (
                    <div>
                      {zone.vpcs.map((vpc) => (
                        <div key={`${vpc.region}:${vpc.vpc_id}`}>
                          {vpc.vpc_id} ({vpc.region})
                        </div>
                      ))}
                    </div>
                  ),
                },
              ]
            : []),
        ]}
      />
    </ExpandableSection>
  );
}

export default function HostedZoneDetailsPage() {
  const router = useRouter();
  const { zoneId, data: zone, error, loading, reload: reloadZone } = useHostedZone();
  const regions = useApi((signal) => listRegions(signal), 'regions');
  const [refreshToken, setRefreshToken] = useState(0);
  const recordNames = useApi(
    (signal) => listRecords(zoneId, { page_size: 100 }, signal),
    `record-names:${zoneId}:${refreshToken}`,
  );

  const [selected, setSelected] = useState<DnsRecord[]>([]);
  const [editing, setEditing] = useState(false);
  const [splitPanelOpen, setSplitPanelOpen] = useState(true);
  const [splitPrefs, setSplitPrefs] = useLocalStorage<AppLayoutProps.SplitPanelPreferences>(
    'r53.splitPanel',
    { position: 'bottom' },
  );
  const [deleteZoneOpen, setDeleteZoneOpen] = useState(false);
  const [deleteRecordsOpen, setDeleteRecordsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('records');
  const filterRef = useRef<PropertyFilterProps.Ref>(null);

  const detailsHref = `${BASE}/hostedzones/${zoneId}`;
  const name = zone ? displayZoneName(zone.name) : zoneId;

  usePageActions({
    create: () => router.push(`${detailsHref}/records/create`),
    focusFilter: () => {
      setActiveTab('records');
      filterRef.current?.focus();
    },
    deleteSelection: () => {
      if (activeTab === 'records' && selected.some((record) => !record.is_default)) {
        setDeleteRecordsOpen(true);
      }
    },
    escape: () => {
      if (editing) setEditing(false);
      else if (selected.length > 0) setSelected([]);
    },
  });

  const refresh = () => {
    setRefreshToken((value) => value + 1);
    reloadZone();
  };

  const onSelectionChange = (records: DnsRecord[]) => {
    setSelected(records);
    setEditing(false);
    if (records.length === 1) setSplitPanelOpen(true);
  };

  const singleSelected = selected.length === 1 ? selected[0] : undefined;
  const showSplitPanel = Boolean(zone) && activeTab === 'records' && selected.length > 0;

  let content: ReactNode;
  if (!zone) {
    content =
      error && !loading ? (
        <Alert type="error" header="Unable to load hosted zone">
          {errorMessage(error)}
        </Alert>
      ) : (
        <Box textAlign="center" padding="xxl">
          <Spinner size="large" />
        </Box>
      );
  } else {
    content = (
      <SpaceBetween size="l">
        <DetailsSection zone={zone} onEdit={() => router.push(`${detailsHref}/edit`)} />
        <Tabs
          activeTabId={activeTab}
          onChange={({ detail }) => setActiveTab(detail.activeTabId)}
          ariaLabel="Hosted zone"
          tabs={[
            {
              id: 'records',
              label: `Records (${zone.record_count})`,
              content: (
                <RecordsTable
                  zone={zone}
                  selected={selected}
                  onSelectionChange={onSelectionChange}
                  onCreate={() => router.push(`${detailsHref}/records/create`)}
                  onDelete={() => setDeleteRecordsOpen(true)}
                  refreshToken={refreshToken}
                  onRefresh={refresh}
                  filterRef={filterRef}
                  extraActions={<ZoneFileActions zone={zone} onImported={refresh} />}
                />
              ),
            },
            {
              id: 'dnssec',
              label: 'DNSSEC signing',
              content: (
                <Box textAlign="center" color="text-body-secondary" padding="xxl">
                  <Box variant="h3" color="inherit">
                    Coming soon
                  </Box>
                  <Box variant="p" color="inherit">
                    DNSSEC signing isn&apos;t available in this Route 53 clone.
                  </Box>
                </Box>
              ),
            },
            {
              id: 'tags',
              label: `Hosted zone tags (${zone.tags.length})`,
              content: <ZoneTagsTab zone={zone} onChanged={reloadZone} />,
            },
          ]}
        />
      </SpaceBetween>
    );
  }

  return (
    <ConsoleLayout
      contentType="default"
      helpTopic="hosted-zone-details"
      breadcrumbs={[
        { text: 'Hosted zones', href: `${BASE}/hostedzones` },
        { text: name, href: detailsHref },
      ]}
      splitPanel={
        showSplitPanel && zone ? (
          <RecordDetailsPanel
            zone={zone}
            record={singleSelected}
            selectedCount={selected.length}
            zoneRecordNames={Array.from(
              new Set((recordNames.data?.items ?? []).map((r) => r.name)),
            )}
            regions={regions.data ?? []}
            editing={editing}
            onEditingChange={setEditing}
            onDelete={() => setDeleteRecordsOpen(true)}
            onSaved={(saved) => {
              setEditing(false);
              setSelected([saved]);
              refresh();
            }}
          />
        ) : undefined
      }
      splitPanelOpen={showSplitPanel && splitPanelOpen}
      onSplitPanelToggle={setSplitPanelOpen}
      splitPanelPreferences={splitPrefs}
      onSplitPanelPreferencesChange={setSplitPrefs}
    >
      <ContentLayout
        header={
          <Header
            variant="h1"
            info={<InfoLink topic="hosted-zone-details" />}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button onClick={() => setDeleteZoneOpen(true)} disabled={!zone}>
                  Delete zone
                </Button>
                <Button disabled disabledReason="Coming soon">
                  Test record
                </Button>
                <Button disabled disabledReason="Coming soon">
                  Configure query logging
                </Button>
              </SpaceBetween>
            }
          >
            {name}
          </Header>
        }
      >
        {content}
      </ContentLayout>
      <DeleteZoneModal
        zone={zone ?? null}
        visible={deleteZoneOpen}
        onDismiss={() => setDeleteZoneOpen(false)}
        onDeleted={() => router.push(`${BASE}/hostedzones`)}
      />
      {zone && (
        <DeleteRecordsModal
          zoneId={zone.id}
          records={selected}
          visible={deleteRecordsOpen}
          onDismiss={() => setDeleteRecordsOpen(false)}
          onDeleted={() => {
            setDeleteRecordsOpen(false);
            setSelected([]);
            refresh();
          }}
        />
      )}
    </ConsoleLayout>
  );
}
