import { test, expect } from '@playwright/test';
import path from 'path';

const ASSETS_DIR = path.join(__dirname, 'test-assets');
const SAMPLE1_PDF = path.join(ASSETS_DIR, 'complex.pdf');
const SAMPLE2_PDF = path.join(ASSETS_DIR, 'form.pdf');
const SAMPLE1_JPG = path.join(ASSETS_DIR, 'sample1.jpg');
const SAMPLE2_JPG = path.join(ASSETS_DIR, 'sample2.jpg');

test.describe('PDF Tools Runtime Verification Suite', () => {
  test.beforeEach(async ({ page }) => {
    // Inject fake Clerk cookies to bypass the dev-browser handshake redirect
    await page.context().addCookies([{
      name: '__client_uat',
      value: '0',
      domain: '127.0.0.1',
      path: '/'
    }, {
      name: '__clerk_db_jwt',
      value: 'test_jwt',
      domain: '127.0.0.1',
      path: '/'
    }]);

    // Go to tools page
    await page.goto('http://127.0.0.1:3000/tools');
    await expect(page.getByRole('heading', { name: 'PDF Tools' })).toBeVisible();
  });

  test('Merge PDF tool works end-to-end', async ({ page }) => {
    await page.getByRole('button', { name: /Merge PDF/i }).first().click();
    await expect(page.getByText('Upload Multiple PDFs')).toBeVisible();

    const apiRequestPromise = page.waitForRequest(req => req.url().includes('/api/pdf/merge') && req.method() === 'POST');
    const apiResponsePromise = page.waitForResponse(res => res.url().includes('/api/pdf/merge') && res.status() === 200);

    await page.locator('input[type="file"]').setInputFiles([SAMPLE1_PDF, SAMPLE2_PDF]);
    await page.getByRole('button', { name: 'Merge PDFs' }).click();

    await apiRequestPromise;
    const res = await apiResponsePromise;
    expect(res.headers()['content-type']).toContain('application/pdf');

    await expect(page.getByText('Success!')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download File' }).click();
    
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^(output|merged|split|rotated|optimized)-\d+\.pdf$/); // ResultCard hardcodes prefix or uses tool.api.downloadFilenamePrefix
  });

  test('Split PDF tool works end-to-end', async ({ page }) => {
    await page.getByRole('button', { name: /Split PDF/i }).first().click();
    await expect(page.getByText('Upload PDF to Split')).toBeVisible();

    const apiRequestPromise = page.waitForRequest(req => req.url().includes('/api/pdf/split') && req.method() === 'POST');
    const apiResponsePromise = page.waitForResponse(res => res.url().includes('/api/pdf/split') && res.status() === 200);

    await page.locator('input[type="file"]').setInputFiles([SAMPLE2_PDF]);
    await page.locator('input[id="pages"]').fill('1');
    await page.getByRole('button', { name: 'Split PDF' }).click();

    await apiRequestPromise;
    const res = await apiResponsePromise;
    expect(res.headers()['content-type']).toContain('application/pdf');

    await expect(page.getByText('Success!')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download File' }).click();
    
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^(output|merged|split|rotated|optimized)-\d+\.pdf$/);
  });

  test('Rotate PDF tool works end-to-end', async ({ page }) => {
    await page.getByRole('button', { name: /Rotate PDF/i }).first().click();
    
    const apiRequestPromise = page.waitForRequest(req => req.url().includes('/api/pdf/rotate') && req.method() === 'POST');
    const apiResponsePromise = page.waitForResponse(res => res.url().includes('/api/pdf/rotate') && res.status() === 200);

    await page.locator('input[type="file"]').setInputFiles([SAMPLE1_PDF]);
    await page.getByRole('button', { name: 'Rotate PDF' }).click();

    await apiRequestPromise;
    const res = await apiResponsePromise;
    expect(res.headers()['content-type']).toContain('application/pdf');

    await expect(page.getByText('Success!')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download File' }).click();
    
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^(output|merged|split|rotated|optimized)-\d+\.pdf$/);
  });

  test('Optimize PDF tool works end-to-end', async ({ page }) => {
    await page.getByRole('button', { name: /Optimize PDF/i }).first().click();
    
    const apiRequestPromise = page.waitForRequest(req => req.url().includes('/api/pdf/compress') && req.method() === 'POST');
    const apiResponsePromise = page.waitForResponse(res => res.url().includes('/api/pdf/compress') && res.status() === 200);

    await page.locator('input[type="file"]').setInputFiles([SAMPLE1_PDF]);
    await page.getByRole('button', { name: 'Optimize PDF' }).click();

    await apiRequestPromise;
    const res = await apiResponsePromise;
    expect(res.headers()['content-type']).toContain('application/pdf');

    await expect(page.getByText('Success!')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download File' }).click();
    
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^(output|merged|split|rotated|optimized)-\d+\.pdf$/);
  });

  test('JPG to PDF tool works end-to-end', async ({ page }) => {
    await page.getByRole('button', { name: /JPG to PDF/i }).first().click();
    
    const apiRequestPromise = page.waitForRequest(req => req.url().includes('/api/pdf/from-image') && req.method() === 'POST');
    const apiResponsePromise = page.waitForResponse(res => res.url().includes('/api/pdf/from-image') && res.status() === 200);

    await page.locator('input[type="file"]').setInputFiles([SAMPLE1_JPG, SAMPLE2_JPG]);
    await page.getByRole('button', { name: 'Convert to PDF' }).click();

    await apiRequestPromise;
    const res = await apiResponsePromise;
    expect(res.headers()['content-type']).toContain('application/pdf');

    await expect(page.getByText('Success!')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download File' }).click();
    
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^output-\d+\.zip|pdf$/); // Could be zip if multiple images? Wait, JPG to PDF makes one PDF
  });
});
