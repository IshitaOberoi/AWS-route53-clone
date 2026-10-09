import { expect, test } from '@playwright/test';

import { login } from './helpers';

const PAGES: [string, string][] = [
  ['/route53/v2/dashboard', 'Dashboard'],
  ['/route53/v2/trafficpolicies', 'Traffic policies'],
  ['/route53/v2/healthchecks', 'Health checks'],
  ['/route53/v2/resolver/vpcs', 'Resolver: VPCs'],
  ['/route53/v2/resolver/rules', 'Resolver: Rules'],
  ['/route53/v2/profiles', 'Profiles'],
  ['/route53/v2/cidrcollections', 'CIDR collections'],
  ['/route53/v2/policyrecords', 'Policy records'],
  ['/route53/v2/domains', 'Registered domains'],
  ['/route53/v2/domainrequests', 'Requests'],
  ['/route53/v2/dnsfirewall/rule-groups', 'DNS Firewall: Rule groups'],
];

test('every placeholder section shows a Coming Soon page', async ({ page }) => {
  await login(page);
  for (const [path, title] of PAGES) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByTestId('coming-soon')).toHaveText('Coming soon');
  }
});

test('side navigation opens the right pages', async ({ page }) => {
  await login(page);
  const nav = page.getByRole('navigation', { name: 'Side navigation' });
  await nav.getByRole('link', { name: 'Health checks', exact: true }).click();
  await expect(page).toHaveURL(/\/healthchecks$/);
  await nav.getByRole('link', { name: 'Hosted zones', exact: true }).click();
  await expect(page).toHaveURL(/\/hostedzones$/);
});

test('unknown pages show a 404', async ({ page }) => {
  await login(page);
  await page.goto('/route53/v2/not-a-real-page');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});
