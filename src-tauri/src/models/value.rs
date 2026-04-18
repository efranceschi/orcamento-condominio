use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetValue {
    pub id: Option<i64>,
    pub item_id: i64,
    pub budgeted: f64,
    pub realized: Option<f64>,
    pub adjusted: Option<f64>,
    pub estimated_fixed: Option<f64>,
    pub adjustment_percent: Option<f64>,
    pub custom_adjustment: Option<f64>,
    pub notes: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    /// Campos calculados (não persistidos)
    #[serde(skip_deserializing)]
    pub estimated: Option<f64>,
    #[serde(skip_deserializing)]
    pub variance: Option<f64>,
    #[serde(skip_deserializing)]
    pub variance_percent: Option<f64>,
    #[serde(skip_deserializing)]
    pub used_percent: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateValueRequest {
    pub item_id: i64,
    pub budgeted: Option<f64>,
    pub realized: Option<f64>,
    pub adjusted: Option<f64>,
    pub estimated_fixed: Option<f64>,
    pub adjustment_percent: Option<f64>,
    pub custom_adjustment: Option<f64>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateValueRequest {
    pub budgeted: Option<f64>,
    pub realized: Option<f64>,
    pub adjusted: Option<f64>,
    pub estimated_fixed: Option<f64>,
    pub adjustment_percent: Option<f64>,
    pub custom_adjustment: Option<f64>,
    pub notes: Option<String>,
}
