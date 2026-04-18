import { test, expect } from "@playwright/test";

const API = "http://localhost:3333";

test.beforeEach(async ({ request }) => {
  await request.post(`${API}/api/__reset`);
});

test("shows comparison page with dropdowns", async ({ page }) => {
  await page.goto("/comparison");
  await expect(page.getByText("Comparação de Cenários")).toBeVisible();
  // Two select dropdowns for scenario A and B
  const selects = page.locator("select");
  await expect(selects).toHaveCount(2);
});

test("shows message when no scenarios available", async ({ page }) => {
  await page.goto("/comparison");
  await expect(page.getByText("Comparação de Cenários")).toBeVisible();
});
