'use client';

import TagEditor from '@cloudscape-design/components/tag-editor';
import type { TagEditorProps } from '@cloudscape-design/components/tag-editor';

import { MAX_TAGS } from '@/lib/validation';
import type { Tag } from '@/lib/types';

interface TagsFieldProps {
  tags: TagEditorProps.Tag[];
  onChange: (tags: TagEditorProps.Tag[], valid: boolean) => void;
}

const noSuggestions = () => Promise.resolve([]);

export function toEditorTags(tags: Tag[]): TagEditorProps.Tag[] {
  return tags.map((tag) => ({ key: tag.key, value: tag.value, existing: true }));
}

export function fromEditorTags(tags: readonly TagEditorProps.Tag[]): Tag[] {
  return tags
    .filter((tag) => !tag.markedForRemoval && tag.key.trim())
    .map((tag) => ({ key: tag.key.trim(), value: tag.value }));
}

/** Cloudscape TagEditor (up to 50 tags), used on create, edit and "Manage tags". */
export default function TagsField({ tags, onChange }: TagsFieldProps) {
  return (
    <TagEditor
      tags={tags}
      onChange={({ detail }) => onChange([...detail.tags], detail.valid)}
      keysRequest={noSuggestions}
      valuesRequest={noSuggestions}
      tagLimit={MAX_TAGS}
    />
  );
}
