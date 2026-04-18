use axum::{
    extract::{Path, Query, State as AxumState},
    http::{StatusCode, Uri, header},
    response::{IntoResponse, Json, Response},
    routing::{delete, get, post, put},
    Router,
};
use tower_http::cors::CorsLayer;
use std::sync::Arc;
use std::net::SocketAddr;
use std::path::PathBuf;
use tokio::sync::oneshot;

use crate::db::Database;
use crate::models::*;

/// Estado compartilhado do servidor HTTP
pub struct ServerState {
    pub db: Arc<Database>,
    pub dist_dir: Option<PathBuf>,
}

/// Handle para controlar o servidor (parar quando necessário)
pub struct ServerHandle {
    shutdown_tx: Option<oneshot::Sender<()>>,
}

impl ServerHandle {
    pub fn shutdown(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
    }
}

/// Inicia o servidor HTTP em background
pub async fn start_server(db: Arc<Database>, port: u16, dist_dir: Option<PathBuf>) -> Result<ServerHandle, String> {
    let state = Arc::new(ServerState { db, dist_dir });

    let cors = CorsLayer::permissive();

    let app = Router::new()
        // Cenários
        .route("/api/scenarios", get(list_scenarios_handler))
        .route("/api/scenarios", post(create_scenario_handler))
        .route("/api/scenarios/{id}", get(get_scenario_handler))
        .route("/api/scenarios/{id}", put(update_scenario_handler))
        .route("/api/scenarios/{id}", delete(delete_scenario_handler))
        // Categorias
        .route("/api/categories/{scenario_id}", get(list_categories_handler))
        .route("/api/categories/item/{id}", get(get_category_handler))
        .route("/api/categories", post(create_category_handler))
        .route("/api/categories/{id}", put(update_category_handler))
        .route("/api/categories/{id}", delete(delete_category_handler))
        .route("/api/categories/{id}/reorder", put(reorder_category_handler))
        // Itens
        .route("/api/items/by-category/{category_id}", get(list_items_handler))
        .route("/api/items/{id}", get(get_item_handler))
        .route("/api/items", post(create_item_handler))
        .route("/api/items/{id}", put(update_item_handler))
        .route("/api/items/{id}", delete(delete_item_handler))
        // Valores
        .route("/api/values", post(create_value_handler))
        .route("/api/values/{id}", put(update_value_handler))
        // Parâmetros
        .route("/api/parameters", get(get_parameters_handler))
        .route("/api/parameters", put(update_parameters_handler))
        // Análise
        .route("/api/analysis/summary/{scenario_id}", get(get_summary_handler))
        .route("/api/analysis/compare/{base_id}/{compared_id}", get(compare_handler))
        // Backup
        .route("/api/backup/export", get(export_data_handler))
        .route("/api/backup/import", post(import_data_handler))
        .route("/api/backup/stats", get(get_stats_handler))
        // Servir frontend (index.html para SPA routing)
        .fallback(get(spa_fallback))
        .layer(cors)
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));

    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| format!("Erro ao iniciar servidor na porta {}: {}", port, e))?;

    tokio::spawn(async move {
        axum::serve(listener, app)
            .with_graceful_shutdown(async {
                let _ = shutdown_rx.await;
            })
            .await
            .ok();
    });

    Ok(ServerHandle {
        shutdown_tx: Some(shutdown_tx),
    })
}

// ============================================================
// Handlers - Cenários
// ============================================================

#[derive(serde::Deserialize)]
struct ScenarioFilters {
    year: Option<i32>,
    is_baseline: Option<bool>,
}

async fn list_scenarios_handler(
    AxumState(state): AxumState<Arc<ServerState>>,
    Query(filters): Query<ScenarioFilters>,
) -> impl IntoResponse {
    let conn = state.db.conn.lock().unwrap();
    let mut sql = String::from(
        "SELECT id, name, description, year, base_scenario_id, is_baseline, is_approved, is_closed, general_adjustment, risk_margin, created_at, updated_at FROM budget_scenarios WHERE 1=1"
    );
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    if let Some(y) = filters.year {
        sql.push_str(" AND year = ?");
        params.push(Box::new(y));
    }
    if let Some(b) = filters.is_baseline {
        sql.push_str(" AND is_baseline = ?");
        params.push(Box::new(b as i32));
    }
    sql.push_str(" ORDER BY year DESC, name ASC");
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    };
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
        .unwrap();
    let scenarios: Vec<BudgetScenario> = rows.filter_map(|r| r.ok()).collect();
    Json(scenarios).into_response()
}

