'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import Modal from '@cloudscape-design/components/modal';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { errorMessage, useFlash } from '@/hooks/useFlash';
import { deleteHostedZone } from '@/lib/api';
import { displayZoneName } from '@/lib/format';

export const DELETE_CONFIRMATION = 'delete';

interface DeleteZoneModalProps {
  zone: { id: string; name: string } | null;
  visible: boolean;
  onDismiss: () => void;
  onDeleted: () => void;
}

/** Route 53's "type delete to confirm" modal for hosted zones. */
export default function DeleteZoneModal({
  zone,
  visible,
  onDismiss,
  onDeleted,
}: DeleteZoneModalProps) {
  const flash = useFlash();
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setConfirmation('');
      setError(null);
      setDeleting(false);
    }
  }, [visible]);

  if (!zone) return null;
  const name = displayZoneName(zone.name);
  const confirmed = confirmation.trim() === DELETE_CONFIRMATION;

  const onSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!confirmed || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteHostedZone(zone.id);
      flash.success(`Successfully deleted hosted zone ${name}.`);
      onDeleted();
    } catch (err) {
      setError(errorMessage(err));
      setDeleting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      onDismiss={() => !deleting && onDismiss()}
      header="Delete hosted zone?"
      closeAriaLabel="Close modal"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onDismiss} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => void onSubmit()}
              disabled={!confirmed}
              loading={deleting}
              data-testid="confirm-delete-zone"
            >
              Delete
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <form onSubmit={(event) => void onSubmit(event)}>
        <SpaceBetween size="m">
          <Box variant="span">
            Permanently delete hosted zone{' '}
            <Box variant="span" fontWeight="bold">
              {name}
            </Box>
            ? You can&apos;t undo this action.
          </Box>
          <Alert type="warning" statusIconAriaLabel="Warning">
            If you delete a hosted zone, DNS queries for this domain are no longer answered by the
            name servers of this hosted zone. You can delete a hosted zone only if it contains
            nothing but the default NS and SOA records.
          </Alert>
          {error && (
            <Alert type="error" statusIconAriaLabel="Error" header="Unable to delete hosted zone">
              {error}
            </Alert>
          )}
          <FormField
            label={
              <>
                To confirm deletion, type <i>{DELETE_CONFIRMATION}</i> in the field.
              </>
            }
          >
            <Input
              value={confirmation}
              onChange={({ detail }) => setConfirmation(detail.value)}
              placeholder={DELETE_CONFIRMATION}
              ariaLabel="Type delete to confirm"
              autoFocus
              disabled={deleting}
            />
          </FormField>
        </SpaceBetween>
      </form>
    </Modal>
  );
}
