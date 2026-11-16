import { expect, test, type Page } from '@playwright/test';

async function command(page: Page, text: string) {
  const input = page.getByRole('textbox').filter({ visible: true });
  await input.fill(text);
  await input.press('Enter');
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => console.error(error.message));
  await page.goto('/');
  await page.getByTitle('Terminal', { exact: true }).click();
  await expect(page.getByRole('textbox')).toBeVisible();
});

test('persists files, keeps windows mounted, and boots offline', async ({ page, context }) => {
  await command(page, 'echo saved > /home/aether/checkpoint.txt');
  await command(page, 'cat /home/aether/checkpoint.txt');
  await expect(page.getByText('saved', { exact: true })).toBeVisible();
  await page.getByTitle('Workspace 2', { exact: true }).click();
  await expect(page.getByRole('textbox')).toBeHidden();
  await page.getByTitle('Workspace 1', { exact: true }).click();
  await expect(page.getByText('saved', { exact: true })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('AetherOS_DB');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const found = await new Promise((resolve) => {
      const store = db.transaction('vfs_nodes').objectStore('vfs_nodes');
      const file = store.get('/home/aether/checkpoint.txt');
      const session = store.get('/home/aether/.config/aetheros/session.json');
      session.onsuccess = () => {
        const saved = JSON.parse(session.result?.content ?? '{}');
        resolve(Boolean(file.result && saved.activeWorkspace === 1 && saved.windows?.some((win: { appId: string; workspace: number }) =>
          win.appId === 'terminal' && win.workspace === 1)));
      };
    });
    db.close();
    return found;
  })).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('textbox')).toBeVisible();
  await command(page, 'cat /home/aether/checkpoint.txt');
  await expect(page.getByText('saved', { exact: true })).toBeVisible();
});

test('runs JavaScript in a confined worker and supports local Git', async ({ page }) => {
  await command(page, 'js -e "console.log(20 + 22, typeof fetch, typeof indexedDB, typeof postMessage)"');
  await expect(page.getByText('42 undefined undefined undefined', { exact: true })).toBeVisible();
  await command(page, 'git init && echo alpha > a.txt && git add a.txt && git commit -m first && git branch topic && git switch topic');
  await expect(page.getByText(/Switched to branch/)).toBeVisible();
  await command(page, 'git status');
  await expect(page.getByText(/On branch topic/)).toBeVisible();
});