async fn get_scenario_handler(
    AxumState(state): AxumState<Arc<ServerState>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let conn = state.db.conn.lock().unwrap();
    match conn.query_row(
        "SELECT id, name, description, year, base_scenario_id, is_baseline, is_approved, is_closed, general_adjustment, risk_margin, created_at, updated_at FROM budget_scenarios WHERE id = ?",
        [id],
        |row| {
            Ok(BudgetScenario {
                id: row.get(0)?, name: row.get(1)?, description: row.get(2)?, year: row.get(3)?,
                base_scenario_id: row.get(4)?, is_baseline: row.get::<_, i32>(5)? != 0,
                is_approved: row.get::<_, i32>(6)? != 0, is_closed: row.get::<_, i32>(7)? != 0,
                general_adjustment: row.get(8)?, risk_margin: row.get(9)?,
                created_at: row.get(10)?, updated_at: row.get(11)?,
            })
        },
    ) {
        Ok(s) => Json(s).into_response(),
        Err(_) => (StatusCode::NOT_FOUND, Json(serde_json::json!({"error": "Cenário não encontrado"}))).into_response(),
    }
}

async fn create_scenario_handler(
    AxumState(state): AxumState<Arc<ServerState>>,
    Json(req): Json<scenario::CreateScenarioRequest>,
) -> impl IntoResponse {
    let conn = state.db.conn.lock().unwrap();
    match conn.execute(
        "INSERT INTO budget_scenarios (name, year, description, is_baseline, base_scenario_id) VALUES (?, ?, ?, ?, ?)",
        rusqlite::params![req.name, req.year, req.description, req.is_baseline as i32, req.base_scenario_id],
    ) {
        Ok(_) => {
            let id = conn.last_insert_rowid();
            conn.execute("INSERT INTO budget_categories (scenario_id, name, code, item_type, \"order\") VALUES (?, 'DESPESAS', 'D', 'expense', 1)", [id]).ok();
            conn.execute("INSERT INTO budget_categories (scenario_id, name, code, item_type, \"order\") VALUES (?, 'RECEITAS', 'R', 'revenue', 2)", [id]).ok();
            drop(conn);
            let conn2 = state.db.conn.lock().unwrap();
            let scenario = conn2.query_row(
                "SELECT id, name, description, year, base_scenario_id, is_baseline, is_approved, is_closed, general_adjustment, risk_margin, created_at, updated_at FROM budget_scenarios WHERE id = ?",
                [id],
                |row| Ok(BudgetScenario { id: row.get(0)?, name: row.get(1)?, description: row.get(2)?, year: row.get(3)?, base_scenario_id: row.get(4)?, is_baseline: row.get::<_, i32>(5)? != 0, is_approved: row.get::<_, i32>(6)? != 0, is_closed: row.get::<_, i32>(7)? != 0, general_adjustment: row.get(8)?, risk_margin: row.get(9)?, created_at: row.get(10)?, updated_at: row.get(11)? })
            ).unwrap();
            (StatusCode::CREATED, Json(scenario)).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

async fn update_scenario_handler(
    AxumState(state): AxumState<Arc<ServerState>>,
    Path(id): Path<i64>,
    Json(req): Json<scenario::UpdateScenarioRequest>,
) -> impl IntoResponse {
    let conn = state.db.conn.lock().unwrap();
    let mut updates = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    if let Some(ref name) = req.name { updates.push("name = ?"); params.push(Box::new(name.clone())); }
    if let Some(ref desc) = req.description { updates.push("description = ?"); params.push(Box::new(desc.clone())); }
    if let Some(year) = req.year { updates.push("year = ?"); params.push(Box::new(year)); }
    if let Some(adj) = req.general_adjustment { updates.push("general_adjustment = ?"); params.push(Box::new(adj)); }
    if let Some(risk) = req.risk_margin { updates.push("risk_margin = ?"); params.push(Box::new(risk)); }
    if let Some(b) = req.is_baseline { updates.push("is_baseline = ?"); params.push(Box::new(b as i32)); }
    if let Some(a) = req.is_approved { updates.push("is_approved = ?"); params.push(Box::new(a as i32)); }
    if let Some(c) = req.is_closed { updates.push("is_closed = ?"); params.push(Box::new(c as i32)); }
    if !updates.is_empty() {
        updates.push("updated_at = datetime('now')");
        let sql = format!("UPDATE budget_scenarios SET {} WHERE id = ?", updates.join(", "));
        params.push(Box::new(id));
        let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        conn.execute(&sql, param_refs.as_slice()).ok();
    }
    drop(conn);
    let conn2 = state.db.conn.lock().unwrap();
    let scenario = conn2.query_row(
        "SELECT id, name, description, year, base_scenario_id, is_baseline, is_approved, is_closed, general_adjustment, risk_margin, created_at, updated_at FROM budget_scenarios WHERE id = ?",
        [id],
        |row| Ok(BudgetScenario { id: row.get(0)?, name: row.get(1)?, description: row.get(2)?, year: row.get(3)?, base_scenario_id: row.get(4)?, is_baseline: row.get::<_, i32>(5)? != 0, is_approved: row.get::<_, i32>(6)? != 0, is_closed: row.get::<_, i32>(7)? != 0, general_adjustment: row.get(8)?, risk_margin: row.get(9)?, created_at: row.get(10)?, updated_at: row.get(11)? })
    ).unwrap();
    Json(scenario).into_response()
}

async fn delete_scenario_handler(
    AxumState(state): AxumState<Arc<ServerState>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let conn = state.db.conn.lock().unwrap();
    conn.execute("DELETE FROM budget_scenarios WHERE id = ?", [id]).ok();
    StatusCode::NO_CONTENT.into_response()
}

// ============================================================
// Handlers - Categorias (delegam para os mesmos queries)
// ============================================================

async fn list_categories_handler(
    AxumState(state): AxumState<Arc<ServerState>>,
    Path(scenario_id): Path<i64>,
) -> impl IntoResponse {
    let conn = state.db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, scenario_id, parent_category_id, name, description, code, item_type, \"order\", adjustment_percent, created_at, updated_at FROM budget_categories WHERE scenario_id = ? ORDER BY \"order\", name"
    ).unwrap();
    let all_cats: Vec<BudgetCategory> = stmt.query_map([scenario_id], |row| {
        Ok(BudgetCategory {
            id: row.get(0)?, scenario_id: row.get(1)?, parent_category_id: row.get(2)?,
            name: row.get(3)?, description: row.get(4)?, code: row.get(5)?,
            item_type: row.get(6)?, order: row.get(7)?, adjustment_percent: row.get(8)?,
            created_at: row.get(9)?, updated_at: row.get(10)?,
            subcategories: vec![], items: vec![],
        })
    }).unwrap().filter_map(|r| r.ok()).collect();
    // Construir árvore
    let roots = build_tree(&all_cats);
    Json(roots).into_response()
}

fn build_tree(cats: &[BudgetCategory]) -> Vec<BudgetCategory> {
    let mut roots: Vec<BudgetCategory> = Vec::new();
    for cat in cats {
        if cat.parent_category_id.is_none() {
            let mut root = cat.clone();
            root.subcategories = find_children(cat.id.unwrap_or(0), cats);
            roots.push(root);
        }
    }
    roots
}

fn find_children(parent_id: i64, cats: &[BudgetCategory]) -> Vec<BudgetCategory> {
    let mut children = Vec::new();
    for cat in cats {
        if cat.parent_category_id == Some(parent_id) {
            let mut child = cat.clone();
            child.subcategories = find_children(cat.id.unwrap_or(0), cats);
            children.push(child);
        }
    }
    children
}

async fn get_category_handler(
    AxumState(state): AxumState<Arc<ServerState>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let conn = state.db.conn.lock().unwrap();
    match conn.query_row(
        "SELECT id, scenario_id, parent_category_id, name, description, code, item_type, \"order\", adjustment_percent, created_at, updated_at FROM budget_categories WHERE id = ?",
        [id],
        |row| Ok(BudgetCategory { id: row.get(0)?, scenario_id: row.get(1)?, parent_category_id: row.get(2)?, name: row.get(3)?, description: row.get(4)?, code: row.get(5)?, item_type: row.get(6)?, order: row.get(7)?, adjustment_percent: row.get(8)?, created_at: row.get(9)?, updated_at: row.get(10)?, subcategories: vec![], items: vec![] })
    ) {
        Ok(c) => Json(c).into_response(),
        Err(_) => (StatusCode::NOT_FOUND, Json(serde_json::json!({"error": "Categoria não encontrada"}))).into_response(),
    }
}

async fn create_category_handler(
    AxumState(state): AxumState<Arc<ServerState>>,
    Json(req): Json<category::CreateCategoryRequest>,
) -> impl IntoResponse {
    let conn = state.db.conn.lock().unwrap();
    match conn.execute(
        "INSERT INTO budget_categories (scenario_id, parent_category_id, name, description, code, item_type, \"order\", adjustment_percent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        rusqlite::params![req.scenario_id, req.parent_category_id, req.name, req.description, req.code, req.item_type, req.order.unwrap_or(0), req.adjustment_percent],
    ) {
        Ok(_) => {
            let id = conn.last_insert_rowid();
            (StatusCode::CREATED, Json(serde_json::json!({"id": id}))).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": e.to_string()}))).into_response(),
    }
}

async fn update_category_handler(
    AxumState(state): AxumState<Arc<ServerState>>,
    Path(id): Path<i64>,
    Json(req): Json<category::UpdateCategoryRequest>,
) -> impl IntoResponse {
    let conn = state.db.conn.lock().unwrap();
    let mut updates = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    if let Some(ref n) = req.name { updates.push("name = ?"); params.push(Box::new(n.clone())); }
    if let Some(ref d) = req.description { updates.push("description = ?"); params.push(Box::new(d.clone())); }
    if let Some(ref c) = req.code { updates.push("code = ?"); params.push(Box::new(c.clone())); }
    if let Some(o) = req.order { updates.push("\"order\" = ?"); params.push(Box::new(o)); }
    if let Some(a) = req.adjustment_percent { updates.push("adjustment_percent = ?"); params.push(Box::new(a)); }
    if !updates.is_empty() {
        updates.push("updated_at = datetime('now')");
        let sql = format!("UPDATE budget_categories SET {} WHERE id = ?", updates.join(", "));
        params.push(Box::new(id));
        let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        conn.execute(&sql, param_refs.as_slice()).ok();
    }
    Json(serde_json::json!({"ok": true})).into_response()
}

async fn delete_category_handler(
    AxumState(state): AxumState<Arc<ServerState>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let conn = state.db.conn.lock().unwrap();
    // Verificar se tem filhos
    let child_count: i64 = conn.query_row("SELECT COUNT(*) FROM budget_categories WHERE parent_category_id = ?", [id], |r| r.get(0)).unwrap_or(0);
    if child_count > 0 {
        return (StatusCode::CONFLICT, Json(serde_json::json!({"error": "Categoria possui subcategorias"}))).into_response();
    }
    let item_count: i64 = conn.query_row("SELECT COUNT(*) FROM budget_items WHERE category_id = ?", [id], |r| r.get(0)).unwrap_or(0);
    if item_count > 0 {
        return (StatusCode::CONFLICT, Json(serde_json::json!({"error": "Categoria possui itens"}))).into_response();
    }
    conn.execute("DELETE FROM budget_categories WHERE id = ?", [id]).ok();
    StatusCode::NO_CONTENT.into_response()
}

#[derive(serde::Deserialize)]
struct ReorderRequest {
    new_order: i32,
}

async fn reorder_category_handler(
    AxumState(state): AxumState<Arc<ServerState>>,
    Path(id): Path<i64>,
    Json(req): Json<ReorderRequest>,
) -> impl IntoResponse {
    let conn = state.db.conn.lock().unwrap();
    conn.execute("UPDATE budget_categories SET \"order\" = ?, updated_at = datetime('now') WHERE id = ?", rusqlite::params![req.new_order, id]).ok();
    Json(serde_json::json!({"ok": true})).into_response()
}

// ============================================================
// Handlers - Itens e Valores
// ============================================================

async fn list_items_handler(
    AxumState(state): AxumState<Arc<ServerState>>,
    Path(category_id): Path<i64>,
) -> impl IntoResponse {
    let conn = state.db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT i.id, i.category_id, i.name, i.description, i.unit, i.\"order\", i.adjustment_percent, i.repeats_next_budget, i.is_optional, i.observations FROM budget_items i WHERE i.category_id = ? ORDER BY i.\"order\", i.name"
    ).unwrap();
    let items: Vec<BudgetItem> = stmt.query_map([category_id], |row| {
        Ok(BudgetItem {
            id: row.get(0)?, category_id: row.get(1)?, name: row.get(2)?,
            description: row.get(3)?, unit: row.get(4)?, order: row.get(5)?,
            adjustment_percent: row.get(6)?,
            repeats_next_budget: row.get::<_, i32>(7)? != 0,
            is_optional: row.get::<_, i32>(8)? != 0,
            observations: row.get(9)?,
            values: vec![], effective_adjustment_percent: None,
        })
    }).unwrap().filter_map(|r| r.ok()).collect();

    // Carregar valores para cada item
    let mut result = Vec::new();
    for mut item in items {
        let item_id = item.id.unwrap_or(0);
        let mut vstmt = conn.prepare(
            "SELECT id, item_id, budgeted, realized, adjusted, estimated_fixed, adjustment_percent, custom_adjustment, notes, created_at, updated_at FROM budget_values WHERE item_id = ?"
        ).unwrap();
        let vals: Vec<BudgetValue> = vstmt.query_map([item_id], |row| {
            let budgeted: f64 = row.get(2)?;
            let realized: Option<f64> = row.get(3)?;
            let used_pct = if budgeted > 0.0 { realized.map(|r| (r / budgeted) * 100.0) } else { None };
            let variance = realized.map(|r| r - budgeted);
            let variance_pct = if budgeted > 0.0 { variance.map(|v| (v / budgeted) * 100.0) } else { None };
            Ok(BudgetValue {
                id: row.get(0)?, item_id: row.get(1)?, budgeted,
                realized, adjusted: row.get(4)?, estimated_fixed: row.get(5)?,
                adjustment_percent: row.get(6)?, custom_adjustment: row.get(7)?,
                notes: row.get(8)?, created_at: row.get(9)?, updated_at: row.get(10)?,
                estimated: None, variance, variance_percent: variance_pct, used_percent: used_pct,
            })
        }).unwrap().filter_map(|r| r.ok()).collect();
        item.values = vals;
        result.push(item);
    }
    Json(result).into_response()
}

async fn get_item_handler(
    AxumState(state): AxumState<Arc<ServerState>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let conn = state.db.conn.lock().unwrap();
    match conn.query_row(
        "SELECT id, category_id, name, description, unit, \"order\", adjustment_percent, repeats_next_budget, is_optional, observations FROM budget_items WHERE id = ?",
        [id],
        |row| Ok(BudgetItem { id: row.get(0)?, category_id: row.get(1)?, name: row.get(2)?, description: row.get(3)?, unit: row.get(4)?, order: row.get(5)?, adjustment_percent: row.get(6)?, repeats_next_budget: row.get::<_, i32>(7)? != 0, is_optional: row.get::<_, i32>(8)? != 0, observations: row.get(9)?, values: vec![], effective_adjustment_percent: None })
    ) {
        Ok(item) => Json(item).into_response(),
        Err(_) => (StatusCode::NOT_FOUND, Json(serde_json::json!({"error": "Item não encontrado"}))).into_response(),
    }
}

async fn create_item_handler(
    AxumState(state): AxumState<Arc<ServerState>>,
    Json(req): Json<item::CreateItemRequest>,
) -> impl IntoResponse {
    let conn = state.db.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO budget_items (category_id, name, description, unit, \"order\", adjustment_percent, repeats_next_budget, is_optional, observations) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        rusqlite::params![req.category_id, req.name, req.description, req.unit, req.order.unwrap_or(0), req.adjustment_percent, req.repeats_next_budget.unwrap_or(false) as i32, req.is_optional.unwrap_or(false) as i32, req.observations],
    ).ok();
    let item_id = conn.last_insert_rowid();
    // Criar valor inicial se fornecido
    if req.budgeted.is_some() || req.realized.is_some() || req.adjusted.is_some() {
        conn.execute(
            "INSERT INTO budget_values (item_id, budgeted, realized, adjusted) VALUES (?, ?, ?, ?)",
            rusqlite::params![item_id, req.budgeted.unwrap_or(0.0), req.realized, req.adjusted],
        ).ok();
    }
    (StatusCode::CREATED, Json(serde_json::json!({"id": item_id}))).into_response()
}

async fn update_item_handler(
    AxumState(state): AxumState<Arc<ServerState>>,
    Path(id): Path<i64>,
    Json(req): Json<item::UpdateItemRequest>,
) -> impl IntoResponse {
    let conn = state.db.conn.lock().unwrap();
    let mut updates = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    if let Some(ref n) = req.name { updates.push("name = ?"); params.push(Box::new(n.clone())); }
    if let Some(ref d) = req.description { updates.push("description = ?"); params.push(Box::new(d.clone())); }
    if let Some(ref u) = req.unit { updates.push("unit = ?"); params.push(Box::new(u.clone())); }
    if let Some(o) = req.order { updates.push("\"order\" = ?"); params.push(Box::new(o)); }
    if let Some(a) = req.adjustment_percent { updates.push("adjustment_percent = ?"); params.push(Box::new(a)); }
    if let Some(r) = req.repeats_next_budget { updates.push("repeats_next_budget = ?"); params.push(Box::new(r as i32)); }
    if let Some(o) = req.is_optional { updates.push("is_optional = ?"); params.push(Box::new(o as i32)); }
    if let Some(ref obs) = req.observations { updates.push("observations = ?"); params.push(Box::new(obs.clone())); }
    if !updates.is_empty() {
        let sql = format!("UPDATE budget_items SET {} WHERE id = ?", updates.join(", "));
        params.push(Box::new(id));
        let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        conn.execute(&sql, param_refs.as_slice()).ok();
    }
    Json(serde_json::json!({"ok": true})).into_response()
}

async fn delete_item_handler(
    AxumState(state): AxumState<Arc<ServerState>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let conn = state.db.conn.lock().unwrap();
    conn.execute("DELETE FROM budget_items WHERE id = ?", [id]).ok();
    StatusCode::NO_CONTENT.into_response()
}

async fn create_value_handler(
    AxumState(state): AxumState<Arc<ServerState>>,
    Json(req): Json<value::CreateValueRequest>,
) -> impl IntoResponse {
    let conn = state.db.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO budget_values (item_id, budgeted, realized, adjusted, estimated_fixed, adjustment_percent, custom_adjustment, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        rusqlite::params![req.item_id, req.budgeted.unwrap_or(0.0), req.realized, req.adjusted, req.estimated_fixed, req.adjustment_percent, req.custom_adjustment, req.notes],
    ).ok();
    let id = conn.last_insert_rowid();
    (StatusCode::CREATED, Json(serde_json::json!({"id": id}))).into_response()
}

async fn update_value_handler(
    AxumState(state): AxumState<Arc<ServerState>>,
    Path(id): Path<i64>,
    Json(req): Json<value::UpdateValueRequest>,
) -> impl IntoResponse {
    let conn = state.db.conn.lock().unwrap();
    let mut updates = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    if let Some(b) = req.budgeted { updates.push("budgeted = ?"); params.push(Box::new(b)); }
    if let Some(r) = req.realized { updates.push("realized = ?"); params.push(Box::new(r)); }
    if let Some(a) = req.adjusted { updates.push("adjusted = ?"); params.push(Box::new(a)); }
    if let Some(e) = req.estimated_fixed { updates.push("estimated_fixed = ?"); params.push(Box::new(e)); }
    if let Some(a) = req.adjustment_percent { updates.push("adjustment_percent = ?"); params.push(Box::new(a)); }
    if let Some(c) = req.custom_adjustment { updates.push("custom_adjustment = ?"); params.push(Box::new(c)); }
    if let Some(ref n) = req.notes { updates.push("notes = ?"); params.push(Box::new(n.clone())); }
    if !updates.is_empty() {
        updates.push("updated_at = datetime('now')");
        let sql = format!("UPDATE budget_values SET {} WHERE id = ?", updates.join(", "));
        params.push(Box::new(id));
        let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        conn.execute(&sql, param_refs.as_slice()).ok();
    }
    Json(serde_json::json!({"ok": true})).into_response()
}

// ============================================================
// Handlers - Parâmetros
// ============================================================

async fn get_parameters_handler(
    AxumState(state): AxumState<Arc<ServerState>>,
) -> impl IntoResponse {
    let conn = state.db.conn.lock().unwrap();
    let params = conn.query_row(
        "SELECT id, total_square_meters, lot_simulation_1, lot_simulation_2, lot_simulation_3, habite_se_discount FROM system_parameters WHERE id = 1",
        [],
        |row| Ok(SystemParameters { id: row.get(0)?, total_square_meters: row.get(1)?, lot_simulation_1: row.get(2)?, lot_simulation_2: row.get(3)?, lot_simulation_3: row.get(4)?, habite_se_discount: row.get(5)? })
    ).unwrap_or_default();
    Json(params).into_response()
}

async fn update_parameters_handler(
    AxumState(state): AxumState<Arc<ServerState>>,
    Json(req): Json<parameters::UpdateParametersRequest>,
) -> impl IntoResponse {
    let conn = state.db.conn.lock().unwrap();
    let mut updates = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    if let Some(v) = req.total_square_meters { updates.push("total_square_meters = ?"); params.push(Box::new(v)); }
    if let Some(v) = req.lot_simulation_1 { updates.push("lot_simulation_1 = ?"); params.push(Box::new(v)); }
    if let Some(v) = req.lot_simulation_2 { updates.push("lot_simulation_2 = ?"); params.push(Box::new(v)); }
    if let Some(v) = req.lot_simulation_3 { updates.push("lot_simulation_3 = ?"); params.push(Box::new(v)); }
    if let Some(v) = req.habite_se_discount { updates.push("habite_se_discount = ?"); params.push(Box::new(v)); }
    if !updates.is_empty() {
        let sql = format!("UPDATE system_parameters SET {} WHERE id = 1", updates.join(", "));
        let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        conn.execute(&sql, param_refs.as_slice()).ok();
    }
    drop(conn);
    let conn2 = state.db.conn.lock().unwrap();
    let p = conn2.query_row(
        "SELECT id, total_square_meters, lot_simulation_1, lot_simulation_2, lot_simulation_3, habite_se_discount FROM system_parameters WHERE id = 1",
        [], |row| Ok(SystemParameters { id: row.get(0)?, total_square_meters: row.get(1)?, lot_simulation_1: row.get(2)?, lot_simulation_2: row.get(3)?, lot_simulation_3: row.get(4)?, habite_se_discount: row.get(5)? })
    ).unwrap_or_default();
    Json(p).into_response()
}

// ============================================================
// Handlers - Análise
// ============================================================

async fn get_summary_handler(
    AxumState(state): AxumState<Arc<ServerState>>,
    Path(scenario_id): Path<i64>,
) -> impl IntoResponse {
    // Usar o comando Tauri existente via chamada direta ao DB
    let conn = state.db.conn.lock().unwrap();
    let scenario = match conn.query_row(
        "SELECT id, name, year, general_adjustment, risk_margin FROM budget_scenarios WHERE id = ?",
        [scenario_id],
        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, i32>(2)?, row.get::<_, f64>(3)?, row.get::<_, f64>(4)?))
    ) {
        Ok(s) => s,
        Err(_) => return (StatusCode::NOT_FOUND, Json(serde_json::json!({"error": "Cenário não encontrado"}))).into_response(),
    };

    // Buscar categorias raiz e calcular totais recursivamente
    let mut stmt = conn.prepare("SELECT id, name, code, item_type, parent_category_id, adjustment_percent FROM budget_categories WHERE scenario_id = ? ORDER BY \"order\"").unwrap();
    let all_cats: Vec<(i64, String, Option<String>, String, Option<i64>, Option<f64>)> = stmt.query_map([scenario_id], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?))
    }).unwrap().filter_map(|r| r.ok()).collect();

    fn calc_category(conn: &rusqlite::Connection, cat_id: i64, name: &str, code: Option<&str>, item_type: &str, all_cats: &[(i64, String, Option<String>, String, Option<i64>, Option<f64>)], general_adj: f64, risk_margin: f64) -> CategorySummary {
        let mut total_b = 0.0_f64;
        let mut total_r = 0.0_f64;
        let mut total_e = 0.0_f64;
        // Itens diretos
        let mut istmt = conn.prepare("SELECT i.id, i.adjustment_percent, i.repeats_next_budget FROM budget_items i WHERE i.category_id = ?").unwrap();
        let items: Vec<(i64, Option<f64>, bool)> = istmt.query_map([cat_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get::<_, i32>(2)? != 0))
        }).unwrap().filter_map(|r| r.ok()).collect();
        for (item_id, item_adj, repeats) in &items {
            let mut vstmt = conn.prepare("SELECT budgeted, realized, estimated_fixed FROM budget_values WHERE item_id = ?").unwrap();
            let vals: Vec<(f64, Option<f64>, Option<f64>)> = vstmt.query_map([item_id], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            }).unwrap().filter_map(|r| r.ok()).collect();
            for (budgeted, realized, est_fixed) in vals {
                total_b += budgeted;
                total_r += realized.unwrap_or(0.0);
                let eff_adj = item_adj.unwrap_or(general_adj);
                let estimated = if let Some(ef) = est_fixed {
                    ef
                } else if *repeats {
                    0.0
                } else {
                    budgeted * (1.0 + (eff_adj + risk_margin) / 100.0)
                };
                total_e += estimated;
            }
        }
        // Subcategorias
        let mut subcats = Vec::new();
        for (cid, cname, ccode, ctype, parent, _adj) in all_cats {
            if *parent == Some(cat_id) {
                let sub = calc_category(conn, *cid, cname, ccode.as_deref(), ctype, all_cats, general_adj, risk_margin);
                total_b += sub.total_budgeted;
                total_r += sub.total_realized;
                total_e += sub.total_estimated;
                subcats.push(sub);
            }
        }
        let variance = total_r - total_b;
        let variance_pct = if total_b > 0.0 { (variance / total_b) * 100.0 } else { 0.0 };
        CategorySummary {
            category_id: cat_id, name: name.to_string(), code: code.map(|s| s.to_string()),
            item_type: item_type.to_string(), total_budgeted: total_b, total_realized: total_r,
            total_estimated: total_e, variance, variance_percent: variance_pct, subcategories: subcats,
        }
    }

    let mut categories = Vec::new();
    let mut te_b = 0.0_f64; let mut te_r = 0.0_f64; let mut te_e = 0.0_f64;
    let mut tr_b = 0.0_f64; let mut tr_r = 0.0_f64; let mut tr_e = 0.0_f64;
    for (cid, cname, ccode, ctype, parent, _adj) in &all_cats {
        if parent.is_none() {
            let cs = calc_category(&conn, *cid, cname, ccode.as_deref(), ctype, &all_cats, scenario.3, scenario.4);
            match ctype.as_str() {
                "expense" => { te_b += cs.total_budgeted; te_r += cs.total_realized; te_e += cs.total_estimated; }
                "revenue" => { tr_b += cs.total_budgeted; tr_r += cs.total_realized; tr_e += cs.total_estimated; }
                _ => {}
            }
            categories.push(cs);
        }
    }

    let summary = ScenarioSummary {
        scenario_id: scenario.0, scenario_name: scenario.1, year: scenario.2,
        total_expenses_budgeted: te_b, total_expenses_realized: te_r, total_expenses_estimated: te_e,
        total_revenues_budgeted: tr_b, total_revenues_realized: tr_r, total_revenues_estimated: tr_e,
        balance_budgeted: tr_b - te_b, balance_realized: tr_r - te_r, balance_estimated: tr_e - te_e,
        categories,
    };
    Json(summary).into_response()
}

