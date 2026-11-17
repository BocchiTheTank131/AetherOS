import { expect, test } from '@playwright/test';

test('uses refraction for Liquid Glass and releases it when transparency is disabled', async ({ page, browserName }) => {
  await page.goto('/');
  const dock = page.getByRole('navigation', { name: 'Dock' });
  await expect(dock).toHaveCSS('backdrop-filter', browserName === 'chromium' ? /url.*blur/ : /blur/);
  await page.getByTitle('Quick Settings', { exact: true }).click();
  const quick = page.getByRole('region', { name: 'Quick Settings' });
  await expect(quick.locator('.quick-appearance')).toHaveCSS('backdrop-filter', browserName === 'chromium' ? /url.*blur/ : /blur/);
  const volume = quick.getByRole('slider', { name: 'System volume' });
  await expect(volume).toHaveAttribute('aria-orientation', 'vertical');
  await volume.focus();
  await volume.press('Home');
  await volume.press('ArrowUp');
  await expect(volume).toHaveValue('0.01');
  await quick.getByRole('button', { name: 'Mute', exact: true }).click();
  await expect(volume).toHaveValue('0');
  await volume.press('Escape');
  await expect(quick).toBeHidden();
  await expect(page.getByTitle('Quick Settings', { exact: true })).toBeFocused();
  await page.getByTitle('Settings', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'Glass blur and transparency' }).uncheck();
  await expect(dock).toHaveCSS('backdrop-filter', 'none');
  await expect(page.locator('feDisplacementMap')).toHaveCount(0);
});

test('switches both appearance preferences live and restores them after reload', async ({ page }) => {
  await page.goto('/');
  await page.getByTitle('Settings', { exact: true }).click();
  const root = page.locator('html');
  await expect(root).toHaveAttribute('data-appearance', 'liquid-glass');
  for (const [label, style] of [['Modern', 'modern'], ['Liquid Glass', 'liquid-glass']]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(root).toHaveAttribute('data-appearance', style);
    await expect(page.getByRole('navigation', { name: 'Dock' })).toHaveCSS('backdrop-filter', style === 'modern' ? 'none' : /blur/);
    for (const mode of ['Light', 'Dark']) {
      await page.getByRole('button', { name: mode, exact: true }).click();
      await expect(root).toHaveClass(new RegExp(mode.toLowerCase()));
    }
  }
  await page.getByTitle('Quick Settings', { exact: true }).click();
  await page.getByRole('button', { name: 'Modern', exact: true }).last().click();
  await expect(root).toHaveAttribute('data-appearance', 'modern');
  await page.getByRole('button', { name: 'System', exact: true }).last().click();
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(root).toHaveClass(/light/);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(root).toHaveClass(/dark/);
  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('AetherOS_DB');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<string>((resolve, reject) => {
        const record = db.transaction('vfs_nodes').objectStore('vfs_nodes').get('/home/aether/.config/aetheros/theme.json');
        record.onsuccess = () => resolve(record.result?.content ?? '');
        record.onerror = () => reject(record.error);
      });
    } finally {
      db.close();
    }
  })).toMatch(/"appearance": "modern",\s+"mode": "system"/);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.reload();
  await page.getByTitle('Quick Settings', { exact: true }).waitFor();
  await expect(root).toHaveClass(/light/);
  await expect(root).toHaveAttribute('data-appearance', 'modern');
});

test('keeps a focused window inside the work area after shrinking the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByTitle('Settings', { exact: true }).click();
  await page.setViewportSize({ width: 390, height: 740 });
  const frame = page.locator('.window-frame[data-app="settings"]');
  await expect(frame).toBeVisible();
  const rect = (await frame.boundingBox())!;
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(390);
  expect(rect.y + rect.height).toBeLessThan(680);
});

