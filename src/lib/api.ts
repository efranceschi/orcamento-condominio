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

// ============================================================
// Transporte dual: Tauri IPC ou HTTP REST
// ============================================================

/** Detecta se estamos dentro do WebView nativo do Tauri */
function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

/** Obtém a base URL do servidor HTTP (mesmo host, porta 3000 por padrão) */
function getApiBaseUrl(): string {
  // Se acessando via browser na rede, a URL já aponta para o servidor HTTP
  return `${window.location.protocol}//${window.location.host}`;
}

/** Wrapper unificado: usa Tauri IPC se disponível, senão HTTP REST */
async function invoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (isTauri()) {
    const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
    return tauriInvoke<T>(command, args);
  }
  // Modo HTTP — mapear command para endpoint REST
  return httpInvoke<T>(command, args);
}

/** Mapeamento de Tauri commands para endpoints HTTP REST */
async function httpInvoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const base = getApiBaseUrl();

  const routeMap: Record<
    string,
    { method: string; path: string | ((a: Record<string, unknown>) => string) }
  > = {
    // Cenários
    list_scenarios: {
      method: "GET",
      path: (a) => {
        const params = new URLSearchParams();
        if (a.year != null) params.set("year", String(a.year));
        if (a.isBaseline != null)
          params.set("is_baseline", String(a.isBaseline));
        const qs = params.toString();
        return `/api/scenarios${qs ? `?${qs}` : ""}`;
      },
    },
    get_scenario: {
      method: "GET",
      path: (a) => `/api/scenarios/${a.id}`,
    },
    create_scenario: { method: "POST", path: "/api/scenarios" },
    update_scenario: {
      method: "PUT",
      path: (a) => `/api/scenarios/${a.id}`,
    },
    delete_scenario: {
      method: "DELETE",
      path: (a) => `/api/scenarios/${a.id}`,
    },
    // Categorias
    list_categories: {
      method: "GET",
      path: (a) => `/api/categories/${a.scenarioId}`,
    },
    get_category: {
      method: "GET",
      path: (a) => `/api/categories/item/${a.id}`,
    },
    create_category: { method: "POST", path: "/api/categories" },
    update_category: {
      method: "PUT",
      path: (a) => `/api/categories/${a.id}`,
    },
    delete_category: {
      method: "DELETE",
      path: (a) => `/api/categories/${a.id}`,
    },
    reorder_category: {
      method: "PUT",
      path: (a) => `/api/categories/${a.id}/reorder`,
    },
    // Itens
    list_items: {
      method: "GET",
      path: (a) => `/api/items/by-category/${a.categoryId}`,
    },
    get_item: { method: "GET", path: (a) => `/api/items/${a.id}` },
    create_item: { method: "POST", path: "/api/items" },
    update_item: { method: "PUT", path: (a) => `/api/items/${a.id}` },
    delete_item: { method: "DELETE", path: (a) => `/api/items/${a.id}` },
    // Valores
    create_value: { method: "POST", path: "/api/values" },
    update_value: { method: "PUT", path: (a) => `/api/values/${a.id}` },
    // Parâmetros
    get_parameters: { method: "GET", path: "/api/parameters" },
    update_parameters: { method: "PUT", path: "/api/parameters" },
    // Análise
    get_scenario_summary: {
      method: "GET",
      path: (a) => `/api/analysis/summary/${a.scenarioId}`,
    },
    compare_scenarios: {
      method: "GET",
      path: (a) => `/api/analysis/compare/${a.baseId}/${a.comparedId}`,
    },
    // Backup
    export_data: { method: "GET", path: "/api/backup/export" },
    import_data: { method: "POST", path: "/api/backup/import" },
    get_db_stats: { method: "GET", path: "/api/backup/stats" },
    // PDF
    generate_pdf: {
      method: "GET",
      path: (a) => `/api/pdf/${a.scenarioId}`,
    },
  };

  const route = routeMap[command];
  if (!route) {
    throw new Error(`Comando HTTP não mapeado: ${command}`);
  }

  const path =
    typeof route.path === "function"
      ? route.path(args ?? {})
      : route.path;
  const url = `${base}${path}`;

  const fetchOpts: RequestInit = {
    method: route.method,
    headers: { "Content-Type": "application/json" },
  };

  // Para POST/PUT, enviar o body correto
  if (route.method === "POST" || route.method === "PUT") {
    // Extrair o body — para commands que enviam 'request', enviar o request diretamente
    const body = args?.request ?? args ?? {};
    fetchOpts.body = JSON.stringify(body);
  }

  const response = await fetch(url, fetchOpts);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error || `Erro HTTP ${response.status}: ${response.statusText}`,
    );
  }

  // DELETE retorna 204 sem body
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

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

// ========================
// Network Server (Tauri only)
// ========================

export interface NetworkInfo {
  running: boolean;
  port: number;
  addresses: string[];
}

export async function registerDbPath(): Promise<void> {
  if (!isTauri()) return;
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke("register_db_path");
}

export async function startNetworkServer(
  port?: number,
): Promise<NetworkInfo> {
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke("start_network_server", { port: port ?? null });
}

export async function stopNetworkServer(): Promise<NetworkInfo> {
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke("stop_network_server");
}

export async function getNetworkStatus(): Promise<NetworkInfo> {
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke("get_network_status");
}
