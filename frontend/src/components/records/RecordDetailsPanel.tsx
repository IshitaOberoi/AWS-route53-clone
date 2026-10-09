'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Form from '@cloudscape-design/components/form';
import Header from '@cloudscape-design/components/header';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import SpaceBetween from '@cloudscape-design/components/space-between';
import SplitPanel from '@cloudscape-design/components/split-panel';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import RecordFields from '@/components/records/RecordFields';
import { evaluateTargetHealthLabel, recordValueLines } from '@/components/records/RecordsTable';
import { errorMessage, useFlash } from '@/hooks/useFlash';
import { ApiError, updateRecord } from '@/lib/api';
import {
  ALIAS_TARGET_LABELS,
  displayRecordName,
  FAILOVER_LABELS,
  formatDateTime,
  ROUTING_POLICY_LABELS,
} from '@/lib/format';
import { draftToInput, mapApiFieldErrors, recordToDraft, validateDraft } from '@/lib/records';
import type { DraftErrors, RecordDraft } from '@/lib/records';
import type { DnsRecord, HostedZone, Region } from '@/lib/types';

interface RecordDetailsPanelProps {
  zone: HostedZone;
  record: DnsRecord | undefined;
  selectedCount: number;
  zoneRecordNames: string[];
  regions: Region[];
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onDelete: () => void;
  onSaved: (record: DnsRecord) => void;
}

export default function RecordDetailsPanel({
  zone,
  record,
  selectedCount,
  zoneRecordNames,
  regions,
  editing,
  onEditingChange,
  onDelete,
  onSaved,
}: RecordDetailsPanelProps) {
  const flash = useFlash();
  const [draft, setDraft] = useState<RecordDraft | null>(null);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(record ? recordToDraft(record, zone.name) : null);
    setErrors({});
    setFormError(null);
    setSaving(false);
  }, [record, zone.name, editing]);

  if (!record) {
    return (
      <SplitPanel
        header={selectedCount > 1 ? `${selectedCount} records selected` : 'Record details'}
        hidePreferencesButton={false}
      >
        <Box textAlign="center" color="text-body-secondary" padding="l">
          {selectedCount > 1
            ? 'Select a single record to see its details.'
            : 'Select a record to see its details.'}
        </Box>
      </SplitPanel>
    );
  }

  const name = displayRecordName(record.name);

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    const clientErrors = validateDraft(draft, zone.name);
    setErrors(clientErrors);
    setFormError(null);
    if (Object.keys(clientErrors).length > 0) return;
    setSaving(true);
    try {
      const saved = await updateRecord(zone.id, record.id, draftToInput(draft));
      flash.success(`Record ${displayRecordName(saved.name)} was successfully updated.`);
      onSaved(saved);
    } catch (error) {
      if (error instanceof ApiError)
        setErrors(mapApiFieldErrors(error.fieldErrors, 1, true)[0] ?? {});
      setFormError(errorMessage(error));
      setSaving(false);
    }
  };

  if (editing && draft) {
    return (
      <SplitPanel header={`Edit record: ${name}`}>
        <form onSubmit={(event) => void onSave(event)} noValidate>
          <Form
            errorText={formError}
            errorIconAriaLabel="Error"
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button
                  variant="link"
                  formAction="none"
                  onClick={() => onEditingChange(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  formAction="submit"
                  loading={saving}
                  data-testid="save-record"
                >
                  Save
                </Button>
              </SpaceBetween>
            }
          >
            <SpaceBetween size="l">
              {record.is_default && (
                <Alert type="info">
                  This record was created by Route 53 with the hosted zone. You can change its TTL
                  and values, but not its name or type.
                </Alert>
              )}
              <RecordFields
                draft={draft}
                onChange={(patch) =>
                  setDraft((current) => (current ? { ...current, ...patch } : current))
                }
                errors={errors}
                zoneName={zone.name}
                zoneRecordNames={zoneRecordNames}
                regions={regions}
                locked={record.is_default}
                disabled={saving}
                idPrefix="edit"
              />
            </SpaceBetween>
          </Form>
        </form>
      </SplitPanel>
    );
  }

  const policyDetails = [
    record.weight !== null ? { label: 'Weight', value: String(record.weight) } : null,
    record.region ? { label: 'Region', value: record.region } : null,
    record.failover
      ? { label: 'Failover record type', value: FAILOVER_LABELS[record.failover] }
      : null,
    record.geo_location ? { label: 'Location', value: record.geo_location } : null,
  ].filter((item): item is { label: string; value: string } => item !== null);

  return (
    <SplitPanel header={name}>
      <SpaceBetween size="l">
        <Header
          variant="h3"
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button
                onClick={onDelete}
                disabled={record.is_default}
                disabledReason="Default NS and SOA records can't be deleted."
              >
                Delete record
              </Button>
              <Button onClick={() => onEditingChange(true)} data-testid="edit-record">
                Edit record
              </Button>
            </SpaceBetween>
          }
        >
          Record details
        </Header>
        <KeyValuePairs
          columns={3}
          items={[
            { label: 'Record name', value: name },
            { label: 'Record type', value: record.type },
            {
              label: record.is_alias ? 'Route traffic to' : 'Value',
              value: (
                <div>
                  {recordValueLines(record).map((line, index) => (
                    <div key={`${index}-${line}`}>{line}</div>
                  ))}
                  {record.is_alias && record.alias_target_type && (
                    <Box color="text-body-secondary" fontSize="body-s">
                      {ALIAS_TARGET_LABELS[record.alias_target_type]}
                    </Box>
                  )}
                </div>
              ),
            },
            { label: 'Alias', value: record.is_alias ? 'Yes' : 'No' },
            { label: 'TTL (seconds)', value: record.ttl === null ? '-' : String(record.ttl) },
            { label: 'Routing policy', value: ROUTING_POLICY_LABELS[record.routing_policy] },
            { label: 'Record ID (differentiator)', value: record.set_identifier || '-' },
            ...policyDetails,
            { label: 'Health check ID', value: record.health_check_id || '-' },
            { label: 'Evaluate target health', value: evaluateTargetHealthLabel(record) },
            { label: 'Created', value: formatDateTime(record.created_at) },
            { label: 'Last modified', value: formatDateTime(record.updated_at) },
          ]}
        />
      </SpaceBetween>
    </SplitPanel>
  );
}