test('drags, resizes, snaps, restores and minimizes windows', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByTitle('Terminal', { exact: true }).click();
  const frame = page.locator('.window-frame[data-app="terminal"]');
  const title = frame.locator('.window-titlebar');
  await expect(frame).toHaveAttribute('data-focused', 'true');
  await expect(title).toBeVisible();
  const initial = (await frame.boundingBox())!;
  await page.mouse.move(initial.x + 165, initial.y + 22);
  await page.mouse.down();
  await page.mouse.move(initial.x + 92, initial.y + 45, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await frame.boundingBox())!.x).toBeLessThan(initial.x - 50);
  const moved = (await frame.boundingBox())!;
  await page.mouse.move(moved.x + moved.width - 2, moved.y + moved.height / 2);
  await page.mouse.down();
  await page.mouse.move(moved.x + moved.width + 62, moved.y + moved.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await frame.boundingBox())!.width).toBeGreaterThan(moved.width + 45);
  const resized = (await frame.boundingBox())!;
  await page.mouse.move(resized.x + 160, resized.y + 22);
  await page.mouse.down();
  await page.mouse.move(14, resized.y + 22, { steps: 12 });
  await expect(page.locator('.snap-preview[data-snap="left"]')).toBeVisible();
  await page.mouse.up();
  await expect(frame).toHaveAttribute('data-state', 'snapped-left');
  await frame.getByTitle('Maximize').click();
  await expect(frame).toHaveAttribute('data-state', 'maximized');
  await frame.getByRole('button', { name: 'Minimize' }).click();
  await expect(frame).toBeHidden();
  await page.getByTitle('Terminal', { exact: true }).click();
  await expect(frame).toHaveAttribute('data-state', 'maximized');
  await frame.getByTitle('Restore').click();
  await expect(frame).toHaveAttribute('data-state', 'normal');
  await frame.getByRole('button', { name: 'Minimize' }).click();
  await expect(frame).toBeHidden();
  await page.getByTitle('Terminal', { exact: true }).click();
  await expect(frame).toBeVisible();
  await page.getByTitle('Workspace 2', { exact: true }).click();
  await expect(frame).toBeHidden();
  await page.getByTitle('Workspace 1', { exact: true }).click();
  await expect(frame).toBeVisible();
});

test('uses launcher search, keyboard dialogs and each dock position on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Applications', exact: true }).click();
  const search = page.getByRole('searchbox', { name: 'Search applications' });
  await search.fill('calculator');
  await search.press('Enter');
  await expect(page.locator('.window-frame[data-app="calculator"]')).toBeVisible();
  await page.locator('.window-frame[data-app="calculator"]').getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Applications', exact: true }).click();
  await page.getByRole('button', { name: 'Restart AetherOS', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Restart AetherOS' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('navigation', { name: 'Dock' })).toBeVisible();
  await page.getByRole('button', { name: 'Open Settings shortcut' }).press('Enter');
  await page.getByRole('button', { name: 'Dock & Panels', exact: true }).click();
  const dock = page.getByRole('navigation', { name: 'Dock' });
  for (const position of ['top', 'left', 'bottom']) {
    await page.getByRole('button', { name: position, exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-dock', position);
    const rect = (await dock.boundingBox())!;
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(390);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.y + rect.height).toBeLessThanOrEqual(740);
  }
  await page.getByRole('checkbox', { name: 'Automatically hide the dock' }).check();
  await expect(dock).toBeHidden();
  await page.getByRole('button', { name: 'Show dock', exact: true }).click();
  await expect(dock).toBeVisible();
  await page.getByTitle('Quick Settings', { exact: true }).click();
  await expect(page.getByRole('region', { name: 'Quick Settings' })).toBeVisible();
});

test('keeps Files navigation and file entries usable on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await page.goto('/');
  await page.getByTitle('Files', { exact: true }).click();
  const frame = page.locator('.window-frame[data-app="file-manager"]');
  await expect(frame.getByRole('button', { name: 'Projects', exact: true }).last()).toBeInViewport();
  await frame.getByRole('button', { name: 'Documents', exact: true }).last().press('Enter');
  await expect(frame.locator('.window-title')).toHaveText('Documents');
});

test('opens the browser start page and local guide without a network page', async ({ page }) => {
  await page.goto('/');
  await page.getByTitle('Browser', { exact: true }).click();
  const frame = page.locator('.window-frame[data-app="web-browser"]');
  await expect(frame.getByRole('heading', { name: 'Start Page' })).toBeVisible();
  await frame.getByRole('button', { name: 'AetherOS Docs', exact: true }).last().click();
  await expect(frame.getByRole('heading', { name: 'AetherOS Browser Guide' })).toBeVisible();
  await frame.getByTitle('New Tab', { exact: true }).click();
  await expect(frame.getByRole('searchbox', { name: 'Search the web' }).or(frame.getByRole('textbox', { name: 'Search the web' }))).toBeVisible();
});
