import { expect, test, type Page } from '@playwright/test';

async function command(page: Page, text: string) {
  const input = page.getByRole('textbox').filter({ visible: true });
  await input.fill(text);
  await input.press('Enter');
}

test.beforeEach(async ({ page }) => {
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


test('compiles TypeScript and runs real Python from cached runtime assets', async ({ page, context }) => {
  test.setTimeout(75_000);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await command(page, 'mkdir -p /home/aether/Projects/browser-test && cd /home/aether/Projects/browser-test');
  await command(page, `echo 'export function total<T extends number>(a: T, b: T) { return a + b; }' > sum.ts`);
  await command(page, `echo 'import { total } from "./sum"; console.log("typed total:", total(5, 8));' > main.ts`);
  await command(page, 'tsc main.ts && js dist/main.js');
  await expect(page.getByText(/typed total: 13/)).toBeVisible({ timeout: 30_000 });
  await command(page, `python -c 'from pathlib import Path; Path("python.txt").write_text("pyodide"); print(sum(n*n for n in range(5)))'`);
  await expect(page.getByText('30', { exact: true })).toBeVisible({ timeout: 30_000 });
  await command(page, 'cat python.txt');
  await expect(page.getByText('pyodide', { exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('textbox')).toBeVisible({ timeout: 15_000 });
  await command(page, `python -c 'import sys; print("offline Python", sys.version_info.major)'`);
  await expect(page.getByText('offline Python 3', { exact: true })).toBeVisible({ timeout: 30_000 });
});


test('edits a project and runs a live preview with diagnostic output', async ({ page }) => {
  test.setTimeout(45_000);
  await command(page, 'mkdir -p /home/aether/Projects/web');
  await command(page, `echo '<h1>Original heading</h1><link rel="stylesheet" href="style.css"><script src="main.js"></script>' > /home/aether/Projects/web/index.html`);
  await command(page, `echo 'h1 { color: rgb(180, 30, 20); }' > /home/aether/Projects/web/style.css`);
  await command(page, `echo 'console.log("preview console works"); throw new Error("example crash");' > /home/aether/Projects/web/main.js`);
  await page.getByRole('button', { name: 'Code Studio', exact: true }).click();
  await page.getByRole('button', { name: 'Open Project', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').fill('/home/aether/Projects/web');
  await dialog.getByRole('textbox').press('Enter');
  const editor = page.getByRole('textbox', { name: 'Edit index.html' });
  await expect(editor).toHaveValue(/Original heading/);
  await editor.fill('<h1>Saved heading</h1><link rel="stylesheet" href="style.css"><script src="main.js"></script>');
  await page.getByTitle('Save All (Ctrl+S)').click();
  await page.getByTitle('Run Project in Sandboxed Preview').click();
  const frame = page.frameLocator('iframe[title="Web Preview"]');
  const heading = frame.getByRole('heading', { name: 'Saved heading' });
  await expect(heading).toHaveCSS('color', 'rgb(180, 30, 20)');
  await expect(page.getByLabel('Preview console')).toContainText('preview console works');
  await expect(page.getByRole('alert')).toContainText('example crash');
  await page.getByLabel('Preview viewport').selectOption('mobile');
  await expect(page.locator('iframe[title="Web Preview"]')).toHaveCSS('width', '390px');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Edit index.html' })).toHaveValue(/Saved heading/, { timeout: 15_000 });
});

test('installs, launches, updates and uninstalls a confined application', async ({ page }) => {
  test.setTimeout(45_000);
  await command(page, 'mkdir -p /home/aether/Projects/package && cd /home/aether/Projects/package');
  const manifest = (version: string) => JSON.stringify({
    schemaVersion: 1, id: 'dev.browser.package', name: 'Browser Package', version, description: 'E2E test',
    author: 'AetherOS', type: 'windowed', entry: 'index.html', permissions: ['storage:appdata'],
  });
  const html = (version: string) => '<h1>Package ' + version + '</h1><p id="result"></p><script>' +
    'Promise.all([aether.fs.exists("/home/aether/.local/share/aether/apps/dev.other/storage.json").catch(() => "boundary denied"), aether.permissions.request("filesystem:read")]).then((results) => { document.querySelector("#result").textContent = results.join(" / "); });</script>';
  for (const version of ['1.0.0', '1.1.0']) {
    await command(page, `echo '${manifest(version)}' > manifest.json`);
    await command(page, `echo '${html(version)}' > index.html`);
    await command(page, 'aether build . && aetherpkg install dist/dev.browser.package.aepkg && aether run dev.browser.package');
    const frame = page.frameLocator('iframe[title="Browser Package"]');
    await expect(frame.getByRole('heading', { name: 'Package ' + version })).toBeVisible();
    await expect(frame.getByText('boundary denied / false')).toBeVisible();
    await page.getByRole('button', { name: 'Close', exact: true }).last().click();
  }
  await command(page, 'aetherpkg remove dev.browser.package && aetherpkg info dev.browser.package');
  await expect(page.getByText(/Unable to locate package|Package .* not found/)).toBeVisible();
});


test('cancels a runaway worker and keeps the desktop responsive', async ({ page }) => {
  await command(page, 'js -e "while (true) {}"');
  const workerHost = page.locator('iframe[title="Isolated runtime"]');
  await expect(workerHost).toHaveCount(1);
  await page.getByRole('textbox').press('Control+c');
  await expect(workerHost).toHaveCount(0);
  await command(page, 'echo desktop-responsive');
  await expect(page.getByText('desktop-responsive', { exact: true })).toBeVisible();
});
