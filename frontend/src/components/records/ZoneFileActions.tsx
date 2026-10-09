'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import ButtonDropdown from '@cloudscape-design/components/button-dropdown';
import FileUpload from '@cloudscape-design/components/file-upload';
import FormField from '@cloudscape-design/components/form-field';
import Modal from '@cloudscape-design/components/modal';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Textarea from '@cloudscape-design/components/textarea';
import { useState } from 'react';

import InfoLink from '@/components/shell/InfoLink';
import { errorMessage, useFlash } from '@/hooks/useFlash';
import { ApiError, exportZone, importZoneFile } from '@/lib/api';
import { displayZoneName, pluralize } from '@/lib/format';
import type { ExportFormat, HostedZone, LineIssue } from '@/lib/types';

const ACCEPTED_EXTENSIONS = '.zone,.txt,.bind,.db';

function lineIssues(fieldErrors: Record<string, string>): LineIssue[] {
  return Object.entries(fieldErrors)
    .map(([key, message]) => {
      const match = /^line (\d+)$/.exec(key);
      return { line: match ? Number(match[1]) : 0, message };
    })
    .sort((a, b) => a.line - b.line);
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface ZoneFileActionsProps {
  zone: HostedZone;
  onImported: () => void;
}

/** "Import zone file" button + modal and the "Export" dropdown for the records header. */
export default function ZoneFileActions({ zone, onImported }: ZoneFileActionsProps) {
  const flash = useFlash();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [importing, setImporting] = useState(false);
  const [issues, setIssues] = useState<LineIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const zoneName = displayZoneName(zone.name);

  const openModal = () => {
    setText('');
    setFiles([]);
    setIssues([]);
    setError(null);
    setImporting(false);
    setOpen(true);
  };

  const onFiles = async (selected: File[]) => {
    setFiles(selected);
    const file = selected[0];
    if (file) {
      setText(await file.text());
      setIssues([]);
      setError(null);
    }
  };

  const onImport = async () => {
    if (!text.trim()) {
      setError('Paste a zone file or choose a file to upload.');
      return;
    }
    setImporting(true);
    setIssues([]);
    setError(null);
    const progressId = flash.loading(`Importing zone file into ${zoneName}…`, `import-${zone.id}`);
    try {
      const result = await importZoneFile(zone.id, text);
      flash.dismiss(progressId);
      const skipped = result.skipped.length
        ? ` ${pluralize(result.skipped.length, 'line was', 'lines were')} skipped (${result.skipped
            .map((item) => `line ${item.line}: ${item.message}`)
            .join('; ')}).`
        : '';
      flash.success(`Imported ${result.created} records from zone file.${skipped}`);
      setOpen(false);
      onImported();
    } catch (err) {
      flash.dismiss(progressId);
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length > 0) {
        setIssues(lineIssues(err.fieldErrors));
      }
      setError(errorMessage(err));
      setImporting(false);
    }
  };

  const onExport = async (format: ExportFormat) => {
    setExporting(true);
    try {
      const { blob, filename } = await exportZone(zone.id, format);
      saveBlob(blob, filename);
      flash.success(
        `Exported ${zoneName} as ${format === 'json' ? 'JSON' : 'a BIND zone file'} (${filename}).`,
      );
    } catch (err) {
      flash.error(err, 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Button onClick={openModal} data-testid="import-zone-file">
        Import zone file
      </Button>
      <ButtonDropdown
        loading={exporting}
        items={[
          { id: 'json', text: 'Export as JSON' },
          { id: 'bind', text: 'Export as BIND zone file' },
        ]}
        onItemClick={({ detail }) => void onExport(detail.id as ExportFormat)}
        data-testid="export-dropdown"
      >
        Export
      </ButtonDropdown>
      <Modal
        visible={open}
        onDismiss={() => !importing && setOpen(false)}
        header="Import zone file"
        size="large"
        closeAriaLabel="Close modal"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setOpen(false)} disabled={importing}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => void onImport()}
                loading={importing}
                data-testid="confirm-import"
              >
                Import
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="l">
          <Box variant="p">
            Records are added to <b>{zoneName}</b>. The SOA and NS records at the zone apex are
            skipped because Route 53 manages them. If any line is invalid, nothing is imported.
          </Box>
          {error && (
            <Alert
              type="error"
              header="The zone file couldn't be imported"
              data-testid="import-error"
            >
              {issues.length > 0 ? (
                <ul>
                  {issues.map((issue) => (
                    <li key={`${issue.line}-${issue.message}`}>
                      {issue.line ? `Line ${issue.line}: ` : ''}
                      {issue.message}
                    </li>
                  ))}
                </ul>
              ) : (
                error
              )}
            </Alert>
          )}
          <FormField
            label="Upload a zone file"
            description={`Accepted file types: ${ACCEPTED_EXTENSIONS.replaceAll(',', ', ')}`}
            info={<InfoLink topic="import-zone-file" />}
          >
            <FileUpload
              value={files}
              onChange={({ detail }) => void onFiles(detail.value)}
              accept={ACCEPTED_EXTENSIONS}
              showFileSize
              showFileLastModified
              constraintText="The contents of the file are loaded into the text box below."
              i18nStrings={{
                uploadButtonText: (multiple) => (multiple ? 'Choose files' : 'Choose file'),
                dropzoneText: (multiple) =>
                  multiple ? 'Drop files to upload' : 'Drop file to upload',
                removeFileAriaLabel: (index) => `Remove file ${index + 1}`,
                limitShowFewer: 'Show fewer files',
                limitShowMore: 'Show more files',
                errorIconAriaLabel: 'Error',
                warningIconAriaLabel: 'Warning',
              }}
            />
          </FormField>
          <FormField
            label="Zone file"
            description="Paste the contents of a BIND zone file."
            stretch
          >
            <Textarea
              value={text}
              onChange={({ detail }) => setText(detail.value)}
              rows={15}
              spellcheck={false}
              placeholder={
                '$ORIGIN example.com.\n$TTL 300\nwww    IN  A     192.0.2.1\n@      IN  MX    10 mail.example.com.'
              }
              disabled={importing}
              ariaLabel="Zone file contents"
              data-testid="zone-file-text"
            />
          </FormField>
        </SpaceBetween>
      </Modal>
    </>
  );
}
