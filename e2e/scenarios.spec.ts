import { test, expect } from "@playwright/test";

const API = "http://localhost:3333";

test.beforeEach(async ({ request }) => {
  await request.post(`${API}/api/__reset`);
});

test("shows empty state when no scenarios exist", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByText("Nenhum orçamento encontrado")).toBeVisible();
});

test("creates a new scenario", async ({ page }) => {
  await page.goto("/");
  await page.locator("button", { hasText: "Novo Orçamento" }).first().click();
  // Labels have asterisks: "Nome *", "Ano *"
  await page.getByPlaceholder("Ex: Orçamento 2026").fill("Orçamento 2027");
  // Ano is a select, not an input
  await page.locator("select").last().selectOption("2027");
  await page.getByRole("button", { name: "Criar" }).click();
  await expect(page.getByText("Orçamento 2027")).toBeVisible();
});

test("filters scenarios by type", async ({ request, page }) => {
  await request.post(`${API}/api/scenarios`, {
    data: { name: "Base 2026", year: 2026, is_baseline: true },
  });
  await request.post(`${API}/api/scenarios`, {
    data: { name: "Simulação X", year: 2026, is_baseline: false },
  });
  await page.goto("/");
  await expect(page.getByText("Base 2026")).toBeVisible();
  await expect(page.getByText("Simulação X")).toBeVisible();
  await page.getByRole("button", { name: "Base" }).click();
  await expect(page.getByText("Base 2026")).toBeVisible();
  await expect(page.getByText("Simulação X")).not.toBeVisible();
});

test("searches scenarios by name", async ({ request, page }) => {
  await request.post(`${API}/api/scenarios`, {
    data: { name: "Orçamento Alpha", year: 2026 },
  });
  await request.post(`${API}/api/scenarios`, {
    data: { name: "Orçamento Beta", year: 2026 },
  });
  await page.goto("/");
  await expect(page.getByText("Orçamento Alpha")).toBeVisible();
  await expect(page.getByText("Orçamento Beta")).toBeVisible();
  await page.getByPlaceholder("Buscar orçamentos").fill("Alpha");
  await expect(page.getByText("Orçamento Alpha")).toBeVisible();
  await expect(page.getByText("Orçamento Beta")).not.toBeVisible();
});
