'use client';

import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Modal from '@cloudscape-design/components/modal';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';

import { useShell } from '@/context/ShellContext';
import { SHORTCUTS } from '@/hooks/useShortcuts';
import type { ShortcutDefinition } from '@/hooks/useShortcuts';

export default function ShortcutsModal() {
  const { shortcutsOpen, setShortcutsOpen } = useShell();
  return (
    <Modal
      visible={shortcutsOpen}
      onDismiss={() => setShortcutsOpen(false)}
      header="Keyboard shortcuts"
      closeAriaLabel="Close keyboard shortcuts"
      footer={
        <Box float="right">
          <Button variant="primary" onClick={() => setShortcutsOpen(false)}>
            Close
          </Button>
        </Box>
      }
    >
      <Table<ShortcutDefinition>
        variant="embedded"
        items={SHORTCUTS}
        trackBy={(item) => item.keys.join('+')}
        columnDefinitions={[
          {
            id: 'keys',
            header: 'Shortcut',
            cell: (item) => (
              <SpaceBetween direction="horizontal" size="xxs">
                {item.keys.map((key, index) => (
                  <Box key={key} variant="span">
                    {index > 0 && (
                      <Box variant="span" color="text-body-secondary" padding={{ right: 'xxs' }}>
                        {item.keys[0] === 'g' ? 'then' : '+'}
                      </Box>
                    )}
                    <Box variant="code">{key}</Box>
                  </Box>
                ))}
              </SpaceBetween>
            ),
            width: 200,
          },
          { id: 'description', header: 'Action', cell: (item) => item.description },
        ]}
      />
      <Box variant="small" color="text-body-secondary" padding={{ top: 's' }}>
        Shortcuts are ignored while you are typing in a field or while a dialog is open.
      </Box>
    </Modal>
  );
}
