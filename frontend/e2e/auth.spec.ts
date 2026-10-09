import { expect, test } from '@playwright/test';

import { DEMO, login } from './helpers';

test.describe('authentication', () => {
  test('protected pages redirect to login @smoke', async ({ page }) => {
    await page.goto('/route53/v2/hostedzones');
    await expect(page).toHaveURL(/\/login\?next=%2Froute53%2Fv2%2Fhostedzones/);
    await expect(page.getByText('Demo environment with mocked authentication')).toBeVisible();
  });

  test('rejects a wrong password', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Username').fill(DEMO.username);
    await page.getByLabel('Password').fill('wrong-password');
    await page.keyboard.press('Enter');
    await expect(page.getByText('Invalid username or password.', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('login, session survives reload, logout @smoke', async ({ page }) => {
    await login(page);
    await expect(page.getByRole('heading', { level: 1, name: /Hosted zones/ })).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/\/route53\/v2\/hostedzones/);
    await expect(page.getByRole('button', { name: 'Account menu' })).toContainText('Demo User');

    // Visiting /login while signed in goes back to the console.
    await page.goto('/login');
    await expect(page).toHaveURL(/\/route53\/v2\/hostedzones/);

    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto('/route53/v2/hostedzones');
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  test('login returns to the requested page', async ({ page }) => {
    await page.goto('/route53/v2/healthchecks');
    await page.getByLabel('Username').fill(DEMO.username);
    await page.getByLabel('Password').fill(DEMO.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/route53\/v2\/healthchecks$/);
  });
});
