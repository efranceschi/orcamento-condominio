import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: "http://localhost:1420",
    headless: true,
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node e2e/mock-server.mjs",
      port: 3333,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npx vite --port 1420",
      port: 1420,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
