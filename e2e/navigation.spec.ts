import { test, expect } from "@playwright/test";

const API = "http://localhost:3333";

test.beforeEach(async ({ request }) => {
  await request.post(`${API}/api/__reset`);
});

test("sidebar navigation works", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("link", { name: "Categorias" }).click();
  await expect(page).toHaveURL(/\/categories/);

  await page.getByRole("link", { name: "Parâmetros" }).click();
  await expect(page).toHaveURL(/\/parameters/);

  await page.getByRole("link", { name: "Backup" }).click();
  await expect(page).toHaveURL(/\/backup/);

  await page.getByRole("link", { name: "Comparação" }).click();
  await expect(page).toHaveURL(/\/comparison/);

  await page.getByRole("link", { name: "Orçamentos" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("scenario card has action buttons", async ({ request, page }) => {
  await request.post(`${API}/api/scenarios`, {
    data: { name: "Test Scenario", year: 2026 },
  });
  await page.goto("/");
  // Wait for data to load
  await expect(page.getByText("Test Scenario")).toBeVisible({ timeout: 10000 });
  // Verify action buttons exist on the card
  await expect(page.getByText("Ver Detalhes")).toBeVisible();
  await expect(page.getByText("Resumo")).toBeVisible();
  await expect(page.getByText("Análise")).toBeVisible();
  await expect(page.getByText("Editar")).toBeVisible();
  await expect(page.getByText("Excluir")).toBeVisible();
});
