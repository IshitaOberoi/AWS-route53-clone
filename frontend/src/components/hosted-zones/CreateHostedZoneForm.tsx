'use client';

import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import SpaceBetween from '@cloudscape-design/components/space-between';
import type { TagEditorProps } from '@cloudscape-design/components/tag-editor';
import Textarea from '@cloudscape-design/components/textarea';
import Tiles from '@cloudscape-design/components/tiles';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';

import TagsField, { fromEditorTags } from '@/components/hosted-zones/TagsField';
import VpcAssociations, { rowsToVpcs } from '@/components/hosted-zones/VpcAssociations';
import type { VpcRow } from '@/components/hosted-zones/VpcAssociations';
import InfoLink from '@/components/shell/InfoLink';
import { BASE } from '@/components/shell/Navigation';
import { errorMessage, useFlash } from '@/hooks/useFlash';
import { ApiError, createHostedZone } from '@/lib/api';
import { displayZoneName } from '@/lib/format';
import type { ZoneType } from '@/lib/types';
import { MAX_DESCRIPTION_LENGTH, validateDescription, validateDomainName } from '@/lib/validation';

export const DOMAIN_CONSTRAINT =
  'Valid characters: a-z, 0-9, ! " # $ % & \' ( ) * + , - / : ; < = > ? @ [ \\ ] ^ _ ` { | } . ~';

export function descriptionConstraint(length: number): string {
  return `The description can have up to ${MAX_DESCRIPTION_LENGTH} characters. ${length}/${MAX_DESCRIPTION_LENGTH}`;
}

type Errors = Record<string, string>;

export default function CreateHostedZoneForm() {
  const router = useRouter();
  const flash = useFlash();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<ZoneType>('PUBLIC');
  const [vpcs, setVpcs] = useState<VpcRow[]>([{ region: '', vpc_id: '' }]);
  const [tags, setTags] = useState<TagEditorProps.Tag[]>([]);
  const [tagsValid, setTagsValid] = useState(true);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const validate = (): Errors => {
    const next: Errors = {};
    const nameError = validateDomainName(name);
    if (nameError) next.name = nameError;
    const descriptionError = validateDescription(description);
    if (descriptionError) next.description = descriptionError;
    if (type === 'PRIVATE') {
      const chosen = rowsToVpcs(vpcs);
      if (chosen.length === 0) {
        next.vpcs = 'A private hosted zone must be associated with at least one VPC.';
      }
      vpcs.forEach((row, index) => {
        if (!row.region) next[`vpcs[${index}].region`] = 'Choose a Region.';
        else if (!row.vpc_id) next[`vpcs[${index}].vpc_id`] = 'Choose a VPC.';
      });
    }
    return next;
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const clientErrors = validate();
    setErrors(clientErrors);
    setFormError(null);
    if (Object.keys(clientErrors).length > 0 || !tagsValid) {
      setFormError('Fix the errors in the form and try again.');
      return;
    }
    setSubmitting(true);
    try {
      const zone = await createHostedZone({
        name: name.trim(),
        description: description.trim(),
        type,
        vpcs: type === 'PRIVATE' ? rowsToVpcs(vpcs) : [],
        tags: fromEditorTags(tags),
      });
      flash.success(`Hosted zone ${displayZoneName(zone.name)} was successfully created.`);
      router.push(`${BASE}/hostedzones/${zone.id}`);
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
          <Header
            variant="h1"
            info={<InfoLink topic="create-hosted-zone" />}
            description="A hosted zone is a container that holds information about how you want to route traffic for a domain, such as example.com, and its subdomains."
          >
            Create hosted zone
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
                onClick={() => router.push(`${BASE}/hostedzones`)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button variant="primary" formAction="submit" loading={submitting}>
                Create hosted zone
              </Button>
            </SpaceBetween>
          }
        >
          <SpaceBetween size="l">
            <Container header={<Header variant="h2">Hosted zone configuration</Header>}>
              <SpaceBetween size="l">
                <FormField
                  label="Domain name"
                  info={<InfoLink topic="create-hosted-zone" />}
                  description="This is the name of the domain that you want to route traffic for."
                  constraintText={DOMAIN_CONSTRAINT}
                  errorText={errors.name}
                >
                  <Input
                    value={name}
                    onChange={({ detail }) => setName(detail.value)}
                    placeholder="example.com"
                    autoFocus
                    disabled={submitting}
                    ariaLabel="Domain name"
                  />
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
                    placeholder="The hosted zone is used for..."
                    rows={3}
                    disabled={submitting}
                    ariaLabel="Description"
                  />
                </FormField>
                <FormField
                  label="Type"
                  info={<InfoLink topic="hosted-zone-type" />}
                  description="The type indicates whether you want to route traffic on the internet or in an Amazon VPC."
                >
                  <Tiles
                    value={type}
                    onChange={({ detail }) => setType(detail.value as ZoneType)}
                    columns={2}
                    items={[
                      {
                        value: 'PUBLIC',
                        label: 'Public hosted zone',
                        description:
                          'A public hosted zone determines how traffic is routed on the internet.',
                        disabled: submitting,
                      },
                      {
                        value: 'PRIVATE',
                        label: 'Private hosted zone',
                        description:
                          'A private hosted zone determines how traffic is routed within an Amazon VPC.',
                        disabled: submitting,
                      },
                    ]}
                    ariaLabel="Type"
                  />
                </FormField>
              </SpaceBetween>
            </Container>

            {type === 'PRIVATE' && (
              <Container
                header={
                  <Header
                    variant="h2"
                    info={<InfoLink topic="vpcs" />}
                    description="To use this hosted zone to resolve DNS queries for one or more VPCs, choose the VPCs."
                  >
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
                <Header
                  variant="h2"
                  info={<InfoLink topic="tags" />}
                  description="Apply tags to hosted zones to help organize and identify them."
                >
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
