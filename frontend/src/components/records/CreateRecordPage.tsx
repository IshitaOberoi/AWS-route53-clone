'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Form from '@cloudscape-design/components/form';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';

import RecordFields from '@/components/records/RecordFields';
import ConsoleLayout from '@/components/shell/ConsoleLayout';
import InfoLink from '@/components/shell/InfoLink';
import { BASE } from '@/components/shell/Navigation';
import { useApi } from '@/hooks/useApi';
import { errorMessage, useFlash } from '@/hooks/useFlash';
import { useHostedZone } from '@/hooks/useHostedZone';
import { ApiError, createRecords, listRecords, listRegions } from '@/lib/api';
import { displayRecordName, displayZoneName } from '@/lib/format';
import { draftToInput, emptyDraft, mapApiFieldErrors, validateDraft } from '@/lib/records';
import type { DraftErrors, RecordDraft } from '@/lib/records';

export default function CreateRecordPage() {
  const router = useRouter();
  const flash = useFlash();
  const { zoneId, data: zone, error: zoneError } = useHostedZone();
  const regions = useApi((signal) => listRegions(signal), 'regions');
  const zoneRecords = useApi(
    (signal) => listRecords(zoneId, { page_size: 100 }, signal),
    `record-names:${zoneId}`,
  );

  const [drafts, setDrafts] = useState<RecordDraft[]>(() => [emptyDraft()]);
  const [errors, setErrors] = useState<DraftErrors[]>([{}]);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const detailsHref = `${BASE}/hostedzones/${zoneId}`;
  const zoneName = zone ? displayZoneName(zone.name) : zoneId;
  const recordNames = Array.from(new Set((zoneRecords.data?.items ?? []).map((r) => r.name)));

  const update = (index: number, patch: Partial<RecordDraft>) => {
    setDrafts((current) =>
      current.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)),
    );
    setErrors((current) =>
      current.map((fieldErrors, i) => {
        if (i !== index) return fieldErrors;
        const next = { ...fieldErrors };
        Object.keys(patch).forEach((key) => {
          // Clear the error of the field being edited (draft keys → API field names).
          const apiField: Record<string, string> = {
            name: 'name',
            type: 'type',
            value: 'values',
            ttl: 'ttl',
            isAlias: 'is_alias',
            aliasTarget: 'alias_target',
            aliasTargetType: 'alias_target_type',
            routingPolicy: 'routing_policy',
            setIdentifier: 'set_identifier',
            weight: 'weight',
            region: 'region',
            failover: 'failover',
            geoLocation: 'geo_location',
          };
          delete next[apiField[key] ?? key];
        });
        return next;
      }),
    );
  };

  const addRecord = () => {
    setDrafts((current) => [...current, emptyDraft()]);
    setErrors((current) => [...current, {}]);
  };

  const removeRecord = (index: number) => {
    setDrafts((current) => current.filter((_, i) => i !== index));
    setErrors((current) => current.filter((_, i) => i !== index));
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!zone) return;
    const clientErrors = drafts.map((draft) => validateDraft(draft, zone.name));
    setErrors(clientErrors);
    setFormError(null);
    if (clientErrors.some((fieldErrors) => Object.keys(fieldErrors).length > 0)) {
      setFormError('Fix the errors in the form and try again.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await createRecords(zone.id, drafts.map(draftToInput));
      const first = result.items[0];
      flash.success(
        result.items.length === 1 && first
          ? `Record ${displayRecordName(first.name)} was successfully created.`
          : `${result.items.length} records were successfully created.`,
      );
      router.push(detailsHref);
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(mapApiFieldErrors(error.fieldErrors, drafts.length));
      }
      setFormError(errorMessage(error));
      setSubmitting(false);
    }
  };

  let content;
  if (!zone) {
    content = zoneError ? (
      <Alert type="error" header="Unable to load hosted zone">
        {errorMessage(zoneError)}
      </Alert>
    ) : (
      <Box textAlign="center" padding="xxl">
        <Spinner size="large" />
      </Box>
    );
  } else {
    content = (
      <form onSubmit={(event) => void onSubmit(event)} noValidate>
        <Form
          errorText={formError}
          errorIconAriaLabel="Error"
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button
                variant="link"
                formAction="none"
                onClick={() => router.push(detailsHref)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                formAction="submit"
                loading={submitting}
                data-testid="create-records-submit"
              >
                Create records
              </Button>
            </SpaceBetween>
          }
        >
          <SpaceBetween size="l">
            {drafts.map((draft, index) => (
              <Container
                key={draft.key}
                data-testid={`record-container-${index}`}
                header={
                  <Header
                    variant="h2"
                    actions={
                      <SpaceBetween direction="horizontal" size="xs">
                        {drafts.length > 1 && (
                          <Button
                            formAction="none"
                            onClick={() => removeRecord(index)}
                            disabled={submitting}
                            ariaLabel={`Remove record ${index + 1}`}
                          >
                            Remove
                          </Button>
                        )}
                        {index === 0 && (
                          <Button formAction="none" disabled disabledReason="Coming soon">
                            Switch to wizard
                          </Button>
                        )}
                      </SpaceBetween>
                    }
                  >
                    {drafts.length > 1 ? `Record ${index + 1}` : 'Quick create record'}
                  </Header>
                }
              >
                <RecordFields
                  draft={draft}
                  onChange={(patch) => update(index, patch)}
                  errors={errors[index] ?? {}}
                  zoneName={zone.name}
                  zoneRecordNames={recordNames}
                  regions={regions.data ?? []}
                  disabled={submitting}
                  idPrefix={`record-${index}`}
                />
              </Container>
            ))}
            <Button formAction="none" onClick={addRecord} disabled={submitting} iconName="add-plus">
              Add another record
            </Button>
          </SpaceBetween>
        </Form>
      </form>
    );
  }

  return (
    <ConsoleLayout
      contentType="form"
      helpTopic="create-record"
      breadcrumbs={[
        { text: 'Hosted zones', href: `${BASE}/hostedzones` },
        { text: zoneName, href: detailsHref },
        { text: 'Create record', href: `${detailsHref}/records/create` },
      ]}
    >
      <ContentLayout
        header={
          <Header variant="h1" info={<InfoLink topic="create-record" />}>
            Create record
          </Header>
        }
      >
        {content}
      </ContentLayout>
    </ConsoleLayout>
  );
}
