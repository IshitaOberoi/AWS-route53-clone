'use client';

import Autosuggest from '@cloudscape-design/components/autosuggest';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import Select from '@cloudscape-design/components/select';
import type { SelectProps } from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Textarea from '@cloudscape-design/components/textarea';
import Toggle from '@cloudscape-design/components/toggle';

import InfoLink from '@/components/shell/InfoLink';
import { ALIAS_TARGET_LABELS, displayZoneName } from '@/lib/format';
import {
  ALIAS_TARGET_SUGGESTIONS,
  ALIAS_TYPES,
  GEO_LOCATION_OPTIONS,
  RECORD_TYPE_OPTIONS,
  ROUTING_POLICY_OPTIONS,
  SOA_TYPE_OPTION,
  TTL_PRESETS,
  VALUE_DESCRIPTIONS,
  VALUE_PLACEHOLDERS,
} from '@/lib/records';
import type { DraftErrors, RecordDraft } from '@/lib/records';
import type { AliasTargetType, FailoverType, Region, RoutingPolicy } from '@/lib/types';

interface RecordFieldsProps {
  draft: RecordDraft;
  onChange: (patch: Partial<RecordDraft>) => void;
  errors: DraftErrors;
  zoneName: string; // FQDN with trailing dot
  /** Existing record names (FQDN) in this zone, for "Alias to another record". */
  zoneRecordNames: string[];
  regions: Region[];
  /** Default NS/SOA records: name, type, alias and routing policy are locked. */
  locked?: boolean;
  disabled?: boolean;
  /** Prefix for stable test ids / labels when several records are on one page. */
  idPrefix: string;
}

const ALIAS_TARGET_OPTIONS: SelectProps.Option[] = (
  Object.keys(ALIAS_TARGET_LABELS) as AliasTargetType[]
).map((value) => ({ value, label: ALIAS_TARGET_LABELS[value] }));

function option<T extends string>(
  options: { value: T; label: string }[],
  value: T | null | undefined,
): SelectProps.Option | null {
  const found = options.find((item) => item.value === value);
  return found ? { value: found.value, label: found.label } : null;
}

