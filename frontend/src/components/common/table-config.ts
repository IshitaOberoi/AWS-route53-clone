import type { TableProps } from '@cloudscape-design/components/table';

/** ARIA labels for selectable tables (AGENTS.md §9). */
export function selectionLabels<T>(
  resource: string,
  nameOf: (item: T) => string,
): TableProps.AriaLabels<T> {
  return {
    selectionGroupLabel: `${resource} selection`,
    allItemsSelectionLabel: () => `Select all ${resource.toLowerCase()}`,
    itemSelectionLabel: (_selection, item) => `Select ${nameOf(item)}`,
    tableLabel: resource,
  };
}
