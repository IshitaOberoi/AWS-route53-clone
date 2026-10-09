import { expect, test } from '@playwright/test';

import { chooseOption, createZoneViaApi, findZone, login, rows, uniqueName } from './helpers';

const TYPES: { type: string; label: string; name: string; good: string; bad: string }[] = [
  {
    type: 'A',
    label: 'A – Routes traffic to an IPv4',
    name: 'web',
    good: '192.0.2.10\n192.0.2.11',
    bad: '999.0.0.1',
  },
  {
    type: 'AAAA',
    label: 'AAAA – Routes traffic to an IPv6',
    name: 'v6',
    good: '2001:db8::10',
    bad: '2001:db8::zz',
  },
  {
    type: 'CNAME',
    label: 'CNAME – Routes traffic to another domain',
    name: 'blog',
    good: 'web.example.net',
    bad: 'bad name!',
  },
  {
    type: 'MX',
    label: 'MX – Specifies mail servers',
    name: '',
    good: '10 mail.example.net',
    bad: 'mail.example.net',
  },
  {
    type: 'TXT',
    label: 'TXT – Used to verify email senders',
    name: '',
    good: '"v=spf1 -all"',
    bad: '"unterminated',
  },
  {
    type: 'PTR',
    label: 'PTR – Maps an IP address',
    name: '10',
    good: 'host.example.net',
    bad: 'not valid!',
  },
  {
    type: 'SRV',
    label: 'SRV – Application-specific values',
    name: '_sip._tcp',
    good: '1 10 5060 sip.example.net.',
    bad: '1 10 sip.example.net.',
  },
  {
    type: 'NS',
    label: 'NS – Name servers for a hosted zone',
    name: 'dev',
    good: 'ns1.example.net.',
    bad: 'bad_ns!',
  },
  {
    type: 'CAA',
    label: 'CAA – Restricts CAs',
    name: '',
    good: '0 issue "amazon.com"',
    bad: '0 issue amazon.com',
  },
];

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('creates one record of each of the 9 types, with inline validation first @smoke', async ({
  page,
}) => {
  const zone = await createZoneViaApi(page.request, uniqueName('records'));
  await page.goto(`/route53/v2/hostedzones/${zone.id}/records/create`);

  for (const [index, item] of TYPES.entries()) {
    if (index > 0) await page.getByRole('button', { name: 'Add another record' }).click();
    await chooseOption(page, `record-${index}-type`, item.label);
    await page
      .getByTestId(`record-${index}-name`)
      .locator('input')
      .fill(item.name || `bad-${index}`);
    await page.getByTestId(`record-${index}-value`).locator('textarea').fill(item.bad);
  }
  await page.getByTestId('create-records-submit').click();
  for (const index of TYPES.keys()) {
    await expect(page.getByTestId(`record-container-${index}`)).toContainText('Line 1:');
  }

  for (const [index, item] of TYPES.entries()) {
    await page.getByTestId(`record-${index}-name`).locator('input').fill(item.name);
    await page.getByTestId(`record-${index}-value`).locator('textarea').fill(item.good);
  }
  await page.getByTestId('create-records-submit').click();
  await expect(page).toHaveURL(new RegExp(`/hostedzones/${zone.id}$`));
  await expect(page.getByText('9 records were successfully created.')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Records (11)' })).toBeVisible();

  // Persisted.
  const list = (await (
    await page.request.get(`/api/hosted-zones/${zone.id}/records?page_size=100`)
  ).json()) as { items: { type: string }[] };
  for (const item of TYPES)
    expect(list.items.some((record) => record.type === item.type)).toBe(true);
});

test('rejects CNAME at the apex and duplicates', async ({ page }) => {
  const zone = await createZoneViaApi(page.request, uniqueName('rules'));
  await page.goto(`/route53/v2/hostedzones/${zone.id}/records/create`);
  await chooseOption(page, 'record-0-type', 'CNAME – Routes traffic to another domain');
  await page.getByTestId('record-0-value').locator('textarea').fill('other.example.com');
  await page.getByTestId('create-records-submit').click();
  await expect(page.getByText(/is not permitted at apex/).first()).toBeVisible();

  await page.request.post(`/api/hosted-zones/${zone.id}/records`, {
    data: { records: [{ name: 'www', type: 'A', values: ['192.0.2.1'] }] },
  });
  await chooseOption(page, 'record-0-type', 'A – Routes traffic to an IPv4');
  await page.getByTestId('record-0-name').locator('input').fill('www');
  await page.getByTestId('record-0-value').locator('textarea').fill('192.0.2.2');
  await page.getByTestId('create-records-submit').click();
  await expect(page.getByText(/but it already exists/).first()).toBeVisible();
});

test('edits a record in the split panel', async ({ page }) => {
  const zone = await createZoneViaApi(page.request, uniqueName('edit-record'));
  await page.request.post(`/api/hosted-zones/${zone.id}/records`, {
    data: { records: [{ name: 'app', type: 'A', values: ['192.0.2.1'] }] },
  });
  await page.goto(`/route53/v2/hostedzones/${zone.id}`);
  const row = rows(page).filter({ hasText: '192.0.2.1' });
  await row.locator('input[type=checkbox]').dispatchEvent('click');
  await page.getByTestId('edit-record').click();
  await page.getByTestId('edit-value').locator('textarea').fill('192.0.2.77');
  await page.getByTestId('edit-ttl').locator('input').fill('60');
  await page.getByTestId('save-record').click();
  await expect(page.getByText(/Record app\..* was successfully updated\./)).toBeVisible();
  await expect(rows(page).filter({ hasText: '192.0.2.77' })).toContainText('60');
});

test('bulk deletes records; default SOA/NS cannot be selected', async ({ page }) => {
  const zone = await createZoneViaApi(page.request, uniqueName('bulk'));
  await page.request.post(`/api/hosted-zones/${zone.id}/records`, {
    data: {
      records: [
        { name: 'one', type: 'A', values: ['192.0.2.1'] },
        { name: 'two', type: 'A', values: ['192.0.2.2'] },
        { name: 'three', type: 'TXT', values: ['keep me'] },
      ],
    },
  });
  await page.goto(`/route53/v2/hostedzones/${zone.id}`);
  await expect(
    rows(page).filter({ hasText: 'SOA' }).locator('input[type=checkbox]'),
  ).toBeDisabled();
  await expect(
    rows(page).filter({ hasText: 'NS' }).first().locator('input[type=checkbox]'),
  ).toBeDisabled();

  for (const text of ['192.0.2.1', '192.0.2.2']) {
    await rows(page)
      .filter({ hasText: text })
      .locator('input[type=checkbox]')
      .dispatchEvent('click');
  }
  await expect(page.getByText('(2 selected)')).toBeVisible();
  await page.getByTestId('delete-records').click();
  await page.getByTestId('confirm-delete-records').click();
  await expect(page.getByText('Successfully deleted 2 records.')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Records (3)' })).toBeVisible();
});

test('searches, filters by type and paginates records', async ({ page }) => {
  const shop = await findZone(page.request, 'shop-demo.net');
  await page.goto(`/route53/v2/hostedzones/${shop.id}`);
  await expect(rows(page)).toHaveCount(10);
  await page.getByRole('button', { name: 'Page 2 of all pages' }).click();
  await expect(page).toHaveURL(/page=2/);

  await page.goto(`/route53/v2/hostedzones/${shop.id}?type=MX`);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('MX');

  await page.goto(`/route53/v2/hostedzones/${shop.id}`);
  const filter = page.getByPlaceholder('Filter records by property or value');
  await filter.fill('web-1');
  await filter.press('Enter');
  await expect(page).toHaveURL(/q=web-1/);
  await expect(rows(page)).toHaveCount(10); // web-10 … web-19
});
