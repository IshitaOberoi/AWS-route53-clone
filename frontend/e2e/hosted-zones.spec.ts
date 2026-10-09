import { expect, test } from '@playwright/test';

import { createZoneViaApi, findZone, login, rows, uniqueName } from './helpers';

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('lists, paginates and sorts hosted zones', async ({ page }) => {
  await expect(rows(page)).toHaveCount(10);
  await expect(page.locator('h1').first()).toContainText(/\(\d+\)/);
  await page.getByRole('button', { name: 'Page 2 of all pages' }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(rows(page).first()).toBeVisible();

  await page.goto('/route53/v2/hostedzones?order=desc');
  const first = await rows(page).first().locator('th').first().innerText();
  const last = await rows(page).last().locator('th').first().innerText();
  expect(first.localeCompare(last)).toBeGreaterThan(0);

  // Page size preference (persisted in localStorage)
  await page.goto('/route53/v2/hostedzones');
  await page.getByRole('button', { name: 'Preferences' }).click();
  await page.getByText('25 hosted zones').click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect.poll(async () => rows(page).count()).toBeGreaterThan(10);
});

test('searches and filters hosted zones', async ({ page }) => {
  const filter = page.getByPlaceholder('Filter hosted zones by property or value');
  await filter.fill('acme');
  await filter.press('Enter');
  await expect(page).toHaveURL(/q=acme/);
  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByText('2 matches').first()).toBeVisible();

  await page.goto('/route53/v2/hostedzones?type=Private');
  await expect(rows(page).first()).toContainText('Private');
  for (const row of await rows(page).all()) await expect(row).toContainText('Private');

  await page.goto('/route53/v2/hostedzones?q=does-not-exist');
  await expect(page.getByText('No matches')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filter' }).last().click();
  await expect(page).not.toHaveURL(/q=/);
});

test('creates a public hosted zone with default NS and SOA @smoke', async ({ page }) => {
  const name = uniqueName('public');
  await page.getByTestId('create-hosted-zone').click();
  await page.getByRole('button', { name: 'Create hosted zone' }).click();
  await expect(page.getByText('Enter a domain name.')).toBeVisible();

  await page.getByLabel('Domain name').fill(name);
  await page.getByLabel('Description').fill('Created by Playwright');
  await page.getByRole('button', { name: 'Create hosted zone' }).click();
  await expect(page).toHaveURL(/\/hostedzones\/Z[A-Z0-9]+$/);
  await expect(page.getByText(`Hosted zone ${name} was successfully created.`)).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Records (2)' })).toBeVisible();
  await expect(rows(page).filter({ hasText: 'NS' }).first()).toBeVisible();
  await expect(rows(page).filter({ hasText: 'SOA' }).first()).toBeVisible();

  // Persisted: reload and it's still there.
  await page.reload();
  await expect(page.locator('h1').first()).toHaveText(name);
});

test('private hosted zone requires a VPC', async ({ page }) => {
  await page.goto('/route53/v2/hostedzones/create');
  await page.getByLabel('Domain name').fill(uniqueName('private'));
  await page.getByText('Private hosted zone', { exact: true }).click();
  await page.getByRole('button', { name: 'Create hosted zone' }).click();
  await expect(page.getByText('Choose a Region.')).toBeVisible();

  await page.getByRole('button', { name: /Region for VPC 1/ }).click();
  await page.getByRole('option').filter({ hasText: 'us-east-1' }).first().click();
  await page.getByRole('button', { name: /VPC ID for VPC 1/ }).click();
  await page.getByRole('option').first().click();
  await page.getByRole('button', { name: 'Create hosted zone' }).click();
  await expect(page).toHaveURL(/\/hostedzones\/Z[A-Z0-9]+$/);
});

test('edits description and tags', async ({ page }) => {
  const name = uniqueName('edit');
  const zone = await createZoneViaApi(page.request, name);
  await page.goto(`/route53/v2/hostedzones/${zone.id}/edit`);
  await expect(page.getByLabel('Domain name')).toHaveValue(name);
  await page.getByLabel('Description').fill('Edited in e2e');
  await page.getByRole('button', { name: 'Add new tag' }).click();
  await page.getByPlaceholder('Enter key').last().fill('Team');
  await page.getByPlaceholder('Enter value').last().fill('platform');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(new RegExp(`/hostedzones/${zone.id}$`));
  await expect(page.getByText(`Hosted zone ${name} was successfully updated.`)).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Hosted zone tags (1)' })).toBeVisible();

  const body = (await (await page.request.get(`/api/hosted-zones/${zone.id}`)).json()) as {
    description: string;
    tags: { key: string; value: string }[];
  };
  expect(body.description).toBe('Edited in e2e');
  expect(body.tags).toEqual([{ key: 'Team', value: 'platform' }]);
});

test('delete: non-empty zone shows the error, empty zone is deleted', async ({ page }) => {
  const example = await findZone(page.request, 'example.com');
  await page.goto(`/route53/v2/hostedzones?id=${example.id}`);
  await rows(page).first().locator('input[type=radio]').check({ force: true });
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByTestId('confirm-delete-zone')).toBeDisabled();
  await page.getByLabel('Type delete to confirm').fill('delete');
  await page.getByTestId('confirm-delete-zone').click();
  await expect(
    page.getByText(
      'The specified hosted zone contains non-required resource record sets and so cannot be deleted.',
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  const name = uniqueName('delete');
  const empty = await createZoneViaApi(page.request, name);
  await page.goto(`/route53/v2/hostedzones?id=${empty.id}`);
  await rows(page).first().locator('input[type=radio]').check({ force: true });
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByLabel('Type delete to confirm').fill('delete');
  await page.getByTestId('confirm-delete-zone').click();
  await expect(page.getByText(`Successfully deleted hosted zone ${name}.`)).toBeVisible();
  expect((await page.request.get(`/api/hosted-zones/${empty.id}`)).status()).toBe(404);
});

test('manages tags from the hosted zone tags tab', async ({ page }) => {
  const name = uniqueName('tags');
  const zone = await createZoneViaApi(page.request, name);
  await page.goto(`/route53/v2/hostedzones/${zone.id}`);
  await page.getByRole('tab', { name: 'Hosted zone tags (0)' }).click();
  await page.getByRole('button', { name: 'Manage tags' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Manage tags' });
  await dialog.getByRole('button', { name: 'Add new tag' }).click();
  await dialog.getByPlaceholder('Enter key').last().fill('Owner');
  await dialog.getByPlaceholder('Enter value').last().fill('dns-team');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    page.getByText(`Tags for hosted zone ${name} were successfully updated.`),
  ).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Hosted zone tags (1)' })).toBeVisible();
  await expect(rows(page).filter({ hasText: 'dns-team' })).toBeVisible();
});
