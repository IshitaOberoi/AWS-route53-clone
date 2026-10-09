'use client';

import AttributeEditor from '@cloudscape-design/components/attribute-editor';
import Select from '@cloudscape-design/components/select';
import type { SelectProps } from '@cloudscape-design/components/select';
import { useMemo } from 'react';

import { useApi } from '@/hooks/useApi';
import { listRegions, listVpcs } from '@/lib/api';
import type { Vpc } from '@/lib/types';

export interface VpcRow {
  region: string;
  vpc_id: string;
}

interface VpcAssociationsProps {
  rows: VpcRow[];
  onChange: (rows: VpcRow[]) => void;
  /** Field errors keyed like the API: `vpcs[0].vpc_id`. */
  errors: Record<string, string>;
  disabled?: boolean;
}

export function rowsToVpcs(rows: VpcRow[]): Vpc[] {
  return rows.filter((row) => row.region || row.vpc_id);
}

/** Repeatable Region + VPC ID rows for private hosted zones. */
export default function VpcAssociations({
  rows,
  onChange,
  errors,
  disabled,
}: VpcAssociationsProps) {
  const regions = useApi((signal) => listRegions(signal), 'regions');
  const vpcs = useApi((signal) => listVpcs(undefined, signal), 'vpcs');

  const regionOptions = useMemo<SelectProps.Option[]>(
    () =>
      (regions.data ?? []).map((region) => ({
        value: region.code,
        label: region.code,
        description: region.name,
      })),
    [regions.data],
  );

  const update = (index: number, patch: Partial<VpcRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <AttributeEditor<VpcRow>
      items={rows}
      addButtonText="Add VPC"
      removeButtonText="Remove"
      disableAddButton={disabled}
      onAddButtonClick={() => onChange([...rows, { region: '', vpc_id: '' }])}
      onRemoveButtonClick={({ detail }) => onChange(rows.filter((_, i) => i !== detail.itemIndex))}
      isItemRemovable={() => rows.length > 1 && !disabled}
      empty="No VPCs associated."
      definition={[
        {
          label: 'Region',
          info: undefined,
          errorText: (_row, index) => errors[`vpcs[${index}].region`],
          control: (row, index) => (
            <Select
              selectedOption={regionOptions.find((option) => option.value === row.region) ?? null}
              onChange={({ detail }) =>
                update(index, { region: detail.selectedOption.value ?? '', vpc_id: '' })
              }
              options={regionOptions}
              placeholder="Choose a Region"
              statusType={regions.loading ? 'loading' : regions.error ? 'error' : 'finished'}
              loadingText="Loading Regions"
              errorText="Couldn't load Regions"
              filteringType="auto"
              disabled={disabled}
              ariaLabel={`Region for VPC ${index + 1}`}
            />
          ),
        },
        {
          label: 'VPC ID',
          errorText: (_row, index) => errors[`vpcs[${index}].vpc_id`],
          control: (row, index) => {
            const options: SelectProps.Option[] = (vpcs.data ?? [])
              .filter((vpc) => vpc.region === row.region)
              .map((vpc) => ({
                value: vpc.vpc_id,
                label: vpc.vpc_id,
                description: `${vpc.name} · ${vpc.cidr}`,
              }));
            return (
              <Select
                selectedOption={options.find((option) => option.value === row.vpc_id) ?? null}
                onChange={({ detail }) =>
                  update(index, { vpc_id: detail.selectedOption.value ?? '' })
                }
                options={options}
                placeholder={row.region ? 'Choose a VPC' : 'Choose a Region first'}
                disabled={disabled || !row.region}
                statusType={vpcs.loading ? 'loading' : 'finished'}
                loadingText="Loading VPCs"
                empty="No VPCs in this Region"
                ariaLabel={`VPC ID for VPC ${index + 1}`}
              />
            );
          },
        },
      ]}
    />
  );
}
