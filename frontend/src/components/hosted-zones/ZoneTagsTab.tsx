'use client';

import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Header from '@cloudscape-design/components/header';
import Modal from '@cloudscape-design/components/modal';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import type { TagEditorProps } from '@cloudscape-design/components/tag-editor';
import { useState } from 'react';

import TagsField, { fromEditorTags, toEditorTags } from '@/components/hosted-zones/TagsField';
import InfoLink from '@/components/shell/InfoLink';
import { errorMessage, useFlash } from '@/hooks/useFlash';
import { replaceHostedZoneTags } from '@/lib/api';
import { displayZoneName } from '@/lib/format';
import type { HostedZone, Tag } from '@/lib/types';

export default function ZoneTagsTab({
  zone,
  onChanged,
}: {
  zone: HostedZone;
  onChanged: () => void;
}) {
  const flash = useFlash();
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState<TagEditorProps.Tag[]>([]);
  const [valid, setValid] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openModal = () => {
    setTags(toEditorTags(zone.tags));
    setValid(true);
    setError(null);
    setSaving(false);
    setOpen(true);
  };

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      await replaceHostedZoneTags(zone.id, fromEditorTags(tags));
      flash.success(
        `Tags for hosted zone ${displayZoneName(zone.name)} were successfully updated.`,
      );
      setOpen(false);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <>
      <Table<Tag>
        variant="container"
        items={zone.tags}
        trackBy="key"
        columnDefinitions={[
          { id: 'key', header: 'Key', cell: (tag) => tag.key, isRowHeader: true },
          { id: 'value', header: 'Value', cell: (tag) => tag.value || '-' },
        ]}
        header={
          <Header
            variant="h2"
            counter={`(${zone.tags.length})`}
            info={<InfoLink topic="tags" />}
            actions={<Button onClick={openModal}>Manage tags</Button>}
          >
            Hosted zone tags
          </Header>
        }
        empty={
          <Box textAlign="center" color="inherit">
            <Box variant="strong" color="inherit">
              No tags
            </Box>
            <Box variant="p" color="inherit">
              No tags are associated with this hosted zone.
            </Box>
            <Button onClick={openModal}>Manage tags</Button>
          </Box>
        }
      />
      <Modal
        visible={open}
        onDismiss={() => !saving && setOpen(false)}
        header="Manage tags"
        size="large"
        closeAriaLabel="Close modal"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => void save()}
                loading={saving}
                disabled={!valid}
              >
                Save changes
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          {error && <Box color="text-status-error">{error}</Box>}
          <TagsField
            tags={tags}
            onChange={(next, isValid) => {
              setTags(next);
              setValid(isValid);
            }}
          />
        </SpaceBetween>
      </Modal>
    </>
  );
}
