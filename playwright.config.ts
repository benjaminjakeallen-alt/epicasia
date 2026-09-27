import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:8081',
    trace: 'on-first-retry',
  },
  projects: [
    {
      // Chromium + iPhone viewport, not WebKit: this is a fast layout/logic
      // smoke test for the web build, not a Safari-fidelity check. Verify
      // real iOS behavior in Expo Go or the simulator.
      name: 'iphone-14-viewport',
      use: { ...devices['iPhone 14'], defaultBrowserType: 'chromium' },
    },
  ],
  webServer: {
    command: 'npx expo start --web --port 8081',
    url: 'http://localhost:8081',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { BROWSER: 'none' },
  },
});