export default function RecordFields({
  draft,
  onChange,
  errors,
  zoneName,
  zoneRecordNames,
  regions,
  locked = false,
  disabled = false,
  idPrefix,
}: RecordFieldsProps) {
  const aliasCapable = ALIAS_TYPES.includes(draft.type);
  const alias = draft.isAlias && aliasCapable;
  const typeOptions = locked && draft.type === 'SOA' ? [SOA_TYPE_OPTION] : RECORD_TYPE_OPTIONS;

  const aliasSuggestions =
    draft.aliasTargetType === 'RECORD_IN_ZONE'
      ? zoneRecordNames.map((name) => ({ value: displayZoneName(name) }))
      : draft.aliasTargetType
        ? ALIAS_TARGET_SUGGESTIONS[draft.aliasTargetType].map((value) => ({ value }))
        : [];

  return (
    <SpaceBetween size="l">
      <ColumnLayout columns={2}>
        <FormField
          label="Record name"
          info={<InfoLink topic="record-name" />}
          description="Keep blank to create a record for the root domain."
          errorText={errors.name}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flexGrow: 1, minWidth: 0 }}>
              <Input
                value={draft.name}
                onChange={({ detail }) => onChange({ name: detail.value })}
                placeholder="subdomain"
                disabled={disabled || locked}
                ariaLabel="Record name"
                data-testid={`${idPrefix}-name`}
              />
            </div>
            <Box color="text-body-secondary" data-testid={`${idPrefix}-zone-suffix`}>
              .{displayZoneName(zoneName)}
            </Box>
          </div>
        </FormField>
        <FormField
          label="Record type"
          info={<InfoLink topic="record-type" />}
          errorText={errors.type}
        >
          <Select
            selectedOption={option(typeOptions, draft.type)}
            onChange={({ detail }) => {
              const type = detail.selectedOption.value as RecordDraft['type'];
              onChange({ type, isAlias: ALIAS_TYPES.includes(type) ? draft.isAlias : false });
            }}
            options={typeOptions}
            disabled={disabled || locked}
            ariaLabel="Record type"
            data-testid={`${idPrefix}-type`}
          />
        </FormField>
      </ColumnLayout>

      {aliasCapable && !locked && (
        <FormField label="Alias" info={<InfoLink topic="alias" />} errorText={errors.is_alias}>
          <Toggle
            checked={draft.isAlias}
            onChange={({ detail }) => onChange({ isAlias: detail.checked })}
            disabled={disabled}
            data-testid={`${idPrefix}-alias`}
          >
            Alias
          </Toggle>
        </FormField>
      )}

      {alias ? (
        <SpaceBetween size="l">
          <FormField
            label="Route traffic to"
            description="Choose the endpoint type, then the resource to route traffic to."
            errorText={errors.alias_target_type ?? errors.alias_target}
            stretch
          >
            <ColumnLayout columns={2}>
              <Select
                selectedOption={
                  ALIAS_TARGET_OPTIONS.find((item) => item.value === draft.aliasTargetType) ?? null
                }
                onChange={({ detail }) =>
                  onChange({
                    aliasTargetType: detail.selectedOption.value as AliasTargetType,
                    aliasTarget: '',
                  })
                }
                options={ALIAS_TARGET_OPTIONS}
                placeholder="Choose endpoint"
                disabled={disabled}
                ariaLabel="Endpoint type"
                data-testid={`${idPrefix}-alias-type`}
              />
              <Autosuggest
                value={draft.aliasTarget}
                onChange={({ detail }) => onChange({ aliasTarget: detail.value })}
                options={aliasSuggestions}
                placeholder={
                  draft.aliasTargetType === 'RECORD_IN_ZONE'
                    ? 'Choose record'
                    : 'Enter or choose an endpoint'
                }
                enteredTextLabel={(value) => `Use: "${value}"`}
                empty="No matching resources"
                disabled={disabled || !draft.aliasTargetType}
                ariaLabel="Alias target"
                data-testid={`${idPrefix}-alias-target`}
              />
            </ColumnLayout>
          </FormField>
          <FormField label="Evaluate target health">
            <Toggle
              checked={draft.evaluateTargetHealth}
              onChange={({ detail }) => onChange({ evaluateTargetHealth: detail.checked })}
              disabled={disabled}
            >
              {draft.evaluateTargetHealth ? 'Yes' : 'No'}
            </Toggle>
          </FormField>
        </SpaceBetween>
      ) : (
        <ColumnLayout columns={2}>
          <FormField
            label="Value"
            info={<InfoLink topic="record-value" />}
            description={
              VALUE_DESCRIPTIONS[draft.type] ?? 'Enter multiple values on separate lines.'
            }
            errorText={
              errors.values ? (
                <span style={{ whiteSpace: 'pre-line' }}>{errors.values}</span>
              ) : undefined
            }
            stretch
          >
            <Textarea
              value={draft.value}
              onChange={({ detail }) => onChange({ value: detail.value })}
              placeholder={VALUE_PLACEHOLDERS[draft.type]}
              rows={4}
              disabled={disabled}
              ariaLabel="Value"
              data-testid={`${idPrefix}-value`}
            />
          </FormField>
          <FormField
            label="TTL (seconds)"
            info={<InfoLink topic="ttl" />}
            description="Recommended values: 60 to 172800 (two days)"
            errorText={errors.ttl}
          >
            <SpaceBetween direction="horizontal" size="xs">
              <Input
                type="number"
                inputMode="numeric"
                value={draft.ttl}
                onChange={({ detail }) => onChange({ ttl: detail.value })}
                disabled={disabled}
                ariaLabel="TTL (seconds)"
                data-testid={`${idPrefix}-ttl`}
              />
              {TTL_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  formAction="none"
                  onClick={() => onChange({ ttl: String(preset.seconds) })}
                  disabled={disabled}
                  ariaLabel={`Set TTL to ${preset.seconds} seconds`}
                >
                  {preset.label}
                </Button>
              ))}
            </SpaceBetween>
          </FormField>
        </ColumnLayout>
      )}

      {!locked && (
        <ColumnLayout columns={2}>
          <FormField
            label="Routing policy"
            info={<InfoLink topic="routing-policy" />}
            errorText={errors.routing_policy}
          >
            <Select
              selectedOption={option(ROUTING_POLICY_OPTIONS, draft.routingPolicy)}
              onChange={({ detail }) =>
                onChange({ routingPolicy: detail.selectedOption.value as RoutingPolicy })
              }
              options={ROUTING_POLICY_OPTIONS}
              disabled={disabled}
              ariaLabel="Routing policy"
              data-testid={`${idPrefix}-routing`}
            />
          </FormField>
          {draft.routingPolicy === 'WEIGHTED' && (
            <FormField label="Weight" description="0 to 255" errorText={errors.weight}>
              <Input
                type="number"
                value={draft.weight}
                onChange={({ detail }) => onChange({ weight: detail.value })}
                disabled={disabled}
                ariaLabel="Weight"
              />
            </FormField>
          )}
          {draft.routingPolicy === 'LATENCY' && (
            <FormField label="Region" errorText={errors.region}>
              <Select
                selectedOption={
                  draft.region
                    ? {
                        value: draft.region,
                        label: draft.region,
                        description: regions.find((r) => r.code === draft.region)?.name,
                      }
                    : null
                }
                onChange={({ detail }) => onChange({ region: detail.selectedOption.value ?? '' })}
                options={regions.map((region) => ({
                  value: region.code,
                  label: region.code,
                  description: region.name,
                }))}
                placeholder="Choose a Region"
                filteringType="auto"
                disabled={disabled}
                ariaLabel="Region"
              />
            </FormField>
          )}
          {draft.routingPolicy === 'FAILOVER' && (
            <FormField label="Failover record type" errorText={errors.failover}>
              <Select
                selectedOption={option(
                  [
                    { value: 'PRIMARY' as FailoverType, label: 'Primary' },
                    { value: 'SECONDARY' as FailoverType, label: 'Secondary' },
                  ],
                  draft.failover,
                )}
                onChange={({ detail }) =>
                  onChange({ failover: detail.selectedOption.value as FailoverType })
                }
                options={[
                  { value: 'PRIMARY', label: 'Primary' },
                  { value: 'SECONDARY', label: 'Secondary' },
                ]}
                placeholder="Choose failover record type"
                disabled={disabled}
                ariaLabel="Failover record type"
              />
            </FormField>
          )}
          {draft.routingPolicy === 'GEOLOCATION' && (
            <FormField label="Location" errorText={errors.geo_location}>
              <Select
                selectedOption={
                  GEO_LOCATION_OPTIONS.find((item) => item.value === draft.geoLocation) ?? null
                }
                onChange={({ detail }) =>
                  onChange({ geoLocation: detail.selectedOption.value ?? '' })
                }
                options={GEO_LOCATION_OPTIONS.map((item) => ({
                  value: item.value,
                  label: item.label,
                  tags: [item.value],
                }))}
                placeholder="Choose location"
                filteringType="auto"
                disabled={disabled}
                ariaLabel="Location"
              />
            </FormField>
          )}
        </ColumnLayout>
      )}

      {!locked && draft.routingPolicy !== 'SIMPLE' && (
        <ColumnLayout columns={2}>
          <FormField
            label="Record ID"
            description="Enter a value that uniquely identifies this record among records with the same name and type."
            errorText={errors.set_identifier}
          >
            <Input
              value={draft.setIdentifier}
              onChange={({ detail }) => onChange({ setIdentifier: detail.value })}
              placeholder="My record ID"
              disabled={disabled}
              ariaLabel="Record ID"
            />
          </FormField>
          <FormField
            label={
              <>
                Health check ID - <i>optional</i>
              </>
            }
            errorText={errors.health_check_id}
          >
            <Input
              value={draft.healthCheckId}
              onChange={({ detail }) => onChange({ healthCheckId: detail.value })}
              placeholder="Health check ID"
              disabled={disabled}
              ariaLabel="Health check ID"
            />
          </FormField>
        </ColumnLayout>
      )}
    </SpaceBetween>
  );
}
