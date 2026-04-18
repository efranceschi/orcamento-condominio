import { test, expect } from "@playwright/test";

const API = "http://localhost:3333";

test.beforeEach(async ({ request }) => {
  await request.post(`${API}/api/__reset`);
});

test("loads and displays parameters", async ({ page }) => {
  await page.goto("/parameters");
  await expect(page.getByText("Parâmetros do Sistema")).toBeVisible();
  await expect(page.getByText("Metragem do Condomínio")).toBeVisible();
  await expect(page.getByText("Metragem total (m²)")).toBeVisible();
});

test("shows discount and lot simulation sections", async ({ page }) => {
  await page.goto("/parameters");
  await expect(page.getByText("Descontos")).toBeVisible();
  await expect(page.getByText("Desconto Habite-se (%)")).toBeVisible();
  await expect(page.getByText("Simulações de Lotes")).toBeVisible();
  await expect(page.getByText("Simulação de Lote 1")).toBeVisible();
  await expect(page.getByText("Simulação de Lote 2")).toBeVisible();
  await expect(page.getByText("Simulação de Lote 3")).toBeVisible();
});

test("displays parameter values from API", async ({ page }) => {
  await page.goto("/parameters");
  // Mock returns total_square_meters=150000
  const metInput = page.locator("input").first();
  await expect(metInput).toHaveValue("150000");
});
