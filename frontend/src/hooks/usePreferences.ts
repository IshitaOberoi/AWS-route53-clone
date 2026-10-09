'use client';

import type { CollectionPreferencesProps } from '@cloudscape-design/components/collection-preferences';

import { useLocalStorage } from '@/hooks/useLocalStorage';

export const PAGE_SIZES = [10, 25, 50, 100];

export interface TablePreferences {
  pageSize: number;
  wrapLines: boolean;
  stripedRows: boolean;
  contentDensity: 'comfortable' | 'compact';
  contentDisplay: ReadonlyArray<CollectionPreferencesProps.ContentDisplayItem>;
}

/**
 * Table preferences persisted in localStorage. Columns added in a later version are appended
 * (visible) so stored preferences never hide new columns by accident.
 */
export function usePreferences(
  key: string,
  defaults: TablePreferences,
): [TablePreferences, (next: TablePreferences) => void] {
  const [stored, setStored] = useLocalStorage<TablePreferences>(key, defaults);
  const knownIds = new Set(stored.contentDisplay.map((item) => item.id));
  const merged: TablePreferences = {
    ...defaults,
    ...stored,
    pageSize: PAGE_SIZES.includes(stored.pageSize) ? stored.pageSize : defaults.pageSize,
    contentDisplay: [
      ...stored.contentDisplay.filter((item) =>
        defaults.contentDisplay.some((d) => d.id === item.id),
      ),
      ...defaults.contentDisplay.filter((item) => !knownIds.has(item.id)),
    ],
  };
  return [merged, setStored];
}

export function toCollectionPreferences(
  preferences: TablePreferences,
): CollectionPreferencesProps.Preferences {
  return {
    pageSize: preferences.pageSize,
    wrapLines: preferences.wrapLines,
    stripedRows: preferences.stripedRows,
    contentDensity: preferences.contentDensity,
    contentDisplay: preferences.contentDisplay,
  };
}

export function fromCollectionPreferences(
  detail: CollectionPreferencesProps.Preferences,
  current: TablePreferences,
): TablePreferences {
  return {
    pageSize: detail.pageSize ?? current.pageSize,
    wrapLines: detail.wrapLines ?? current.wrapLines,
    stripedRows: detail.stripedRows ?? current.stripedRows,
    contentDensity: detail.contentDensity ?? current.contentDensity,
    contentDisplay: detail.contentDisplay ?? current.contentDisplay,
  };
}
