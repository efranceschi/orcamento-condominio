use tauri::State;
use crate::db::Database;
use crate::models::item::*;
use crate::models::value::*;

/// Calcula o percentual de ajuste efetivo para um item, seguindo a hierarquia:
/// item.adj > category.adj > parent_category.adj (recursivo) > scenario.general_adjustment > 0
fn calculate_effective_adjustment(
    conn: &rusqlite::Connection,
    item_adjustment: Option<f64>,
    category_id: i64,
) -> Result<f64, String> {
    // Se o item tem ajuste próprio, usa ele
    if let Some(adj) = item_adjustment {
        return Ok(adj);
    }

    // Buscar ajuste da categoria e subir na hierarquia
    let adj = find_category_adjustment(conn, category_id)?;
    if let Some(a) = adj {
        return Ok(a);
    }

    // Buscar general_adjustment do cenário via category -> scenario_id
    let scenario_adj: f64 = conn
        .query_row(
            "SELECT s.general_adjustment FROM budget_scenarios s INNER JOIN budget_categories c ON c.scenario_id = s.id WHERE c.id = ?",
            [category_id],
            |row| row.get(0),
        )
        .unwrap_or(0.0);

    if scenario_adj != 0.0 {
        return Ok(scenario_adj);
    }

    Ok(0.0)
}

