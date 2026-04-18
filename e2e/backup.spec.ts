import { test, expect } from "@playwright/test";

const API = "http://localhost:3333";

test.beforeEach(async ({ request }) => {
  await request.post(`${API}/api/__reset`);
});

test("shows backup page with all sections", async ({ page }) => {
  await page.goto("/backup");
  await expect(page.getByText("Backup e Restauração")).toBeVisible();
  await expect(page.getByText("Exportar Dados").first()).toBeVisible();
  await expect(page.getByText("Importar Dados").first()).toBeVisible();
  await expect(page.getByText("Exportar Backup")).toBeVisible();
});

test("shows statistics cards", async ({ page }) => {
  await page.goto("/backup");
  await expect(page.getByText("Estatísticas do Banco de Dados")).toBeVisible();
  await expect(page.getByText("Cenários").first()).toBeVisible();
});
