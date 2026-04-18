use tauri::State;
use crate::db::Database;
use crate::models::category::*;

/// Busca uma categoria flat (sem subcategorias) pelo ID
fn fetch_category(conn: &rusqlite::Connection, id: i64) -> Result<BudgetCategory, String> {
    conn.query_row(
        "SELECT id, scenario_id, parent_category_id, name, description, code, item_type, \"order\", adjustment_percent, created_at, updated_at FROM budget_categories WHERE id = ?",
        [id],
        |row| {
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
        },
    )
    .map_err(|e| format!("Categoria não encontrada: {}", e))
}

/// Constrói árvore hierárquica de categorias a partir de uma lista flat
fn build_category_tree(all: &[BudgetCategory], parent_id: Option<i64>) -> Vec<BudgetCategory> {
    let mut result: Vec<BudgetCategory> = all
        .iter()
        .filter(|c| c.parent_category_id == parent_id)
        .cloned()
        .collect();

    for cat in result.iter_mut() {
        cat.subcategories = build_category_tree(all, cat.id);
    }

    result.sort_by_key(|c| c.order);
    result
}

#[tauri::command]
pub fn list_categories(
    db: State<Database>,
    scenario_id: i64,
) -> Result<Vec<BudgetCategory>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, scenario_id, parent_category_id, name, description, code, item_type, \"order\", adjustment_percent, created_at, updated_at FROM budget_categories WHERE scenario_id = ? ORDER BY \"order\" ASC, name ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(rusqlite::params![scenario_id], |row| {
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
        .map_err(|e| e.to_string())?;

    let mut flat: Vec<BudgetCategory> = Vec::new();
    for row in rows {
        flat.push(row.map_err(|e| e.to_string())?);
    }

    Ok(build_category_tree(&flat, None))
}

#[tauri::command]
pub fn get_category(db: State<Database>, id: i64) -> Result<BudgetCategory, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    fetch_category(&conn, id)
}

#[tauri::command]
pub fn create_category(
    db: State<Database>,
    request: CreateCategoryRequest,
) -> Result<BudgetCategory, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Validar item_type
    ItemType::from_str(&request.item_type)?;

    // Se tem parent, validar que item_type corresponde
    if let Some(parent_id) = request.parent_category_id {
        let parent = fetch_category(&conn, parent_id)?;
        if parent.item_type != request.item_type {
            return Err(format!(
                "O tipo '{}' não corresponde ao tipo do pai '{}'. Subcategorias devem ter o mesmo tipo da categoria pai.",
                request.item_type, parent.item_type
            ));
        }
        // Validar que o parent pertence ao mesmo cenário
        if parent.scenario_id != request.scenario_id {
            return Err("A categoria pai pertence a outro cenário.".to_string());
        }
    }

    // Determinar ordem se não fornecida
    let order = match request.order {
        Some(o) => o,
        None => {
            let max_order: i32 = conn
                .query_row(
                    "SELECT COALESCE(MAX(\"order\"), 0) FROM budget_categories WHERE scenario_id = ? AND parent_category_id IS ?",
                    rusqlite::params![request.scenario_id, request.parent_category_id],
                    |row| row.get(0),
                )
                .unwrap_or(0);
            max_order + 1
        }
    };

    conn.execute(
        "INSERT INTO budget_categories (scenario_id, parent_category_id, name, description, code, item_type, \"order\", adjustment_percent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        rusqlite::params![
            request.scenario_id,
            request.parent_category_id,
            request.name,
            request.description,
            request.code,
            request.item_type,
            order,
            request.adjustment_percent,
        ],
    )
    .map_err(|e| e.to_string())?;

    let new_id = conn.last_insert_rowid();
    fetch_category(&conn, new_id)
}

#[tauri::command]
pub fn update_category(
    db: State<Database>,
    id: i64,
    request: UpdateCategoryRequest,
) -> Result<BudgetCategory, String> {
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
    if let Some(ref code) = request.code {
        updates.push("code = ?");
        params.push(Box::new(code.clone()));
    }
    if let Some(order) = request.order {
        updates.push("\"order\" = ?");
        params.push(Box::new(order));
    }
    if let Some(adj) = request.adjustment_percent {
        updates.push("adjustment_percent = ?");
        params.push(Box::new(adj));
    }

    if updates.is_empty() {
        return fetch_category(&conn, id);
    }

    updates.push("updated_at = datetime('now')");
    let sql = format!("UPDATE budget_categories SET {} WHERE id = ?", updates.join(", "));
    params.push(Box::new(id));

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, param_refs.as_slice())
        .map_err(|e| e.to_string())?;

    fetch_category(&conn, id)
}

#[tauri::command]
pub fn delete_category(db: State<Database>, id: i64) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Verificar se tem subcategorias
    let sub_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM budget_categories WHERE parent_category_id = ?",
            [id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if sub_count > 0 {
        return Err(format!(
            "Não é possível excluir: a categoria possui {} subcategoria(s). Remova-as primeiro.",
            sub_count
        ));
    }

    // Verificar se tem itens
    let item_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM budget_items WHERE category_id = ?",
            [id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if item_count > 0 {
        return Err(format!(
            "Não é possível excluir: a categoria possui {} item(ns). Remova-os primeiro.",
            item_count
        ));
    }

    conn.execute("DELETE FROM budget_categories WHERE id = ?", [id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn reorder_category(db: State<Database>, id: i64, new_order: i32) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE budget_categories SET \"order\" = ?, updated_at = datetime('now') WHERE id = ?",
        rusqlite::params![new_order, id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}