async fn compare_handler(
    AxumState(_state): AxumState<Arc<ServerState>>,
    Path((_base_id, _compared_id)): Path<(i64, i64)>,
) -> impl IntoResponse {
    // Simplificação: retornar placeholder — comparação completa será feita via Tauri command
    Json(serde_json::json!({"error": "Comparação via HTTP ainda não implementada"})).into_response()
}

// ============================================================
// Handlers - Backup
// ============================================================

async fn export_data_handler(
    AxumState(state): AxumState<Arc<ServerState>>,
) -> impl IntoResponse {
    let conn = state.db.conn.lock().unwrap();
    // Exportar tudo como JSON
    let mut scenarios = Vec::new();
    let mut stmt = conn.prepare("SELECT id, name, description, year, base_scenario_id, is_baseline, is_approved, is_closed, general_adjustment, risk_margin, created_at, updated_at FROM budget_scenarios").unwrap();
    let sc: Vec<BudgetScenario> = stmt.query_map([], |row| {
        Ok(BudgetScenario { id: row.get(0)?, name: row.get(1)?, description: row.get(2)?, year: row.get(3)?, base_scenario_id: row.get(4)?, is_baseline: row.get::<_, i32>(5)? != 0, is_approved: row.get::<_, i32>(6)? != 0, is_closed: row.get::<_, i32>(7)? != 0, general_adjustment: row.get(8)?, risk_margin: row.get(9)?, created_at: row.get(10)?, updated_at: row.get(11)? })
    }).unwrap().filter_map(|r| r.ok()).collect();
    scenarios.extend(sc);

    let params = conn.query_row(
        "SELECT id, total_square_meters, lot_simulation_1, lot_simulation_2, lot_simulation_3, habite_se_discount FROM system_parameters WHERE id = 1",
        [], |row| Ok(SystemParameters { id: row.get(0)?, total_square_meters: row.get(1)?, lot_simulation_1: row.get(2)?, lot_simulation_2: row.get(3)?, lot_simulation_3: row.get(4)?, habite_se_discount: row.get(5)? })
    ).unwrap_or_default();

    let export = serde_json::json!({
        "version": "1.0",
        "exported_at": chrono::Utc::now().to_rfc3339(),
        "scenarios": scenarios,
        "parameters": params,
    });
    Json(export).into_response()
}

