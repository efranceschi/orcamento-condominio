use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetScenario {
    pub id: Option<i64>,
    pub name: String,
    pub description: Option<String>,
    pub year: i32,
    pub base_scenario_id: Option<i64>,
    pub is_baseline: bool,
    pub is_approved: bool,
    pub is_closed: bool,
    pub general_adjustment: f64,
    pub risk_margin: f64,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateScenarioRequest {
    pub name: String,
    pub year: i32,
    pub description: Option<String>,
    pub is_baseline: bool,
    pub base_scenario_id: Option<i64>,
    pub copy_from_previous: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateScenarioRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub year: Option<i32>,
    pub general_adjustment: Option<f64>,
    pub risk_margin: Option<f64>,
    pub is_baseline: Option<bool>,
    pub is_approved: Option<bool>,
    pub is_closed: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScenarioSummary {
    pub scenario_id: i64,
    pub scenario_name: String,
    pub year: i32,
    pub total_expenses_budgeted: f64,
    pub total_expenses_realized: f64,
    pub total_expenses_estimated: f64,
    pub total_revenues_budgeted: f64,
    pub total_revenues_realized: f64,
    pub total_revenues_estimated: f64,
    pub balance_budgeted: f64,
    pub balance_realized: f64,
    pub balance_estimated: f64,
    pub categories: Vec<CategorySummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategorySummary {
    pub category_id: i64,
    pub name: String,
    pub code: Option<String>,
    pub item_type: String,
    pub total_budgeted: f64,
    pub total_realized: f64,
    pub total_estimated: f64,
    pub variance: f64,
    pub variance_percent: f64,
    pub subcategories: Vec<CategorySummary>,
}
