import { test, expect } from '@playwright/test';

test('single-input homepage, real shortening, copying, themes, and motion', async ({ page, context }) => {
  const errors = []; page.on('pageerror', err => errors.push(err.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'What would you like to shorten?' })).toBeVisible();
  await expect(page.locator('#home input:visible')).toHaveCount(1);
  await page.getByRole('textbox', { name: 'Website address to shorten' }).fill('example.com/browser-test');
  await page.getByRole('button', { name: 'Shorten link' }).click();
  await expect(page.locator('#shorten-result')).toBeVisible();
  const shortUrl = await page.locator('#result-url').getAttribute('href');
  const response = await page.request.get(shortUrl, { maxRedirects: 0 }); expect(response.status()).toBe(302); expect(response.headers().location).toBe('https://example.com/browser-test');
  await page.getByRole('button', { name: 'Copy short link' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(shortUrl);
  for (const theme of ['Dusk', 'Ocean', 'Forest', 'Ember', 'Meadow']) {
    await page.getByRole('button', { name: theme, exact: true }).click(); await expect(page.locator('body')).toHaveAttribute('data-theme', theme.toLowerCase());
  }
  await page.getByRole('button', { name: 'Pause background animation' }).click(); await expect(page.locator('body')).toHaveClass(/motion-paused/);
  await page.reload(); await expect(page.locator('body')).toHaveClass(/motion-paused/);
  await page.getByRole('button', { name: 'Play background animation' }).click();
  expect(errors).toEqual([]);
});

test('signup, saved links, title editing, visibility, reordering, profile theme, logout, and login', async ({ page }) => {
  const username = `browser_${Date.now().toString(36)}`;
  const errors = []; page.on('pageerror', err => errors.push(err.message));
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Website address to shorten' }).fill('https://example.com/my-website'); await page.getByRole('button', { name: 'Shorten link' }).click();
  await expect(page.locator('#shorten-result')).toBeVisible();
  await page.getByRole('button', { name: 'Keep this link in your little space' }).click();
  await page.getByRole('textbox', { name: 'Your username' }).fill(username);
  await page.getByRole('textbox', { name: 'Email address' }).fill(`${username}@example.com`);
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill('a-little-good-password');
  await page.getByRole('button', { name: 'Create your space' }).click();
  await expect(page).toHaveURL(/dashboard/); await expect(page.locator('.saved-link')).toHaveCount(1);
  await page.locator('#add-url').fill('https://github.com/example'); await page.getByRole('button', { name: 'Add ↗' }).click(); await expect(page.locator('.saved-link')).toHaveCount(2);
  await page.getByRole('button', { name: 'Edit example.com', exact: true }).click();
  await page.getByRole('textbox', { name: 'Link title' }).fill('My portfolio'); await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: 'My portfolio' })).toBeVisible();
  await page.getByRole('button', { name: 'Move github.com up', exact: true }).click(); await expect(page.locator('.saved-link').first().getByRole('heading')).toHaveText('github.com');
  await page.getByRole('button', { name: 'Edit github.com', exact: true }).click(); await page.getByLabel('Show on my public profile').uncheck(); await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Hidden from profile')).toBeVisible();
  await page.getByRole('textbox', { name: 'Your name', exact: true }).fill('A little test');
  await page.getByRole('textbox', { name: 'A little about you' }).fill('My favorite corners of the internet.');
  await page.locator('[data-profile-theme=dusk]').click(); await page.getByRole('button', { name: 'Save your space' }).click();
  await expect(page.getByRole('status')).toContainText('just how you like it');
  await page.reload(); await expect(page.locator('body')).toHaveAttribute('data-theme', 'dusk');
  await page.goto(`/u/${username}`); await expect(page.getByRole('heading', { name: 'A little test' })).toBeVisible(); await expect(page.locator('.public-link')).toHaveCount(1); await expect(page.locator('.public-link')).toContainText('My portfolio'); await expect(page.locator('body')).toHaveAttribute('data-theme', 'dusk');
  await page.goto('/dashboard'); await page.getByRole('button', { name: 'Edit github.com', exact: true }).click(); await page.getByRole('button', { name: 'Remove from my space' }).click(); await page.getByRole('button', { name: 'Click again to remove' }).click(); await expect(page.locator('.saved-link')).toHaveCount(1);
  await page.getByRole('button', { name: 'Log out' }).click(); await expect(page).toHaveURL(/\/$/);
  await page.getByRole('button', { name: 'Log in or create an account', exact: true }).click(); await page.getByRole('textbox', { name: 'Email address' }).fill(`${username}@example.com`); await page.getByRole('textbox', { name: 'Password', exact: true }).fill('a-little-good-password'); await page.locator('#auth-submit').click(); await expect(page).toHaveURL(/dashboard/); await expect(page.locator('.saved-link')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('mobile layout and error states remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await expect(page.getByRole('button', { name: 'Shorten link' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#long-url').fill('javascript:alert(1)'); await page.getByRole('button', { name: 'Shorten link' }).click(); await expect(page.locator('#shorten-error')).toBeVisible();
  await page.getByRole('button', { name: 'Log in or create an account', exact: true }).click(); await expect(page.locator('#auth-dialog')).toBeVisible(); expect(await page.locator('#auth-dialog').evaluate(element => element.getBoundingClientRect().width < innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Close', exact: true }).click(); await expect(page.locator('#auth-dialog')).not.toBeVisible();
  await page.goto('/u/this_profile_does_not_exist'); await expect(page.getByRole('heading', { name: 'A little lost.' })).toBeVisible();
  await page.goto('/not-a-real-link'); await expect(page.getByRole('heading', { name: /This link took/ })).toBeVisible();
});