/// Busca recursivamente o adjustment_percent subindo na hierarquia de categorias
fn find_category_adjustment(
    conn: &rusqlite::Connection,
    category_id: i64,
) -> Result<Option<f64>, String> {
    let row: (Option<f64>, Option<i64>) = conn
        .query_row(
            "SELECT adjustment_percent, parent_category_id FROM budget_categories WHERE id = ?",
            [category_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Categoria não encontrada: {}", e))?;

    if let Some(adj) = row.0 {
        return Ok(Some(adj));
    }

    // Se tem pai, sobe na hierarquia
    if let Some(parent_id) = row.1 {
        return find_category_adjustment(conn, parent_id);
    }

    Ok(None)
}

/// Busca o risk_margin do cenário associado à categoria
fn get_scenario_risk_margin(conn: &rusqlite::Connection, category_id: i64) -> f64 {
    conn.query_row(
        "SELECT s.risk_margin FROM budget_scenarios s INNER JOIN budget_categories c ON c.scenario_id = s.id WHERE c.id = ?",
        [category_id],
        |row| row.get(0),
    )
    .unwrap_or(0.0)
}

/// Calcula campos derivados de um BudgetValue
fn compute_value_fields(
    value: &mut BudgetValue,
    effective_adj: f64,
    risk_margin: f64,
    repeats_next_budget: bool,
) {
    // estimated
    if let Some(fixed) = value.estimated_fixed {
        value.estimated = Some(fixed);
    } else if repeats_next_budget {
        value.estimated = Some(0.0);
    } else {
        let total_pct = effective_adj + risk_margin;
        value.estimated = Some(value.budgeted * (1.0 + total_pct / 100.0));
    }

    // variance = realized - budgeted
    if let Some(realized) = value.realized {
        value.variance = Some(realized - value.budgeted);
        // variance_percent
        if value.budgeted != 0.0 {
            value.variance_percent = Some(((realized - value.budgeted) / value.budgeted) * 100.0);
        } else {
            value.variance_percent = Some(0.0);
        }
    } else {
        value.variance = Some(0.0);
        value.variance_percent = Some(0.0);
    }

    // used_percent = (realized / budgeted) * 100
    if let Some(realized) = value.realized {
        if value.budgeted != 0.0 {
            value.used_percent = Some((realized / value.budgeted) * 100.0);
        } else {
            value.used_percent = Some(0.0);
        }
    }
}

/// Busca os valores de um item com campos calculados
fn fetch_values_for_item(
    conn: &rusqlite::Connection,
    item_id: i64,
    effective_adj: f64,
    risk_margin: f64,
    repeats_next_budget: bool,
) -> Result<Vec<BudgetValue>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, item_id, budgeted, realized, adjusted, estimated_fixed, adjustment_percent, custom_adjustment, notes, created_at, updated_at FROM budget_values WHERE item_id = ? ORDER BY id ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(rusqlite::params![item_id], |row| {
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
        .map_err(|e| e.to_string())?;

    let mut values = Vec::new();
    for row in rows {
        let mut value = row.map_err(|e| e.to_string())?;
        compute_value_fields(&mut value, effective_adj, risk_margin, repeats_next_budget);
        values.push(value);
    }

    Ok(values)
}

/// Busca um item flat pelo ID
fn fetch_item(conn: &rusqlite::Connection, id: i64) -> Result<BudgetItem, String> {
    conn.query_row(
        "SELECT id, category_id, name, description, unit, \"order\", adjustment_percent, repeats_next_budget, is_optional, observations FROM budget_items WHERE id = ?",
        [id],
        |row| {
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
        },
    )
    .map_err(|e| format!("Item não encontrado: {}", e))
}

#[tauri::command]
pub fn list_items(
    db: State<Database>,
    category_id: i64,
) -> Result<Vec<BudgetItem>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let risk_margin = get_scenario_risk_margin(&conn, category_id);

    let mut stmt = conn
        .prepare(
            "SELECT id, category_id, name, description, unit, \"order\", adjustment_percent, repeats_next_budget, is_optional, observations FROM budget_items WHERE category_id = ? ORDER BY \"order\" ASC, name ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(rusqlite::params![category_id], |row| {
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
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    for row in rows {
        let mut item = row.map_err(|e| e.to_string())?;
        let effective_adj = calculate_effective_adjustment(&conn, item.adjustment_percent, item.category_id)?;
        item.effective_adjustment_percent = Some(effective_adj);
        item.values = fetch_values_for_item(
            &conn,
            item.id.unwrap(),
            effective_adj,
            risk_margin,
            item.repeats_next_budget,
        )?;
        items.push(item);
    }

    Ok(items)
}

#[tauri::command]
pub fn get_item(db: State<Database>, id: i64) -> Result<BudgetItem, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut item = fetch_item(&conn, id)?;
    let effective_adj = calculate_effective_adjustment(&conn, item.adjustment_percent, item.category_id)?;
    let risk_margin = get_scenario_risk_margin(&conn, item.category_id);
    item.effective_adjustment_percent = Some(effective_adj);
    item.values = fetch_values_for_item(&conn, id, effective_adj, risk_margin, item.repeats_next_budget)?;

    Ok(item)
}

#[tauri::command]
pub fn create_item(
    db: State<Database>,
    request: CreateItemRequest,
) -> Result<BudgetItem, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Verificar que a categoria existe
    let _: i64 = conn
        .query_row(
            "SELECT id FROM budget_categories WHERE id = ?",
            [request.category_id],
            |row| row.get(0),
        )
        .map_err(|_| "Categoria não encontrada.".to_string())?;

    // Determinar ordem se não fornecida
    let order = match request.order {
        Some(o) => o,
        None => {
            let max_order: i32 = conn
                .query_row(
                    "SELECT COALESCE(MAX(\"order\"), 0) FROM budget_items WHERE category_id = ?",
                    [request.category_id],
                    |row| row.get(0),
                )
                .unwrap_or(0);
            max_order + 1
        }
    };

    let repeats = request.repeats_next_budget.unwrap_or(false);
    let optional = request.is_optional.unwrap_or(false);

    conn.execute(
        "INSERT INTO budget_items (category_id, name, description, unit, \"order\", adjustment_percent, repeats_next_budget, is_optional, observations) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        rusqlite::params![
            request.category_id,
            request.name,
            request.description,
            request.unit,
            order,
            request.adjustment_percent,
            repeats as i32,
            optional as i32,
            request.observations,
        ],
    )
    .map_err(|e| e.to_string())?;

    let item_id = conn.last_insert_rowid();

    // Se valores iniciais foram fornecidos, criar BudgetValue
    if request.budgeted.is_some() || request.realized.is_some() || request.adjusted.is_some() {
        let budgeted = request.budgeted.unwrap_or(0.0);
        conn.execute(
            "INSERT INTO budget_values (item_id, budgeted, realized, adjusted) VALUES (?, ?, ?, ?)",
            rusqlite::params![item_id, budgeted, request.realized, request.adjusted],
        )
        .map_err(|e| e.to_string())?;
    }

    drop(conn);
    get_item(db, item_id)
}

#[tauri::command]
pub fn update_item(
    db: State<Database>,
    id: i64,
    request: UpdateItemRequest,
) -> Result<BudgetItem, String> {
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
    if let Some(ref unit) = request.unit {
        updates.push("unit = ?");
        params.push(Box::new(unit.clone()));
    }
    if let Some(order) = request.order {
        updates.push("\"order\" = ?");
        params.push(Box::new(order));
    }
    if let Some(adj) = request.adjustment_percent {
        updates.push("adjustment_percent = ?");
        params.push(Box::new(adj));
    }
    if let Some(repeats) = request.repeats_next_budget {
        updates.push("repeats_next_budget = ?");
        params.push(Box::new(repeats as i32));
    }
    if let Some(optional) = request.is_optional {
        updates.push("is_optional = ?");
        params.push(Box::new(optional as i32));
    }
    if let Some(ref obs) = request.observations {
        updates.push("observations = ?");
        params.push(Box::new(obs.clone()));
    }

    if updates.is_empty() {
        drop(conn);
        return get_item(db, id);
    }

    let sql = format!("UPDATE budget_items SET {} WHERE id = ?", updates.join(", "));
    params.push(Box::new(id));

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, param_refs.as_slice())
        .map_err(|e| e.to_string())?;

    drop(conn);
    get_item(db, id)
}

