import { expect, test } from '@playwright/test';

test('production is the default and WETH deposit is official-registry', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ERC-7730 toolkit' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Production' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Exploration' })).not.toBeChecked();
  await expect(page.getByLabel('Transaction calldata')).toBeVisible();
  await expect(page.getByLabel('Transaction hash')).toBeVisible();

  await page.getByText('Load example').click();
  await page.getByRole('button', { name: 'WETH deposit' }).click();
  await page.locator('#decode-btn').click();

  await expect(page.locator('#result')).toContainText('official-registry', { timeout: 25_000 });
  await expect(page.locator('#code-output')).toContainText('officialOnlyPolicy');
  await expect(page.locator('#code-output')).not.toContainText('sourcifyVerifiedAbiLoader');
  await expect(page.locator('#with-erc7730')).toContainText('Wrap');
  await expect(page.locator('#without-erc7730')).toContainText('0xd0e30db0');
});

test('loads a transaction hash and shares the query', async ({ page }) => {
  const hash = `0x${'ab'.repeat(32)}`;
  await page.route('https://eth.llamarpc.com/**', async (route) => {
    const body = route.request().postDataJSON() as { method?: string; id?: number } | null;
    if (body?.method === 'eth_getTransactionByHash') {
      await route.fulfill({
        json: {
          jsonrpc: '2.0',
          id: body.id ?? 1,
          result: {
            hash,
            from: '0x0000000000000000000000000000000000000001',
            to: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            input: '0xd0e30db0',
            value: '0xde0b6b3a7640000',
            nonce: '0x1',
            gas: '0x5208',
            gasPrice: '0x1',
            blockHash: null,
            blockNumber: null,
            transactionIndex: null,
          },
        },
      });
      return;
    }
    await route.continue();
  });

  await page.goto('/');
  await page.locator('#tx-hash').fill(hash);
  await page.getByRole('button', { name: 'Load transaction' }).click();
  await expect(page.locator('#with-erc7730')).toContainText('Wrap', { timeout: 25_000 });
  await expect(page.locator('#without-erc7730')).toContainText('0xd0e30db0');
  await page.getByRole('button', { name: 'Share' }).click();
  await expect(page).toHaveURL(/chainId=1/);
  await expect(page).toHaveURL(/to=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/);
  await expect(page).toHaveURL(/data=0xd0e30db0/);
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
