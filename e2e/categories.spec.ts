import { test, expect } from "@playwright/test";

const API = "http://localhost:3333";

test.beforeEach(async ({ request }) => {
  await request.post(`${API}/api/__reset`);
});

test("shows scenario selector and empty state", async ({ page }) => {
  await page.goto("/categories");
  await expect(page.locator("h1, h2, h3").getByText("Categorias")).toBeVisible();
  await expect(page.locator("select")).toBeVisible();
  await expect(
    page.getByText("Selecione um cenario para visualizar as categorias")
  ).toBeVisible();
});
