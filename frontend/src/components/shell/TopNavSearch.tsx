'use client';

import Autosuggest from '@cloudscape-design/components/autosuggest';
import type { AutosuggestProps } from '@cloudscape-design/components/autosuggest';
import { useRouter } from 'next/navigation';
import { forwardRef, useEffect, useState } from 'react';

import { BASE } from '@/components/shell/Navigation';
import { listHostedZones } from '@/lib/api';
import { displayZoneName, zoneTypeLabel } from '@/lib/format';

const DEBOUNCE_MS = 250;

/** Top navigation search: type a hosted zone name, pick a match to open it. */
const TopNavSearch = forwardRef<AutosuggestProps.Ref>(function TopNavSearch(_props, ref) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [options, setOptions] = useState<AutosuggestProps.Option[]>([]);
  const [status, setStatus] = useState<AutosuggestProps.StatusType>('finished');

  useEffect(() => {
    const term = value.trim();
    if (!term) {
      setOptions([]);
      setStatus('finished');
      return;
    }
    setStatus('loading');
    const controller = new AbortController();
    const timer = setTimeout(() => {
      listHostedZones({ search: term, page_size: 10 }, controller.signal)
        .then((page) => {
          setOptions(
            page.items.map((zone) => ({
              value: zone.id,
              label: displayZoneName(zone.name),
              description: `${zoneTypeLabel(zone.type)} hosted zone · ${zone.id}`,
            })),
          );
          setStatus('finished');
        })
        .catch(() => {
          if (!controller.signal.aborted) setStatus('error');
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  return (
    <Autosuggest
      ref={ref}
      value={value}
      onChange={({ detail }) => setValue(detail.value)}
      onSelect={({ detail }) => {
        if (detail.selectedOption?.value) {
          setValue('');
          router.push(`${BASE}/hostedzones/${detail.selectedOption.value}`);
        }
      }}
      onKeyDown={({ detail }) => {
        if (detail.key === 'Enter' && value.trim() && options.length === 0) {
          router.push(`${BASE}/hostedzones?q=${encodeURIComponent(value.trim())}`);
        }
      }}
      options={options}
      filteringType="manual"
      statusType={status}
      loadingText="Searching hosted zones"
      errorText="Search failed"
      // Only show "no matches" once something has been typed.
      empty={value.trim() ? 'No matching hosted zones' : undefined}
      placeholder="Search"
      ariaLabel="Search hosted zones"
      enteredTextLabel={(text) => `Search for "${text}"`}
      hideEnteredTextOption
      clearAriaLabel="Clear search"
    />
  );
});

export default TopNavSearch;