#[tauri::command]
pub fn delete_item(db: State<Database>, id: i64) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // ON DELETE CASCADE cuida dos budget_values
    conn.execute("DELETE FROM budget_items WHERE id = ?", [id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn create_value(
    db: State<Database>,
    request: CreateValueRequest,
) -> Result<BudgetValue, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Verificar que o item existe
    let _: i64 = conn
        .query_row(
            "SELECT id FROM budget_items WHERE id = ?",
            [request.item_id],
            |row| row.get(0),
        )
        .map_err(|_| "Item não encontrado.".to_string())?;

    let budgeted = request.budgeted.unwrap_or(0.0);

    conn.execute(
        "INSERT INTO budget_values (item_id, budgeted, realized, adjusted, estimated_fixed, adjustment_percent, custom_adjustment, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        rusqlite::params![
            request.item_id,
            budgeted,
            request.realized,
            request.adjusted,
            request.estimated_fixed,
            request.adjustment_percent,
            request.custom_adjustment,
            request.notes,
        ],
    )
    .map_err(|e| e.to_string())?;

    let value_id = conn.last_insert_rowid();

    // Buscar o item para calcular campos derivados
    let item = fetch_item(&conn, request.item_id)?;
    let effective_adj = calculate_effective_adjustment(&conn, item.adjustment_percent, item.category_id)?;
    let risk_margin = get_scenario_risk_margin(&conn, item.category_id);

    let mut value = conn
        .query_row(
            "SELECT id, item_id, budgeted, realized, adjusted, estimated_fixed, adjustment_percent, custom_adjustment, notes, created_at, updated_at FROM budget_values WHERE id = ?",
            [value_id],
            |row| {
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
            },
        )
        .map_err(|e| e.to_string())?;

    compute_value_fields(&mut value, effective_adj, risk_margin, item.repeats_next_budget);

    Ok(value)
}

#[tauri::command]
pub fn update_value(
    db: State<Database>,
    id: i64,
    request: UpdateValueRequest,
) -> Result<BudgetValue, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut updates = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(budgeted) = request.budgeted {
        updates.push("budgeted = ?");
        params.push(Box::new(budgeted));
    }
    if let Some(realized) = request.realized {
        updates.push("realized = ?");
        params.push(Box::new(realized));
    }
    if let Some(adjusted) = request.adjusted {
        updates.push("adjusted = ?");
        params.push(Box::new(adjusted));
    }
    if let Some(est) = request.estimated_fixed {
        updates.push("estimated_fixed = ?");
        params.push(Box::new(est));
    }
    if let Some(adj) = request.adjustment_percent {
        updates.push("adjustment_percent = ?");
        params.push(Box::new(adj));
    }
    if let Some(custom) = request.custom_adjustment {
        updates.push("custom_adjustment = ?");
        params.push(Box::new(custom));
    }
    if let Some(ref notes) = request.notes {
        updates.push("notes = ?");
        params.push(Box::new(notes.clone()));
    }

    if !updates.is_empty() {
        updates.push("updated_at = datetime('now')");
        let sql = format!("UPDATE budget_values SET {} WHERE id = ?", updates.join(", "));
        params.push(Box::new(id));

        let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        conn.execute(&sql, param_refs.as_slice())
            .map_err(|e| e.to_string())?;
    }

    // Buscar o valor atualizado e calcular campos derivados
    let item_id: i64 = conn
        .query_row(
            "SELECT item_id FROM budget_values WHERE id = ?",
            [id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Valor não encontrado: {}", e))?;

    let item = fetch_item(&conn, item_id)?;
    let effective_adj = calculate_effective_adjustment(&conn, item.adjustment_percent, item.category_id)?;
    let risk_margin = get_scenario_risk_margin(&conn, item.category_id);

    let mut value = conn
        .query_row(
            "SELECT id, item_id, budgeted, realized, adjusted, estimated_fixed, adjustment_percent, custom_adjustment, notes, created_at, updated_at FROM budget_values WHERE id = ?",
            [id],
            |row| {
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
            },
        )
        .map_err(|e| e.to_string())?;

    compute_value_fields(&mut value, effective_adj, risk_margin, item.repeats_next_budget);

    Ok(value)
}
