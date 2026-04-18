use tauri::State;
use crate::db::Database;
use crate::models::scenario::*;

#[tauri::command]
pub fn list_scenarios(
    db: State<Database>,
    year: Option<i32>,
    is_baseline: Option<bool>,
) -> Result<Vec<BudgetScenario>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut sql = String::from(
        "SELECT id, name, description, year, base_scenario_id, is_baseline, is_approved, is_closed, general_adjustment, risk_margin, created_at, updated_at FROM budget_scenarios WHERE 1=1"
    );
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(y) = year {
        sql.push_str(" AND year = ?");
        params.push(Box::new(y));
    }
    if let Some(b) = is_baseline {
        sql.push_str(" AND is_baseline = ?");
        params.push(Box::new(b as i32));
    }

    sql.push_str(" ORDER BY year DESC, name ASC");

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(param_refs.as_slice(), |row| {
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
        .map_err(|e| e.to_string())?;

    let mut scenarios = Vec::new();
    for row in rows {
        scenarios.push(row.map_err(|e| e.to_string())?);
    }
    Ok(scenarios)
}

#[tauri::command]
pub fn get_scenario(db: State<Database>, id: i64) -> Result<BudgetScenario, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, name, description, year, base_scenario_id, is_baseline, is_approved, is_closed, general_adjustment, risk_margin, created_at, updated_at FROM budget_scenarios WHERE id = ?",
        [id],
        |row| {
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
        },
    )
    .map_err(|e| format!("Cenário não encontrado: {}", e))
}

#[tauri::command]
pub fn create_scenario(
    db: State<Database>,
    request: CreateScenarioRequest,
) -> Result<BudgetScenario, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO budget_scenarios (name, year, description, is_baseline, base_scenario_id) VALUES (?, ?, ?, ?, ?)",
        rusqlite::params![
            request.name,
            request.year,
            request.description,
            request.is_baseline as i32,
            request.base_scenario_id,
        ],
    )
    .map_err(|e| e.to_string())?;

    let scenario_id = conn.last_insert_rowid();

    // Inicializar categorias raiz (DESPESAS e RECEITAS)
    conn.execute(
        "INSERT INTO budget_categories (scenario_id, name, code, item_type, \"order\") VALUES (?, 'DESPESAS', 'D', 'expense', 1)",
        [scenario_id],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO budget_categories (scenario_id, name, code, item_type, \"order\") VALUES (?, 'RECEITAS', 'R', 'revenue', 2)",
        [scenario_id],
    )
    .map_err(|e| e.to_string())?;

    // Se copiar do ano anterior
    if request.copy_from_previous {
        let previous_year = request.year - 1;
        let base_id: Option<i64> = conn
            .query_row(
                "SELECT id FROM budget_scenarios WHERE year = ? AND is_baseline = 1 LIMIT 1",
                [previous_year],
                |row| row.get(0),
            )
            .ok();

        if let Some(base_id) = base_id {
            copy_scenario_structure(&conn, base_id, scenario_id)
                .map_err(|e| format!("Erro ao copiar estrutura: {}", e))?;
        }
    }

    drop(conn);
    get_scenario(db, scenario_id)
}

fn copy_scenario_structure(
    conn: &rusqlite::Connection,
    source_id: i64,
    target_id: i64,
) -> Result<(), rusqlite::Error> {
    // Buscar categorias raiz do cenário fonte
    let mut stmt = conn.prepare(
        "SELECT id, name, code, item_type, \"order\", adjustment_percent FROM budget_categories WHERE scenario_id = ? AND parent_category_id IS NULL"
    )?;
    let source_roots: Vec<(i64, String, Option<String>, String, i32, Option<f64>)> = stmt
        .query_map([source_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?))
        })?
        .filter_map(|r| r.ok())
        .collect();

    // Buscar categorias raiz do target (já criadas)
    let mut stmt = conn.prepare(
        "SELECT id, item_type FROM budget_categories WHERE scenario_id = ? AND parent_category_id IS NULL"
    )?;
    let target_roots: Vec<(i64, String)> = stmt
        .query_map([target_id], |row| Ok((row.get(0)?, row.get(1)?)))?
        .filter_map(|r| r.ok())
        .collect();

    for (source_root_id, _name, _code, item_type, _order, _adj) in &source_roots {
        // Encontrar o target root correspondente pelo tipo
        if let Some((target_root_id, _)) = target_roots.iter().find(|(_, t)| t == item_type) {
            copy_children(conn, *source_root_id, *target_root_id, target_id)?;
        }
    }

    Ok(())
}

