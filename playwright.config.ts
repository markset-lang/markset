/**
 * Browser tests for the TipTap editor, in the three engines readers use.
 *
 * The package's own tests run the editor in happy-dom, which checks the model
 * and not the browser: selections, keyboard input and paste are each engine's
 * own, and a contenteditable bug is usually a bug in one of them. So the same
 * specs run in Chromium, Firefox and WebKit, against the package bundled from
 * src/ by global-setup.ts.
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "packages/tiptap/e2e",
  globalSetup: "./packages/tiptap/e2e/global-setup.ts",
  outputDir: "test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
