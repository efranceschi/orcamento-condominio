use serde::{Deserialize, Serialize};
use tauri::State;
use crate::db::Database;
use crate::models::category::BudgetCategory;
use crate::models::item::BudgetItem;
use crate::models::parameters::SystemParameters;
use crate::models::scenario::BudgetScenario;
use crate::models::value::BudgetValue;

/// Estrutura completa para exportação/importação de dados
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportData {
    pub version: String,
    pub exported_at: String,
    pub scenarios: Vec<BudgetScenario>,
    pub categories: Vec<BudgetCategory>,
    pub items: Vec<BudgetItem>,
    pub values: Vec<BudgetValue>,
    pub parameters: SystemParameters,
}

/// Estatísticas do banco de dados
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbStats {
    pub scenario_count: i64,
    pub category_count: i64,
    pub item_count: i64,
    pub value_count: i64,
    pub db_size_bytes: i64,
}

#[tauri::command]
pub fn export_data(db: State<Database>) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Cenários
    let mut stmt = conn
        .prepare("SELECT id, name, description, year, base_scenario_id, is_baseline, is_approved, is_closed, general_adjustment, risk_margin, created_at, updated_at FROM budget_scenarios ORDER BY id")
        .map_err(|e| e.to_string())?;
    let scenarios: Vec<BudgetScenario> = stmt
        .query_map([], |row| {
            Ok(BudgetScenario {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                year: row.get(3)?,
                base_scenario_id: row.get(4)?,
                is_baseline: row.get::<_, i32>(5)? != 0,
                is_approved: row.get::<_, i32>(6)? != 0,
                is_closed: row.get::<_, i32>(7)? != 0,
                general_adjustment: row.get(8)?,
                risk_margin: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // Categorias
    let mut stmt = conn
        .prepare("SELECT id, scenario_id, parent_category_id, name, description, code, item_type, \"order\", adjustment_percent, created_at, updated_at FROM budget_categories ORDER BY id")
        .map_err(|e| e.to_string())?;
    let categories: Vec<BudgetCategory> = stmt
        .query_map([], |row| {
            Ok(BudgetCategory {
                id: row.get(0)?,
                scenario_id: row.get(1)?,
                parent_category_id: row.get(2)?,
                name: row.get(3)?,
                description: row.get(4)?,
                code: row.get(5)?,
                item_type: row.get(6)?,
                order: row.get(7)?,
                adjustment_percent: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                subcategories: Vec::new(),
                items: Vec::new(),
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // Itens
    let mut stmt = conn
        .prepare("SELECT id, category_id, name, description, unit, \"order\", adjustment_percent, repeats_next_budget, is_optional, observations FROM budget_items ORDER BY id")
        .map_err(|e| e.to_string())?;
    let items: Vec<BudgetItem> = stmt
        .query_map([], |row| {
            Ok(BudgetItem {
                id: row.get(0)?,
                category_id: row.get(1)?,
                name: row.get(2)?,
                description: row.get(3)?,
                unit: row.get(4)?,
                order: row.get(5)?,
                adjustment_percent: row.get(6)?,
                repeats_next_budget: row.get::<_, i32>(7)? != 0,
                is_optional: row.get::<_, i32>(8)? != 0,
                observations: row.get(9)?,
                values: Vec::new(),
                effective_adjustment_percent: None,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // Valores
    let mut stmt = conn
        .prepare("SELECT id, item_id, budgeted, realized, adjusted, estimated_fixed, adjustment_percent, custom_adjustment, notes, created_at, updated_at FROM budget_values ORDER BY id")
        .map_err(|e| e.to_string())?;
    let values: Vec<BudgetValue> = stmt
        .query_map([], |row| {
            Ok(BudgetValue {
                id: row.get(0)?,
                item_id: row.get(1)?,
                budgeted: row.get(2)?,
                realized: row.get(3)?,
                adjusted: row.get(4)?,
                estimated_fixed: row.get(5)?,
                adjustment_percent: row.get(6)?,
                custom_adjustment: row.get(7)?,
                notes: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                estimated: None,
                variance: None,
                variance_percent: None,
                used_percent: None,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // Parâmetros
    let parameters = conn
        .query_row(
            "SELECT id, total_square_meters, lot_simulation_1, lot_simulation_2, lot_simulation_3, habite_se_discount FROM system_parameters WHERE id = 1",
            [],
            |row| {
                Ok(SystemParameters {
                    id: row.get(0)?,
                    total_square_meters: row.get(1)?,
                    lot_simulation_1: row.get(2)?,
                    lot_simulation_2: row.get(3)?,
                    lot_simulation_3: row.get(4)?,
                    habite_se_discount: row.get(5)?,
                })
            },
        )
        .unwrap_or_default();

    // Timestamp da exportação
    let exported_at: String = conn
        .query_row("SELECT datetime('now')", [], |row| row.get(0))
        .unwrap_or_else(|_| "unknown".to_string());

    let export = ExportData {
        version: "1.0".to_string(),
        exported_at,
        scenarios,
        categories,
        items,
        values,
        parameters,
    };

    serde_json::to_string_pretty(&export).map_err(|e| format!("Erro ao serializar dados: {}", e))
}

#[tauri::command]
pub fn import_data(db: State<Database>, json_string: String) -> Result<String, String> {
    let data: ExportData =
        serde_json::from_str(&json_string).map_err(|e| format!("JSON inválido: {}", e))?;

    // Validação básica
    if data.version.is_empty() {
        return Err("Dados de exportação sem versão.".to_string());
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Usar transação para garantir atomicidade
    conn.execute_batch("BEGIN TRANSACTION;")
        .map_err(|e| e.to_string())?;

    let result = (|| -> Result<(), String> {
        // Limpar dados existentes (ordem importa por causa das FK)
        conn.execute("DELETE FROM budget_values", [])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM budget_items", [])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM budget_categories", [])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM budget_scenarios", [])
            .map_err(|e| e.to_string())?;

        // Importar cenários
        for s in &data.scenarios {
            conn.execute(
                "INSERT INTO budget_scenarios (id, name, description, year, base_scenario_id, is_baseline, is_approved, is_closed, general_adjustment, risk_margin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                rusqlite::params![
                    s.id,
                    s.name,
                    s.description,
                    s.year,
                    s.base_scenario_id,
                    s.is_baseline as i32,
                    s.is_approved as i32,
                    s.is_closed as i32,
                    s.general_adjustment,
                    s.risk_margin,
                    s.created_at,
                    s.updated_at,
                ],
            )
            .map_err(|e| format!("Erro ao importar cenário '{}': {}", s.name, e))?;
        }

        // Importar categorias (sem parent primeiro, depois com parent)
        // Primeiro as que não têm parent
        for c in &data.categories {
            if c.parent_category_id.is_none() {
                conn.execute(
                    "INSERT INTO budget_categories (id, scenario_id, parent_category_id, name, description, code, item_type, \"order\", adjustment_percent, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    rusqlite::params![
                        c.id, c.scenario_id, c.parent_category_id, c.name, c.description,
                        c.code, c.item_type, c.order, c.adjustment_percent, c.created_at, c.updated_at,
                    ],
                )
                .map_err(|e| format!("Erro ao importar categoria '{}': {}", c.name, e))?;
            }
        }
        // Depois as que têm parent (podemos precisar de múltiplas passadas para hierarquias profundas)
        let mut remaining: Vec<&BudgetCategory> = data
            .categories
            .iter()
            .filter(|c| c.parent_category_id.is_some())
            .collect();

        let max_passes = 20; // evitar loop infinito
        let mut pass = 0;
        while !remaining.is_empty() && pass < max_passes {
            let mut still_remaining = Vec::new();
            for c in &remaining {
                let result = conn.execute(
                    "INSERT INTO budget_categories (id, scenario_id, parent_category_id, name, description, code, item_type, \"order\", adjustment_percent, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    rusqlite::params![
                        c.id, c.scenario_id, c.parent_category_id, c.name, c.description,
                        c.code, c.item_type, c.order, c.adjustment_percent, c.created_at, c.updated_at,
                    ],
                );
                if result.is_err() {
                    still_remaining.push(*c);
                }
            }
            remaining = still_remaining;
            pass += 1;
        }

        if !remaining.is_empty() {
            return Err("Erro ao importar categorias: referências circulares ou pais ausentes.".to_string());
        }

        // Importar itens
        for i in &data.items {
            conn.execute(
                "INSERT INTO budget_items (id, category_id, name, description, unit, \"order\", adjustment_percent, repeats_next_budget, is_optional, observations) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                rusqlite::params![
                    i.id,
                    i.category_id,
                    i.name,
                    i.description,
                    i.unit,
                    i.order,
                    i.adjustment_percent,
                    i.repeats_next_budget as i32,
                    i.is_optional as i32,
                    i.observations,
                ],
            )
            .map_err(|e| format!("Erro ao importar item '{}': {}", i.name, e))?;
        }

        // Importar valores
        for v in &data.values {
            conn.execute(
                "INSERT INTO budget_values (id, item_id, budgeted, realized, adjusted, estimated_fixed, adjustment_percent, custom_adjustment, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                rusqlite::params![
                    v.id,
                    v.item_id,
                    v.budgeted,
                    v.realized,
                    v.adjusted,
                    v.estimated_fixed,
                    v.adjustment_percent,
                    v.custom_adjustment,
                    v.notes,
                    v.created_at,
                    v.updated_at,
                ],
            )
            .map_err(|e| format!("Erro ao importar valor: {}", e))?;
        }

        // Atualizar parâmetros
        let p = &data.parameters;
        conn.execute(
            "UPDATE system_parameters SET total_square_meters = ?, lot_simulation_1 = ?, lot_simulation_2 = ?, lot_simulation_3 = ?, habite_se_discount = ? WHERE id = 1",
            rusqlite::params![
                p.total_square_meters,
                p.lot_simulation_1,
                p.lot_simulation_2,
                p.lot_simulation_3,
                p.habite_se_discount,
            ],
        )
        .map_err(|e| format!("Erro ao importar parâmetros: {}", e))?;

        Ok(())
    })();

    match result {
        Ok(()) => {
            conn.execute_batch("COMMIT;").map_err(|e| e.to_string())?;
            Ok(format!(
                "Importação concluída: {} cenários, {} categorias, {} itens, {} valores.",
                data.scenarios.len(),
                data.categories.len(),
                data.items.len(),
                data.values.len()
            ))
        }
        Err(e) => {
            conn.execute_batch("ROLLBACK;").ok();
            Err(format!("Erro na importação (rollback realizado): {}", e))
        }
    }
}

#[tauri::command]
pub fn get_db_stats(db: State<Database>) -> Result<DbStats, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let scenario_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM budget_scenarios", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    let category_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM budget_categories", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    let item_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM budget_items", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    let value_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM budget_values", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    // Tamanho aproximado do banco via page_count * page_size
    let page_count: i64 = conn
        .query_row("PRAGMA page_count", [], |row| row.get(0))
        .unwrap_or(0);
    let page_size: i64 = conn
        .query_row("PRAGMA page_size", [], |row| row.get(0))
        .unwrap_or(4096);

    Ok(DbStats {
        scenario_count,
        category_count,
        item_count,
        value_count,
        db_size_bytes: page_count * page_size,
    })
}
