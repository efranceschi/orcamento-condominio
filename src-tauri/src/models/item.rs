use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetItem {
    pub id: Option<i64>,
    pub category_id: i64,
    pub name: String,
    pub description: Option<String>,
    pub unit: Option<String>,
    pub order: i32,
    pub adjustment_percent: Option<f64>,
    pub repeats_next_budget: bool,
    pub is_optional: bool,
    pub observations: Option<String>,
    #[serde(default)]
    pub values: Vec<super::value::BudgetValue>,
    /// Percentual de ajuste efetivo calculado (hierárquico)
    #[serde(skip_deserializing)]
    pub effective_adjustment_percent: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateItemRequest {
    pub category_id: i64,
    pub name: String,
    pub description: Option<String>,
    pub unit: Option<String>,
    pub order: Option<i32>,
    pub adjustment_percent: Option<f64>,
    pub repeats_next_budget: Option<bool>,
    pub is_optional: Option<bool>,
    pub observations: Option<String>,
    /// Valores iniciais (opcional, cria BudgetValue junto com o item)
    pub budgeted: Option<f64>,
    pub realized: Option<f64>,
    pub adjusted: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateItemRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub unit: Option<String>,
    pub order: Option<i32>,
    pub adjustment_percent: Option<f64>,
    pub repeats_next_budget: Option<bool>,
    pub is_optional: Option<bool>,
    pub observations: Option<String>,
}
