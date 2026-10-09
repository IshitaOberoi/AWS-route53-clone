'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Modal from '@cloudscape-design/components/modal';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import { useEffect, useState } from 'react';

import { errorMessage, useFlash } from '@/hooks/useFlash';
import { bulkDeleteRecords } from '@/lib/api';
import { displayRecordName } from '@/lib/format';
import type { DnsRecord } from '@/lib/types';

interface DeleteRecordsModalProps {
  zoneId: string;
  records: DnsRecord[];
  visible: boolean;
  onDismiss: () => void;
  onDeleted: (count: number) => void;
}

export default function DeleteRecordsModal({
  zoneId,
  records,
  visible,
  onDismiss,
  onDeleted,
}: DeleteRecordsModalProps) {
  const flash = useFlash();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deletable = records.filter((record) => !record.is_default);

  useEffect(() => {
    if (visible) {
      setDeleting(false);
      setError(null);
    }
  }, [visible]);

  const onConfirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      const { deleted } = await bulkDeleteRecords(
        zoneId,
        deletable.map((record) => record.id),
      );
      flash.success(`Successfully deleted ${deleted} record${deleted === 1 ? '' : 's'}.`);
      onDeleted(deleted);
    } catch (err) {
      setError(errorMessage(err));
      setDeleting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      onDismiss={() => !deleting && onDismiss()}
      header={deletable.length === 1 ? 'Delete record?' : 'Delete records?'}
      closeAriaLabel="Close modal"
      size="medium"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onDismiss} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => void onConfirm()}
              loading={deleting}
              disabled={deletable.length === 0}
              data-testid="confirm-delete-records"
            >
              Delete
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="m">
        <Box variant="span">
          Permanently delete{' '}
          {deletable.length === 1 ? 'this record' : `these ${deletable.length} records`}? You
          can&apos;t undo this action.
        </Box>
        {error && (
          <Alert type="error" header="Unable to delete records">
            {error}
          </Alert>
        )}
        <Table<DnsRecord>
          variant="embedded"
          contentDensity="compact"
          items={deletable}
          trackBy="id"
          columnDefinitions={[
            { id: 'name', header: 'Record name', cell: (record) => displayRecordName(record.name) },
            { id: 'type', header: 'Type', cell: (record) => record.type },
            {
              id: 'value',
              header: 'Value/Route traffic to',
              cell: (record) => (record.is_alias ? record.alias_target : record.values.join(', ')),
            },
          ]}
          wrapLines
        />
      </SpaceBetween>
    </Modal>
  );
}
