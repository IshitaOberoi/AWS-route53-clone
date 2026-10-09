'use client';

import Link from '@cloudscape-design/components/link';

import type { HelpTopic } from '@/components/shell/help-content';
import { useShell } from '@/context/ShellContext';

/** The "Info" link next to headers and form labels; opens the help panel on a topic. */
export default function InfoLink({ topic, ariaLabel }: { topic: HelpTopic; ariaLabel?: string }) {
  const { openHelp } = useShell();
  return (
    <Link variant="info" ariaLabel={ariaLabel ?? 'Information'} onFollow={() => openHelp(topic)}>
      Info
    </Link>
  );
}
