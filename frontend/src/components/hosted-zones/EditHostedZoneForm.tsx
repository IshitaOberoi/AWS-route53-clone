'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import type { TagEditorProps } from '@cloudscape-design/components/tag-editor';
import Textarea from '@cloudscape-design/components/textarea';
import Tiles from '@cloudscape-design/components/tiles';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { descriptionConstraint } from '@/components/hosted-zones/CreateHostedZoneForm';
import TagsField, { fromEditorTags, toEditorTags } from '@/components/hosted-zones/TagsField';
import VpcAssociations, { rowsToVpcs } from '@/components/hosted-zones/VpcAssociations';
import type { VpcRow } from '@/components/hosted-zones/VpcAssociations';
import InfoLink from '@/components/shell/InfoLink';
import { BASE } from '@/components/shell/Navigation';
import { errorMessage, useFlash } from '@/hooks/useFlash';
import { ApiError, replaceHostedZoneTags, updateHostedZone } from '@/lib/api';
import { displayZoneName } from '@/lib/format';
import type { HostedZone } from '@/lib/types';
import { validateDescription } from '@/lib/validation';

type Errors = Record<string, string>;

interface EditHostedZoneFormProps {
  zone: HostedZone | undefined;
  loading: boolean;
  loadError: unknown;
}

export default function EditHostedZoneForm({ zone, loading, loadError }: EditHostedZoneFormProps) {
  const router = useRouter();
  const flash = useFlash();
  const [description, setDescription] = useState('');
  const [vpcs, setVpcs] = useState<VpcRow[]>([]);
  const [tags, setTags] = useState<TagEditorProps.Tag[]>([]);
  const [tagsValid, setTagsValid] = useState(true);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!zone) return;
    setDescription(zone.description);
    setVpcs(zone.vpcs.map((vpc) => ({ ...vpc })));
    setTags(toEditorTags(zone.tags));
  }, [zone]);

  if (loading && !zone) {
    return (
      <Box textAlign="center" padding="xxl">
        <Spinner size="large" />
      </Box>
    );
  }
  if (!zone) {
    return (
      <Alert type="error" header="Unable to load hosted zone">
        {errorMessage(loadError)}
      </Alert>
    );
  }

  const detailsHref = `${BASE}/hostedzones/${zone.id}`;
  const name = displayZoneName(zone.name);
  const isPrivate = zone.type === 'PRIVATE';

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const next: Errors = {};
    const descriptionError = validateDescription(description);
    if (descriptionError) next.description = descriptionError;
    if (isPrivate) {
      if (rowsToVpcs(vpcs).length === 0) {
        next.vpcs = 'A private hosted zone must be associated with at least one VPC.';
      }
      vpcs.forEach((row, index) => {
        if (!row.region) next[`vpcs[${index}].region`] = 'Choose a Region.';
        else if (!row.vpc_id) next[`vpcs[${index}].vpc_id`] = 'Choose a VPC.';
      });
    }
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0 || !tagsValid) {
      setFormError('Fix the errors in the form and try again.');
      return;
    }

    setSubmitting(true);
    try {
      await updateHostedZone(zone.id, {
        description: description.trim(),
        ...(isPrivate ? { vpcs: rowsToVpcs(vpcs) } : {}),
      });
      await replaceHostedZoneTags(zone.id, fromEditorTags(tags));
      flash.success(`Hosted zone ${name} was successfully updated.`);
      router.push(detailsHref);
    } catch (error) {
      if (error instanceof ApiError) setErrors(error.fieldErrors);
      setFormError(errorMessage(error));
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate>
      <ContentLayout
        header={
          <Header variant="h1" info={<InfoLink topic="edit-hosted-zone" />}>
            Edit hosted zone
          </Header>
        }
      >
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
              <Button variant="primary" formAction="submit" loading={submitting}>
                Save changes
              </Button>
            </SpaceBetween>
          }
        >
          <SpaceBetween size="l">
            <Container header={<Header variant="h2">Hosted zone configuration</Header>}>
              <SpaceBetween size="l">
                <FormField
                  label="Domain name"
                  description="The domain name of a hosted zone can't be changed."
                >
                  <Input value={name} readOnly ariaLabel="Domain name" />
                </FormField>
                <FormField
                  label={
                    <>
                      Description - <i>optional</i>
                    </>
                  }
                  description="This value lets you distinguish hosted zones that have the same name."
                  constraintText={descriptionConstraint(description.length)}
                  errorText={errors.description}
                >
                  <Textarea
                    value={description}
                    onChange={({ detail }) => setDescription(detail.value)}
                    rows={3}
                    disabled={submitting}
                    ariaLabel="Description"
                  />
                </FormField>
                <FormField label="Type" description="The type of a hosted zone can't be changed.">
                  <Tiles
                    value={zone.type}
                    columns={2}
                    readOnly
                    items={[
                      {
                        value: 'PUBLIC',
                        label: 'Public hosted zone',
                        description:
                          'A public hosted zone determines how traffic is routed on the internet.',
                      },
                      {
                        value: 'PRIVATE',
                        label: 'Private hosted zone',
                        description:
                          'A private hosted zone determines how traffic is routed within an Amazon VPC.',
                      },
                    ]}
                    ariaLabel="Type"
                  />
                </FormField>
              </SpaceBetween>
            </Container>

            {isPrivate && (
              <Container
                header={
                  <Header variant="h2" info={<InfoLink topic="vpcs" />}>
                    VPCs to associate with the hosted zone
                  </Header>
                }
              >
                <FormField errorText={errors.vpcs} stretch>
                  <VpcAssociations
                    rows={vpcs}
                    onChange={setVpcs}
                    errors={errors}
                    disabled={submitting}
                  />
                </FormField>
              </Container>
            )}

            <Container
              header={
                <Header variant="h2" info={<InfoLink topic="tags" />}>
                  Tags
                </Header>
              }
            >
              <TagsField
                tags={tags}
                onChange={(next, valid) => {
                  setTags(next);
                  setTagsValid(valid);
                }}
              />
            </Container>
          </SpaceBetween>
        </Form>
      </ContentLayout>
    </form>
  );
}