#[derive(serde::Deserialize)]
struct ImportRequest {
    json_string: String,
}

async fn import_data_handler(
    AxumState(state): AxumState<Arc<ServerState>>,
    Json(req): Json<ImportRequest>,
) -> impl IntoResponse {
    let conn = state.db.conn.lock().unwrap();
    // Validar JSON
    let _data: serde_json::Value = match serde_json::from_str(&req.json_string) {
        Ok(d) => d,
        Err(e) => return (StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": format!("JSON inválido: {}", e)}))).into_response(),
    };
    drop(conn);
    // Delegar para o comando existente
    // Por segurança simplificado — a importação completa será via Tauri command
    Json(serde_json::json!({"message": "Importação via HTTP: use o app desktop para importações completas"})).into_response()
}

async fn get_stats_handler(
    AxumState(state): AxumState<Arc<ServerState>>,
) -> impl IntoResponse {
    let conn = state.db.conn.lock().unwrap();
    let scenarios: i64 = conn.query_row("SELECT COUNT(*) FROM budget_scenarios", [], |r| r.get(0)).unwrap_or(0);
    let categories: i64 = conn.query_row("SELECT COUNT(*) FROM budget_categories", [], |r| r.get(0)).unwrap_or(0);
    let items: i64 = conn.query_row("SELECT COUNT(*) FROM budget_items", [], |r| r.get(0)).unwrap_or(0);
    let values: i64 = conn.query_row("SELECT COUNT(*) FROM budget_values", [], |r| r.get(0)).unwrap_or(0);
    let page_count: i64 = conn.query_row("PRAGMA page_count", [], |r| r.get(0)).unwrap_or(0);
    let page_size: i64 = conn.query_row("PRAGMA page_size", [], |r| r.get(0)).unwrap_or(0);
    let size_bytes = page_count * page_size;
    Json(serde_json::json!({
        "scenarios": scenarios,
        "categories": categories,
        "items": items,
        "values": values,
        "total_records": scenarios + categories + items + values,
        "size_bytes": size_bytes,
        "size_mb": (size_bytes as f64) / (1024.0 * 1024.0),
    })).into_response()
}

// ============================================================
// SPA Fallback — serve arquivos estáticos e index.html
// ============================================================

async fn spa_fallback(
    AxumState(state): AxumState<Arc<ServerState>>,
    uri: Uri,
) -> Response {
    let path = uri.path().trim_start_matches('/');

    // Tentar servir arquivo estático do dist/
    if let Some(ref dist_dir) = state.dist_dir {
        let file_path = dist_dir.join(path);
        if file_path.is_file() {
            if let Ok(contents) = tokio::fs::read(&file_path).await {
                let mime = guess_mime(path);
                return (
                    StatusCode::OK,
                    [(header::CONTENT_TYPE, mime)],
                    contents,
                ).into_response();
            }
        }

        // SPA fallback: servir index.html para qualquer rota não-encontrada
        let index_path = dist_dir.join("index.html");
        if let Ok(contents) = tokio::fs::read(&index_path).await {
            return (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
                contents,
            ).into_response();
        }
    }

    // Se não tem dist/ (modo dev), redirecionar para o Vite dev server
    axum::response::Html(
        r#"<!DOCTYPE html><html><head><meta charset="utf-8"><title>Calculadora Orçamentária</title></head><body><p>Servidor de rede ativo. Em modo desenvolvimento, acesse pelo Vite dev server.</p></body></html>"#
    ).into_response()
}

fn guess_mime(path: &str) -> &'static str {
    if path.ends_with(".html") { "text/html; charset=utf-8" }
    else if path.ends_with(".js") { "application/javascript; charset=utf-8" }
    else if path.ends_with(".css") { "text/css; charset=utf-8" }
    else if path.ends_with(".json") { "application/json" }
    else if path.ends_with(".svg") { "image/svg+xml" }
    else if path.ends_with(".png") { "image/png" }
    else if path.ends_with(".ico") { "image/x-icon" }
    else if path.ends_with(".woff2") { "font/woff2" }
    else if path.ends_with(".woff") { "font/woff" }
    else { "application/octet-stream" }
}
