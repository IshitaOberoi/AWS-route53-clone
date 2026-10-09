import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { createZoneViaApi, login, rows } from './helpers';

const SAMPLE_ZONE = join(__dirname, '..', '..', 'backend', 'tests', 'fixtures', 'sample.zone');

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('imports a BIND zone file and exports JSON and BIND', async ({ page }) => {
  const zone = await createZoneViaApi(page.request, 'example.com', { description: 'import' });
  await page.goto(`/route53/v2/hostedzones/${zone.id}`);

  await page.getByTestId('import-zone-file').click();
  await page
    .getByTestId('zone-file-text')
    .locator('textarea')
    .fill('ok IN A 192.0.2.1\nbad IN A 999.1.1.1\n');
  await page.getByTestId('confirm-import').click();
  await expect(page.getByTestId('import-error')).toContainText('Line 2: Invalid IPv4 address.');

  await page.locator('input[type=file]').setInputFiles(SAMPLE_ZONE);
  await expect(page.getByTestId('zone-file-text').locator('textarea')).toHaveValue(
    readFileSync(SAMPLE_ZONE, 'utf8'),
  );
  await page.getByTestId('confirm-import').click();
  await expect(page.getByText(/Imported 16 records from zone file\./)).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Records (18)' })).toBeVisible();

  for (const [item, filename, marker] of [
    ['Export as JSON', 'example.com.json', '"hostedZone"'],
    ['Export as BIND zone file', 'example.com.zone', '$ORIGIN example.com.'],
  ] as const) {
    await page.getByRole('button', { name: 'Export' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: item }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(filename);
    const path = await download.path();
    expect(readFileSync(path, 'utf8')).toContain(marker);
  }
});

test('dark mode persists across reloads', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Dark' }).click();
  await expect(page.locator('body')).toHaveClass(/awsui-dark-mode/);
  await page.reload();
  await expect(page.locator('body')).toHaveClass(/awsui-dark-mode/);

  // Shift+D toggles back.
  await page.locator('h1').first().click();
  await page.keyboard.press('Shift+D');
  await expect(page.locator('body')).not.toHaveClass(/awsui-dark-mode/);
});

test('keyboard shortcuts', async ({ page }) => {
  await expect(rows(page).first()).toBeVisible();
  await page.locator('h1').first().click();
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.keyboard.press('c'); // ignored while the modal is open
  await expect(page).toHaveURL(/\/hostedzones$/);
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  await page.keyboard.press('/');
  await expect(page.getByPlaceholder('Filter hosted zones by property or value')).toBeFocused();
  await page.keyboard.press('Escape');
  await page.locator('h1').first().click();

  await page.keyboard.press('c');
  await expect(page).toHaveURL(/\/hostedzones\/create$/);
  await page.locator('h1').first().click();
  await page.keyboard.press('g');
  await page.keyboard.press('d');
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('top navigation search opens a hosted zone', async ({ page }) => {
  await expect(rows(page).first()).toBeVisible();
  await page.keyboard.press('Alt+s');
  const search = page.getByRole('combobox', { name: 'Search hosted zones' });
  await expect(search).toBeFocused();
  await search.fill('shop-demo');
  await page.getByRole('option').filter({ hasText: 'shop-demo.net' }).first().click();
  await expect(page.locator('h1').first()).toHaveText('shop-demo.net');
});
