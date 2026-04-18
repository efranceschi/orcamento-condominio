// ========================
// Scenario
// ========================

export interface BudgetScenario {
  id: number | null;
  name: string;
  description: string | null;
  year: number;
  base_scenario_id: number | null;
  is_baseline: boolean;
  is_approved: boolean;
  is_closed: boolean;
  general_adjustment: number;
  risk_margin: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface CreateScenarioRequest {
  name: string;
  year: number;
  description?: string | null;
  is_baseline: boolean;
  base_scenario_id?: number | null;
  copy_from_previous: boolean;
}

export interface UpdateScenarioRequest {
  name?: string | null;
  description?: string | null;
  year?: number | null;
  general_adjustment?: number | null;
  risk_margin?: number | null;
  is_baseline?: boolean | null;
  is_approved?: boolean | null;
  is_closed?: boolean | null;
}

// ========================
// Category
// ========================

export interface BudgetCategory {
  id: number | null;
  scenario_id: number;
  parent_category_id: number | null;
  name: string;
  description: string | null;
  code: string | null;
  item_type: string;
  order: number;
  adjustment_percent: number | null;
  created_at: string | null;
  updated_at: string | null;
  subcategories: BudgetCategory[];
  items: BudgetItem[];
}

export interface CreateCategoryRequest {
  scenario_id: number;
  parent_category_id?: number | null;
  name: string;
  description?: string | null;
  code?: string | null;
  item_type: string;
  order?: number | null;
  adjustment_percent?: number | null;
}

export interface UpdateCategoryRequest {
  name?: string | null;
  description?: string | null;
  code?: string | null;
  order?: number | null;
  adjustment_percent?: number | null;
}

// ========================
// Item
// ========================

export interface BudgetItem {
  id: number | null;
  category_id: number;
  name: string;
  description: string | null;
  unit: string | null;
  order: number;
  adjustment_percent: number | null;
  repeats_next_budget: boolean;
  is_optional: boolean;
  observations: string | null;
  values: BudgetValue[];
  effective_adjustment_percent: number | null;
}

export interface CreateItemRequest {
  category_id: number;
  name: string;
  description?: string | null;
  unit?: string | null;
  order?: number | null;
  adjustment_percent?: number | null;
  repeats_next_budget?: boolean | null;
  is_optional?: boolean | null;
  observations?: string | null;
  budgeted?: number | null;
  realized?: number | null;
  adjusted?: number | null;
}

export interface UpdateItemRequest {
  name?: string | null;
  description?: string | null;
  unit?: string | null;
  order?: number | null;
  adjustment_percent?: number | null;
  repeats_next_budget?: boolean | null;
  is_optional?: boolean | null;
  observations?: string | null;
}

// ========================
// Value
// ========================

export interface BudgetValue {
  id: number | null;
  item_id: number;
  budgeted: number;
  realized: number | null;
  adjusted: number | null;
  estimated_fixed: number | null;
  adjustment_percent: number | null;
  custom_adjustment: number | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  estimated: number | null;
  variance: number | null;
  variance_percent: number | null;
  used_percent: number | null;
}

export interface CreateValueRequest {
  item_id: number;
  budgeted?: number | null;
  realized?: number | null;
  adjusted?: number | null;
  estimated_fixed?: number | null;
  adjustment_percent?: number | null;
  custom_adjustment?: number | null;
  notes?: string | null;
}

export interface UpdateValueRequest {
  budgeted?: number | null;
  realized?: number | null;
  adjusted?: number | null;
  estimated_fixed?: number | null;
  adjustment_percent?: number | null;
  custom_adjustment?: number | null;
  notes?: string | null;
}

// ========================
// Parameters
// ========================

export interface SystemParameters {
  id: number | null;
  total_square_meters: number;
  lot_simulation_1: number;
  lot_simulation_2: number;
  lot_simulation_3: number;
  habite_se_discount: number;
}

export interface UpdateParametersRequest {
  total_square_meters?: number | null;
  lot_simulation_1?: number | null;
  lot_simulation_2?: number | null;
  lot_simulation_3?: number | null;
  habite_se_discount?: number | null;
}

// ========================
// Analysis / Summary
// ========================

export interface ScenarioSummary {
  scenario_id: number;
  scenario_name: string;
  year: number;
  total_expenses_budgeted: number;
  total_expenses_realized: number;
  total_expenses_estimated: number;
  total_revenues_budgeted: number;
  total_revenues_realized: number;
  total_revenues_estimated: number;
  balance_budgeted: number;
  balance_realized: number;
  balance_estimated: number;
  categories: CategorySummary[];
}

export interface CategorySummary {
  category_id: number;
  name: string;
  code: string | null;
  item_type: string;
  total_budgeted: number;
  total_realized: number;
  total_estimated: number;
  variance: number;
  variance_percent: number;
  subcategories: CategorySummary[];
}

export interface ScenarioComparison {
  base: ScenarioSummary;
  compared: ScenarioSummary;
  diff_expenses_budgeted: number;
  diff_expenses_realized: number;
  diff_expenses_estimated: number;
  diff_revenues_budgeted: number;
  diff_revenues_realized: number;
  diff_revenues_estimated: number;
  diff_balance_budgeted: number;
  diff_balance_realized: number;
  diff_balance_estimated: number;
}

// ========================
// Backup
// ========================

export interface DbStats {
  scenario_count: number;
  category_count: number;
  item_count: number;
  value_count: number;
  db_size_bytes: number;
}

export interface ExportData {
  version: string;
  exported_at: string;
  scenarios: BudgetScenario[];
  categories: BudgetCategory[];
  items: BudgetItem[];
  values: BudgetValue[];
  parameters: SystemParameters;
}
