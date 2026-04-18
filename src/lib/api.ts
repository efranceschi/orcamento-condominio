import { invoke } from "@tauri-apps/api/core";
import type {
  BudgetScenario,
  CreateScenarioRequest,
  UpdateScenarioRequest,
  BudgetCategory,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  BudgetItem,
  CreateItemRequest,
  UpdateItemRequest,
  BudgetValue,
  CreateValueRequest,
  UpdateValueRequest,
  SystemParameters,
  UpdateParametersRequest,
  ScenarioSummary,
  ScenarioComparison,
  DbStats,
} from "../types";

// ========================
// Scenarios
// ========================

export async function listScenarios(
  year?: number | null,
  isBaseline?: boolean | null,
): Promise<BudgetScenario[]> {
  return invoke("list_scenarios", {
    year: year ?? null,
    isBaseline: isBaseline ?? null,
  });
}

export async function getScenario(id: number): Promise<BudgetScenario> {
  return invoke("get_scenario", { id });
}

export async function createScenario(
  request: CreateScenarioRequest,
): Promise<BudgetScenario> {
  return invoke("create_scenario", { request });
}

export async function updateScenario(
  id: number,
  request: UpdateScenarioRequest,
): Promise<BudgetScenario> {
  return invoke("update_scenario", { id, request });
}

export async function deleteScenario(id: number): Promise<void> {
  return invoke("delete_scenario", { id });
}

// ========================
// Categories
// ========================

export async function listCategories(
  scenarioId: number,
): Promise<BudgetCategory[]> {
  return invoke("list_categories", { scenarioId });
}

export async function getCategory(id: number): Promise<BudgetCategory> {
  return invoke("get_category", { id });
}

export async function createCategory(
  request: CreateCategoryRequest,
): Promise<BudgetCategory> {
  return invoke("create_category", { request });
}

export async function updateCategory(
  id: number,
  request: UpdateCategoryRequest,
): Promise<BudgetCategory> {
  return invoke("update_category", { id, request });
}

export async function deleteCategory(id: number): Promise<void> {
  return invoke("delete_category", { id });
}

export async function reorderCategory(
  id: number,
  newOrder: number,
): Promise<void> {
  return invoke("reorder_category", { id, newOrder });
}

// ========================
// Items
// ========================

export async function listItems(categoryId: number): Promise<BudgetItem[]> {
  return invoke("list_items", { categoryId });
}

export async function getItem(id: number): Promise<BudgetItem> {
  return invoke("get_item", { id });
}

export async function createItem(
  request: CreateItemRequest,
): Promise<BudgetItem> {
  return invoke("create_item", { request });
}

export async function updateItem(
  id: number,
  request: UpdateItemRequest,
): Promise<BudgetItem> {
  return invoke("update_item", { id, request });
}

export async function deleteItem(id: number): Promise<void> {
  return invoke("delete_item", { id });
}

export async function createValue(
  request: CreateValueRequest,
): Promise<BudgetValue> {
  return invoke("create_value", { request });
}

export async function updateValue(
  id: number,
  request: UpdateValueRequest,
): Promise<BudgetValue> {
  return invoke("update_value", { id, request });
}

// ========================
// Parameters
// ========================

export async function getParameters(): Promise<SystemParameters> {
  return invoke("get_parameters");
}

export async function updateParameters(
  request: UpdateParametersRequest,
): Promise<SystemParameters> {
  return invoke("update_parameters", { request });
}

// ========================
// Analysis
// ========================

export async function getScenarioSummary(
  scenarioId: number,
): Promise<ScenarioSummary> {
  return invoke("get_scenario_summary", { scenarioId });
}

export async function compareScenarios(
  baseId: number,
  comparedId: number,
): Promise<ScenarioComparison> {
  return invoke("compare_scenarios", { baseId, comparedId });
}

// ========================
// Backup
// ========================

export async function exportData(): Promise<string> {
  return invoke("export_data");
}

export async function importData(jsonString: string): Promise<string> {
  return invoke("import_data", { jsonString });
}

export async function getDbStats(): Promise<DbStats> {
  return invoke("get_db_stats");
}

// ========================
// PDF
// ========================

export async function generatePdf(scenarioId: number): Promise<number[]> {
  return invoke("generate_pdf", { scenarioId });
}