fn copy_children(
    conn: &rusqlite::Connection,
    source_parent_id: i64,
    target_parent_id: i64,
    target_scenario_id: i64,
) -> Result<(), rusqlite::Error> {
    // Copiar subcategorias
    let mut stmt = conn.prepare(
        "SELECT id, name, description, code, item_type, \"order\", adjustment_percent FROM budget_categories WHERE parent_category_id = ?"
    )?;
    let children: Vec<(i64, String, Option<String>, Option<String>, String, i32, Option<f64>)> = stmt
        .query_map([source_parent_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?))
        })?
        .filter_map(|r| r.ok())
        .collect();

    for (child_id, name, desc, code, item_type, order, adj) in children {
        conn.execute(
            "INSERT INTO budget_categories (scenario_id, parent_category_id, name, description, code, item_type, \"order\", adjustment_percent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            rusqlite::params![target_scenario_id, target_parent_id, name, desc, code, item_type, order, adj],
        )?;
        let new_cat_id = conn.last_insert_rowid();

        // Copiar itens da categoria
        copy_items(conn, child_id, new_cat_id)?;

        // Recursão para subcategorias
        copy_children(conn, child_id, new_cat_id, target_scenario_id)?;
    }

    // Copiar itens diretos do parent
    copy_items(conn, source_parent_id, target_parent_id)?;

    Ok(())
}

fn copy_items(
    conn: &rusqlite::Connection,
    source_category_id: i64,
    target_category_id: i64,
) -> Result<(), rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, name, description, unit, \"order\", adjustment_percent, repeats_next_budget, is_optional, observations FROM budget_items WHERE category_id = ?"
    )?;
    let items: Vec<(i64, String, Option<String>, Option<String>, i32, Option<f64>, i32, i32, Option<String>)> = stmt
        .query_map([source_category_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?))
        })?
        .filter_map(|r| r.ok())
        .collect();

    for (old_item_id, name, desc, unit, order, adj, repeats, optional, obs) in items {
        conn.execute(
            "INSERT INTO budget_items (category_id, name, description, unit, \"order\", adjustment_percent, repeats_next_budget, is_optional, observations) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            rusqlite::params![target_category_id, name, desc, unit, order, adj, repeats, optional, obs],
        )?;
        let new_item_id = conn.last_insert_rowid();

        // Copiar valores
        let mut vstmt = conn.prepare(
            "SELECT budgeted, realized, adjusted, estimated_fixed, adjustment_percent, custom_adjustment, notes FROM budget_values WHERE item_id = ?"
        )?;
        let values: Vec<(f64, Option<f64>, Option<f64>, Option<f64>, Option<f64>, Option<f64>, Option<String>)> = vstmt
            .query_map([old_item_id], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?))
            })?
            .filter_map(|r| r.ok())
            .collect();

        for (budgeted, realized, adjusted, est_fixed, adj_pct, custom, notes) in values {
            conn.execute(
                "INSERT INTO budget_values (item_id, budgeted, realized, adjusted, estimated_fixed, adjustment_percent, custom_adjustment, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                rusqlite::params![new_item_id, budgeted, realized, adjusted, est_fixed, adj_pct, custom, notes],
            )?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn update_scenario(
    db: State<Database>,
    id: i64,
    request: UpdateScenarioRequest,
) -> Result<BudgetScenario, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut updates = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref name) = request.name {
        updates.push("name = ?");
        params.push(Box::new(name.clone()));
    }
    if let Some(ref desc) = request.description {
        updates.push("description = ?");
        params.push(Box::new(desc.clone()));
    }
    if let Some(year) = request.year {
        updates.push("year = ?");
        params.push(Box::new(year));
    }
    if let Some(adj) = request.general_adjustment {
        updates.push("general_adjustment = ?");
        params.push(Box::new(adj));
    }
    if let Some(risk) = request.risk_margin {
        updates.push("risk_margin = ?");
        params.push(Box::new(risk));
    }
    if let Some(baseline) = request.is_baseline {
        updates.push("is_baseline = ?");
        params.push(Box::new(baseline as i32));
    }
    if let Some(approved) = request.is_approved {
        updates.push("is_approved = ?");
        params.push(Box::new(approved as i32));
    }
    if let Some(closed) = request.is_closed {
        updates.push("is_closed = ?");
        params.push(Box::new(closed as i32));
    }

    if updates.is_empty() {
        drop(conn);
        return get_scenario(db, id);
    }

    updates.push("updated_at = datetime('now')");
    let sql = format!("UPDATE budget_scenarios SET {} WHERE id = ?", updates.join(", "));
    params.push(Box::new(id));

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, param_refs.as_slice()).map_err(|e| e.to_string())?;

    drop(conn);
    get_scenario(db, id)
}

#[tauri::command]
pub fn delete_scenario(db: State<Database>, id: i64) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM budget_scenarios WHERE id = ?", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
