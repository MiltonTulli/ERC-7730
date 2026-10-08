import { expect, test } from '@playwright/test';

test('production is the default and WETH deposit is official-registry', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ERC-7730 toolkit' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Production' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Exploration' })).not.toBeChecked();
  await expect(page.getByLabel('Transaction calldata')).toBeVisible();
  await expect(page.getByText('transaction hash')).toHaveCount(0);

  await page.getByText('Load example').click();
  await page.getByRole('button', { name: 'WETH deposit' }).click();
  await page.locator('#decode-btn').click();

  await expect(page.locator('#result')).toContainText('official-registry', { timeout: 25_000 });
  await expect(page.locator('#code-output')).toContainText('officialOnlyPolicy');
  await expect(page.locator('#code-output')).not.toContainText('sourcifyVerifiedAbiLoader');
});

test('malformed calldata shows InvalidInputError', async ({ page }) => {
  await page.goto('/');
  await page.locator('#calldata').fill('0x1234');
  await page.locator('#contract').fill('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
  await page.locator('#decode-btn').click();
  await expect(page.locator('#result')).toContainText('INVALID_CALLDATA');
});

test('exploration snippet follows the selected mode', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('radio', { name: 'Exploration' }).check();
  await page.getByText('Load example').click();
  await page.getByRole('button', { name: 'WETH deposit' }).click();
  await page.locator('#decode-btn').click();
  await expect(page.locator('#code-output')).toContainText('officialOrLocalPolicy', {
    timeout: 25_000,
  });
  await expect(page.locator('#code-output')).toContainText('sourcifyVerifiedAbiLoader');
  await expect(page.locator('#code-output')).not.toContainText('officialOnlyPolicy');
});
