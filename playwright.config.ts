import { defineConfig, devices } from '@playwright/test';

// E2E_PORT lets several checkouts (git worktrees) run their suites side by side, each on its own dev server.
const PORT = Number(process.env.E2E_PORT || 8081);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // On CI the github reporter also turns each failure into an annotation on the run.
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      // Chromium + iPhone viewport, not WebKit: this is a fast layout/logic
      // smoke test for the web build, not a Safari-fidelity check. Verify
      // real iOS behavior in Expo Go or the simulator.
      name: 'iphone-14-viewport',
      use: {
        ...devices['iPhone 14'],
        defaultBrowserType: 'chromium',
        // Software WebGL for the 3D game (Godzilla Rampage); headless Chromium
        // only allows SwiftShader with this flag.
        launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
      },
    },
  ],
  webServer: {
    command: `npx expo start --web --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { BROWSER: 'none' },
  },
});
