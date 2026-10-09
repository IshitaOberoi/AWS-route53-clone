'use client';

import Box from '@cloudscape-design/components/box';
import HelpPanel from '@cloudscape-design/components/help-panel';
import Link from '@cloudscape-design/components/link';
import type { ReactNode } from 'react';

export type HelpTopic =
  | 'hosted-zones'
  | 'create-hosted-zone'
  | 'edit-hosted-zone'
  | 'hosted-zone-details'
  | 'hosted-zone-type'
  | 'vpcs'
  | 'tags'
  | 'records'
  | 'create-record'
  | 'record-name'
  | 'record-type'
  | 'record-value'
  | 'alias'
  | 'ttl'
  | 'routing-policy'
  | 'import-zone-file'
  | 'dnssec'
  | 'coming-soon';

interface HelpEntry {
  title: string;
  body: ReactNode;
  links?: { text: string; href: string }[];
}

const DOCS = 'https://docs.aws.amazon.com/Route53/latest/DeveloperGuide';

const HELP: Record<HelpTopic, HelpEntry> = {
  'hosted-zones': {
    title: 'Hosted zones',
    body: (
      <>
        <p>
          A hosted zone is a container for records, and records contain information about how you
          want to route traffic for a specific domain, such as example.com, and its subdomains
          (acme.example.com, zenith.example.com).
        </p>
        <p>
          A <b>public hosted zone</b> determines how traffic is routed on the internet. A{' '}
          <b>private hosted zone</b> determines how traffic is routed within one or more Amazon
          VPCs.
        </p>
        <p>
          You can delete a hosted zone only when it contains nothing but the default NS and SOA
          records.
        </p>
      </>
    ),
    links: [{ text: 'Working with hosted zones', href: `${DOCS}/hosted-zones-working-with.html` }],
  },
  'create-hosted-zone': {
    title: 'Create hosted zone',
    body: (
      <>
        <p>
          When you create a hosted zone, Route 53 automatically creates a name server (NS) record
          and a start of authority (SOA) record for the zone.
        </p>
        <p>
          The NS record lists the four name servers that are the authoritative name servers for your
          hosted zone. To route traffic for your domain, update the name servers at your domain
          registrar to use these four name servers.
        </p>
      </>
    ),
    links: [{ text: 'Creating a public hosted zone', href: `${DOCS}/CreatingHostedZone.html` }],
  },
  'edit-hosted-zone': {
    title: 'Edit hosted zone',
    body: (
      <p>
        You can change the description, tags and, for private hosted zones, the VPCs that are
        associated with the hosted zone. The domain name and the type of a hosted zone can&apos;t be
        changed after it&apos;s created.
      </p>
    ),
  },
  'hosted-zone-details': {
    title: 'Hosted zone details',
    body: (
      <>
        <p>
          The details of a hosted zone include the hosted zone ID, the name servers that Route 53
          assigned to the zone, and the number of records it contains.
        </p>
        <p>Use the Records tab to create, edit, import, export and delete records.</p>
      </>
    ),
  },
  'hosted-zone-type': {
    title: 'Type',
    body: (
      <>
        <p>
          <b>Public hosted zone</b> — Determines how traffic is routed on the internet.
        </p>
        <p>
          <b>Private hosted zone</b> — Determines how traffic is routed within one or more Amazon
          VPCs. You must associate at least one VPC.
        </p>
      </>
    ),
  },
  vpcs: {
    title: 'VPCs to associate with the hosted zone',
    body: (
      <p>
        Route 53 Resolver uses a private hosted zone to route DNS queries only for the VPCs that you
        associate with the hosted zone. A private hosted zone must always be associated with at
        least one VPC.
      </p>
    ),
  },
  tags: {
    title: 'Tags',
    body: (
      <p>
        A tag is a label that you assign to an AWS resource. Each tag consists of a key and an
        optional value. You can add up to 50 tags to a hosted zone.
      </p>
    ),
  },
  records: {
    title: 'Records',
    body: (
      <>
        <p>
          Records define how you want to route traffic for a domain or subdomain. Each record
          includes a name, a type, a routing policy and the values or the alias target that Route 53
          returns in response to DNS queries.
        </p>
        <p>
          The NS and SOA records that Route 53 created with the hosted zone can be edited but not
          deleted.
        </p>
      </>
    ),
    links: [{ text: 'Working with records', href: `${DOCS}/rrsets-working-with.html` }],
  },
  'create-record': {
    title: 'Create record',
    body: (
      <>
        <p>
          Use quick create to add one or more records at once. Choose <b>Add another record</b> to
          create several records in a single change; either all of them are created or none are.
        </p>
        <p>
          For A, AAAA and CNAME records you can turn on <b>Alias</b> to route traffic to an AWS
          resource or another record in this hosted zone.
        </p>
      </>
    ),
  },
  'record-name': {
    title: 'Record name',
    body: (
      <p>
        Enter the name of the domain or subdomain that you want to route traffic for. Keep it blank
        to create a record for the root domain. You can use an asterisk (*) as the leftmost label to
        create a wildcard record.
      </p>
    ),
  },
  'record-type': {
    title: 'Record type',
    body: (
      <p>
        The DNS record type determines the format of the value. For example, an A record routes
        traffic to an IPv4 address and an MX record specifies mail servers.
      </p>
    ),
    links: [{ text: 'Supported DNS record types', href: `${DOCS}/ResourceRecordTypes.html` }],
  },
  'record-value': {
    title: 'Value',
    body: (
      <p>
        Enter one value per line. The required format depends on the record type, for example an
        IPv4 address for A records or <code>10 mail.example.com</code> for MX records.
      </p>
    ),
  },
  alias: {
    title: 'Alias',
    body: (
      <p>
        Alias records let you route traffic to selected AWS resources, such as CloudFront
        distributions and Amazon S3 buckets, or to another record in the same hosted zone. Unlike a
        CNAME record, you can create an alias record at the top node of a DNS namespace (the zone
        apex). Alias records don&apos;t have a TTL.
      </p>
    ),
  },
  ttl: {
    title: 'TTL (seconds)',
    body: (
      <p>
        The amount of time, in seconds, that DNS recursive resolvers cache information about this
        record. A longer value reduces query costs; a shorter value lets changes propagate faster.
        Recommended values are 60 to 172800 (two days).
      </p>
    ),
  },
  'routing-policy': {
    title: 'Routing policy',
    body: (
      <ul>
        <li>
          <b>Simple routing</b> — a single resource.
        </li>
        <li>
          <b>Weighted</b> — route traffic to multiple resources in proportions that you specify.
        </li>
        <li>
          <b>Geolocation</b> — route traffic based on the location of your users.
        </li>
        <li>
          <b>Latency</b> — route traffic to the Region with the lowest latency.
        </li>
        <li>
          <b>Failover</b> — active-passive failover.
        </li>
        <li>
          <b>Multivalue answer</b> — respond with up to eight healthy records selected at random.
        </li>
      </ul>
    ),
    links: [{ text: 'Choosing a routing policy', href: `${DOCS}/routing-policy.html` }],
  },
  'import-zone-file': {
    title: 'Import zone file',
    body: (
      <p>
        Paste a zone file in BIND format or upload one. Route 53 skips the SOA and NS records at the
        zone apex because it manages them. If any line is invalid, nothing is imported.
      </p>
    ),
  },
  dnssec: {
    title: 'DNSSEC signing',
    body: <p>DNSSEC signing isn&apos;t available in this clone.</p>,
  },
  'coming-soon': {
    title: 'Coming soon',
    body: (
      <p>
        This part of the Route 53 console is not implemented in this clone. Hosted zones and records
        are fully functional.
      </p>
    ),
  },
};

export function HelpContent({ topic }: { topic: HelpTopic | null }) {
  const entry = HELP[topic ?? 'hosted-zones'];
  return (
    <HelpPanel
      header={<h2>{entry.title}</h2>}
      footer={
        entry.links ? (
          <div>
            <h3>Learn more</h3>
            <ul>
              {entry.links.map((link) => (
                <li key={link.href}>
                  <Link external href={link.href}>
                    {link.text}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : undefined
      }
    >
      <Box variant="div">{entry.body}</Box>
    </HelpPanel>
  );
}
