use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ItemType {
    Expense,
    Revenue,
}

impl ItemType {
    pub fn as_str(&self) -> &str {
        match self {
            ItemType::Expense => "expense",
            ItemType::Revenue => "revenue",
        }
    }

    pub fn from_str(s: &str) -> Result<Self, String> {
        match s {
            "expense" => Ok(ItemType::Expense),
            "revenue" => Ok(ItemType::Revenue),
            _ => Err(format!("Tipo inválido: {}. Use 'expense' ou 'revenue'.", s)),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetCategory {
    pub id: Option<i64>,
    pub scenario_id: i64,
    pub parent_category_id: Option<i64>,
    pub name: String,
    pub description: Option<String>,
    pub code: Option<String>,
    pub item_type: String,
    pub order: i32,
    pub adjustment_percent: Option<f64>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    #[serde(default)]
    pub subcategories: Vec<BudgetCategory>,
    #[serde(default)]
    pub items: Vec<super::item::BudgetItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateCategoryRequest {
    pub scenario_id: i64,
    pub parent_category_id: Option<i64>,
    pub name: String,
    pub description: Option<String>,
    pub code: Option<String>,
    pub item_type: String,
    pub order: Option<i32>,
    pub adjustment_percent: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCategoryRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub code: Option<String>,
    pub order: Option<i32>,
    pub adjustment_percent: Option<f64>,
}
