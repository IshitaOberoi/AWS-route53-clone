import { expect } from '@playwright/test';
import type { APIRequestContext, Locator, Page } from '@playwright/test';

export const DEMO = { username: 'demo', password: 'demo1234' };

export async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(DEMO.username);
  await page.getByLabel('Password').fill(DEMO.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/route53/v2/hostedzones');
}

/** Visible table body rows (Cloudscape keeps hidden tables, e.g. in closed modals, in the DOM). */
export function rows(page: Page): Locator {
  return page.locator('tbody tr').filter({ visible: true });
}

export function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.test`;
}

export interface ZoneJson {
  id: string;
  name: string;
}

export async function createZoneViaApi(
  request: APIRequestContext,
  name: string,
  extra: Record<string, unknown> = {},
): Promise<ZoneJson> {
  const response = await request.post('/api/hosted-zones', { data: { name, ...extra } });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as ZoneJson;
}

export async function findZone(request: APIRequestContext, name: string): Promise<ZoneJson> {
  const response = await request.get(`/api/hosted-zones?search=${encodeURIComponent(name)}`);
  const body = (await response.json()) as { items: ZoneJson[] };
  const zone = body.items.find((item) => item.name === `${name}.`);
  if (!zone) throw new Error(`Zone ${name} not found`);
  return zone;
}

/** Picks an option from a Cloudscape Select identified by its test id. */
export async function chooseOption(page: Page, testId: string, optionText: string): Promise<void> {
  await page.getByTestId(testId).getByRole('button').first().click();
  await page.getByRole('option').filter({ hasText: optionText }).first().click();
}
