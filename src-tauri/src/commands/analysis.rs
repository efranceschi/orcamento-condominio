use serde::{Deserialize, Serialize};
use tauri::State;
use crate::db::Database;
use crate::models::scenario::*;

/// Resultado da comparação entre dois cenários
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScenarioComparison {
    pub base: ScenarioSummary,
    pub compared: ScenarioSummary,
    pub diff_expenses_budgeted: f64,
    pub diff_expenses_realized: f64,
    pub diff_expenses_estimated: f64,
    pub diff_revenues_budgeted: f64,
    pub diff_revenues_realized: f64,
    pub diff_revenues_estimated: f64,
    pub diff_balance_budgeted: f64,
    pub diff_balance_realized: f64,
    pub diff_balance_estimated: f64,
}

/// Calcula o percentual de ajuste efetivo para um item
fn calc_effective_adjustment(
    conn: &rusqlite::Connection,
    item_adj: Option<f64>,
    category_id: i64,
    scenario_general_adj: f64,
) -> f64 {
    if let Some(adj) = item_adj {
        return adj;
    }

    if let Some(adj) = walk_category_adjustment(conn, category_id) {
        return adj;
    }

    if scenario_general_adj != 0.0 {
        return scenario_general_adj;
    }

    0.0
}

/// Sobe recursivamente na hierarquia de categorias buscando adjustment_percent
fn walk_category_adjustment(conn: &rusqlite::Connection, category_id: i64) -> Option<f64> {
    let result: Result<(Option<f64>, Option<i64>), _> = conn.query_row(
        "SELECT adjustment_percent, parent_category_id FROM budget_categories WHERE id = ?",
        [category_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    );

    match result {
        Ok((Some(adj), _)) => Some(adj),
        Ok((None, Some(parent_id))) => walk_category_adjustment(conn, parent_id),
        _ => None,
    }
}

/// Calcula os totais de uma categoria recursivamente, incluindo subcategorias
fn compute_category_summary(
    conn: &rusqlite::Connection,
    category_id: i64,
    general_adjustment: f64,
    risk_margin: f64,
) -> Result<CategorySummary, String> {
    // Buscar dados da categoria
    let (name, code, item_type): (String, Option<String>, String) = conn
        .query_row(
            "SELECT name, code, item_type FROM budget_categories WHERE id = ?",
            [category_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| format!("Categoria {} não encontrada: {}", category_id, e))?;

    let mut total_budgeted = 0.0_f64;
    let mut total_realized = 0.0_f64;
    let mut total_estimated = 0.0_f64;

    // Somar itens diretos desta categoria
    let mut item_stmt = conn
        .prepare(
            "SELECT id, adjustment_percent, repeats_next_budget FROM budget_items WHERE category_id = ?",
        )
        .map_err(|e| e.to_string())?;

    let items: Vec<(i64, Option<f64>, bool)> = item_stmt
        .query_map(rusqlite::params![category_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, Option<f64>>(1)?,
                row.get::<_, i32>(2)? != 0,
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    for (item_id, item_adj, repeats_next_budget) in &items {
        let effective_adj = calc_effective_adjustment(conn, *item_adj, category_id, general_adjustment);

        // Somar todos os valores deste item
        let mut val_stmt = conn
            .prepare(
                "SELECT budgeted, realized, estimated_fixed FROM budget_values WHERE item_id = ?",
            )
            .map_err(|e| e.to_string())?;

        let vals: Vec<(f64, Option<f64>, Option<f64>)> = val_stmt
            .query_map(rusqlite::params![item_id], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        for (budgeted, realized, estimated_fixed) in vals {
            total_budgeted += budgeted;
            total_realized += realized.unwrap_or(0.0);

            // estimated calculation
            if let Some(fixed) = estimated_fixed {
                total_estimated += fixed;
            } else if *repeats_next_budget {
                // contribui 0 ao estimated
            } else {
                let total_pct = effective_adj + risk_margin;
                total_estimated += budgeted * (1.0 + total_pct / 100.0);
            }
        }
    }

    // Processar subcategorias recursivamente
    let mut sub_stmt = conn
        .prepare("SELECT id FROM budget_categories WHERE parent_category_id = ? ORDER BY \"order\" ASC")
        .map_err(|e| e.to_string())?;

    let sub_ids: Vec<i64> = sub_stmt
        .query_map(rusqlite::params![category_id], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut subcategories = Vec::new();
    for sub_id in sub_ids {
        let sub_summary = compute_category_summary(conn, sub_id, general_adjustment, risk_margin)?;
        total_budgeted += sub_summary.total_budgeted;
        total_realized += sub_summary.total_realized;
        total_estimated += sub_summary.total_estimated;
        subcategories.push(sub_summary);
    }

    let variance = total_realized - total_budgeted;
    let variance_percent = if total_budgeted != 0.0 {
        ((total_realized - total_budgeted) / total_budgeted) * 100.0
    } else {
        0.0
    };

    Ok(CategorySummary {
        category_id,
        name,
        code,
        item_type,
        total_budgeted,
        total_realized,
        total_estimated,
        variance,
        variance_percent,
        subcategories,
    })
}

/// Constrói o ScenarioSummary completo para um cenário
fn build_scenario_summary(
    conn: &rusqlite::Connection,
    scenario_id: i64,
) -> Result<ScenarioSummary, String> {
    // Buscar dados do cenário
    let (name, year, general_adjustment, risk_margin): (String, i32, f64, f64) = conn
        .query_row(
            "SELECT name, year, general_adjustment, risk_margin FROM budget_scenarios WHERE id = ?",
            [scenario_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|e| format!("Cenário não encontrado: {}", e))?;

    // Buscar categorias raiz
    let mut root_stmt = conn
        .prepare(
            "SELECT id, item_type FROM budget_categories WHERE scenario_id = ? AND parent_category_id IS NULL ORDER BY \"order\" ASC",
        )
        .map_err(|e| e.to_string())?;

    let roots: Vec<(i64, String)> = root_stmt
        .query_map(rusqlite::params![scenario_id], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut categories = Vec::new();
    let mut total_expenses_budgeted = 0.0_f64;
    let mut total_expenses_realized = 0.0_f64;
    let mut total_expenses_estimated = 0.0_f64;
    let mut total_revenues_budgeted = 0.0_f64;
    let mut total_revenues_realized = 0.0_f64;
    let mut total_revenues_estimated = 0.0_f64;

    for (root_id, item_type) in roots {
        let summary = compute_category_summary(conn, root_id, general_adjustment, risk_margin)?;

        match item_type.as_str() {
            "expense" => {
                total_expenses_budgeted += summary.total_budgeted;
                total_expenses_realized += summary.total_realized;
                total_expenses_estimated += summary.total_estimated;
            }
            "revenue" => {
                total_revenues_budgeted += summary.total_budgeted;
                total_revenues_realized += summary.total_realized;
                total_revenues_estimated += summary.total_estimated;
            }
            _ => {}
        }

        categories.push(summary);
    }

    Ok(ScenarioSummary {
        scenario_id,
        scenario_name: name,
        year,
        total_expenses_budgeted,
        total_expenses_realized,
        total_expenses_estimated,
        total_revenues_budgeted,
        total_revenues_realized,
        total_revenues_estimated,
        balance_budgeted: total_revenues_budgeted - total_expenses_budgeted,
        balance_realized: total_revenues_realized - total_expenses_realized,
        balance_estimated: total_revenues_estimated - total_expenses_estimated,
        categories,
    })
}

#[tauri::command]
pub fn get_scenario_summary(
    db: State<Database>,
    scenario_id: i64,
) -> Result<ScenarioSummary, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    build_scenario_summary(&conn, scenario_id)
}

#[tauri::command]
pub fn compare_scenarios(
    db: State<Database>,
    base_id: i64,
    compared_id: i64,
) -> Result<ScenarioComparison, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let base = build_scenario_summary(&conn, base_id)?;
    let compared = build_scenario_summary(&conn, compared_id)?;

    Ok(ScenarioComparison {
        diff_expenses_budgeted: compared.total_expenses_budgeted - base.total_expenses_budgeted,
        diff_expenses_realized: compared.total_expenses_realized - base.total_expenses_realized,
        diff_expenses_estimated: compared.total_expenses_estimated - base.total_expenses_estimated,
        diff_revenues_budgeted: compared.total_revenues_budgeted - base.total_revenues_budgeted,
        diff_revenues_realized: compared.total_revenues_realized - base.total_revenues_realized,
        diff_revenues_estimated: compared.total_revenues_estimated - base.total_revenues_estimated,
        diff_balance_budgeted: compared.balance_budgeted - base.balance_budgeted,
        diff_balance_realized: compared.balance_realized - base.balance_realized,
        diff_balance_estimated: compared.balance_estimated - base.balance_estimated,
        base,
        compared,
    })
}
