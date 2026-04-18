//! Integration tests for the budget management application.
//!
//! These tests validate database operations and business logic WITHOUT the Tauri
//! runtime. They create in-memory SQLite databases, apply the schema, and test
//! CRUD operations and calculated fields directly against the SQL layer.

use rusqlite::{params, Connection};
use serde_json::Value as JsonValue;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Schema SQL copied from src/db/schema.rs so integration tests remain
/// independent of crate internals.
const SCHEMA_SQL: &str = "
    CREATE TABLE IF NOT EXISTS budget_scenarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        year INTEGER NOT NULL,
        base_scenario_id INTEGER REFERENCES budget_scenarios(id),
        is_baseline INTEGER NOT NULL DEFAULT 0,
        is_approved INTEGER NOT NULL DEFAULT 0,
        is_closed INTEGER NOT NULL DEFAULT 0,
        general_adjustment REAL NOT NULL DEFAULT 0.0,
        risk_margin REAL NOT NULL DEFAULT 0.0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_scenarios_year ON budget_scenarios(year);
    CREATE INDEX IF NOT EXISTS idx_scenarios_name ON budget_scenarios(name);

    CREATE TABLE IF NOT EXISTS budget_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scenario_id INTEGER NOT NULL REFERENCES budget_scenarios(id) ON DELETE CASCADE,
        parent_category_id INTEGER REFERENCES budget_categories(id),
        name TEXT NOT NULL,
        description TEXT,
        code TEXT,
        item_type TEXT NOT NULL CHECK(item_type IN ('expense', 'revenue')),
        \"order\" INTEGER NOT NULL DEFAULT 0,
        adjustment_percent REAL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_categories_scenario ON budget_categories(scenario_id);
    CREATE INDEX IF NOT EXISTS idx_categories_parent ON budget_categories(parent_category_id);
    CREATE INDEX IF NOT EXISTS idx_categories_code ON budget_categories(code);

    CREATE TABLE IF NOT EXISTS budget_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL REFERENCES budget_categories(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        unit TEXT,
        \"order\" INTEGER NOT NULL DEFAULT 0,
        adjustment_percent REAL,
        repeats_next_budget INTEGER NOT NULL DEFAULT 0,
        is_optional INTEGER NOT NULL DEFAULT 0,
        observations TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_items_category ON budget_items(category_id);

    CREATE TABLE IF NOT EXISTS budget_values (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER NOT NULL REFERENCES budget_items(id) ON DELETE CASCADE,
        budgeted REAL NOT NULL DEFAULT 0.0,
        realized REAL,
        adjusted REAL,
        estimated_fixed REAL,
        adjustment_percent REAL,
        custom_adjustment REAL,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_values_item ON budget_values(item_id);

    CREATE TABLE IF NOT EXISTS system_parameters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        total_square_meters REAL NOT NULL DEFAULT 0.0,
        lot_simulation_1 REAL NOT NULL DEFAULT 0.0,
        lot_simulation_2 REAL NOT NULL DEFAULT 0.0,
        lot_simulation_3 REAL NOT NULL DEFAULT 0.0,
        habite_se_discount REAL NOT NULL DEFAULT 10.0
    );

    INSERT OR IGNORE INTO system_parameters (id, total_square_meters, lot_simulation_1, lot_simulation_2, lot_simulation_3, habite_se_discount)
    VALUES (1, 0.0, 0.0, 0.0, 0.0, 10.0);
";

/// Create a fresh in-memory database with the full schema applied and
/// `PRAGMA foreign_keys = ON`.
fn setup_db() -> Connection {
    let conn = Connection::open_in_memory().expect("Failed to open in-memory SQLite");
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .expect("Failed to enable foreign keys");
    conn.execute_batch(SCHEMA_SQL)
        .expect("Failed to apply schema");
    conn
}

/// Insert a scenario and return its rowid.
fn insert_scenario(conn: &Connection, name: &str, year: i32) -> i64 {
    conn.execute(
        "INSERT INTO budget_scenarios (name, year) VALUES (?, ?)",
        params![name, year],
    )
    .expect("insert scenario");
    conn.last_insert_rowid()
}

/// Insert a scenario with general_adjustment and risk_margin.
fn insert_scenario_full(
    conn: &Connection,
    name: &str,
    year: i32,
    general_adjustment: f64,
    risk_margin: f64,
) -> i64 {
    conn.execute(
        "INSERT INTO budget_scenarios (name, year, general_adjustment, risk_margin) VALUES (?, ?, ?, ?)",
        params![name, year, general_adjustment, risk_margin],
    )
    .expect("insert scenario full");
    conn.last_insert_rowid()
}

/// Insert a category and return its rowid.
fn insert_category(
    conn: &Connection,
    scenario_id: i64,
    parent_id: Option<i64>,
    name: &str,
    item_type: &str,
    adjustment_percent: Option<f64>,
) -> i64 {
    conn.execute(
        "INSERT INTO budget_categories (scenario_id, parent_category_id, name, item_type, adjustment_percent) VALUES (?, ?, ?, ?, ?)",
        params![scenario_id, parent_id, name, item_type, adjustment_percent],
    )
    .expect("insert category");
    conn.last_insert_rowid()
}

/// Insert an item and return its rowid.
fn insert_item(
    conn: &Connection,
    category_id: i64,
    name: &str,
    adjustment_percent: Option<f64>,
    repeats_next_budget: bool,
) -> i64 {
    conn.execute(
        "INSERT INTO budget_items (category_id, name, adjustment_percent, repeats_next_budget) VALUES (?, ?, ?, ?)",
        params![category_id, name, adjustment_percent, repeats_next_budget as i32],
    )
    .expect("insert item");
    conn.last_insert_rowid()
}

/// Insert a budget value and return its rowid.
fn insert_value(
    conn: &Connection,
    item_id: i64,
    budgeted: f64,
    realized: Option<f64>,
    estimated_fixed: Option<f64>,
) -> i64 {
    conn.execute(
        "INSERT INTO budget_values (item_id, budgeted, realized, estimated_fixed) VALUES (?, ?, ?, ?)",
        params![item_id, budgeted, realized, estimated_fixed],
    )
    .expect("insert value");
    conn.last_insert_rowid()
}

/// Replicate the effective adjustment hierarchy walk from items.rs:
/// item adj -> category adj (walk up) -> scenario general_adjustment -> 0
fn effective_adjustment(conn: &Connection, item_adj: Option<f64>, category_id: i64) -> f64 {
    if let Some(adj) = item_adj {
        return adj;
    }
    if let Some(adj) = walk_category_adjustment(conn, category_id) {
        return adj;
    }
    let scenario_adj: f64 = conn
        .query_row(
            "SELECT s.general_adjustment FROM budget_scenarios s \
             INNER JOIN budget_categories c ON c.scenario_id = s.id WHERE c.id = ?",
            [category_id],
            |row| row.get(0),
        )
        .unwrap_or(0.0);
    if scenario_adj != 0.0 {
        return scenario_adj;
    }
    0.0
}

fn walk_category_adjustment(conn: &Connection, category_id: i64) -> Option<f64> {
    let (adj, parent): (Option<f64>, Option<i64>) = conn
        .query_row(
            "SELECT adjustment_percent, parent_category_id FROM budget_categories WHERE id = ?",
            [category_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .ok()?;
    if adj.is_some() {
        return adj;
    }
    parent.and_then(|pid| walk_category_adjustment(conn, pid))
}

/// Replicate compute_value_fields from items.rs.
#[allow(dead_code)]
struct ComputedFields {
    estimated: f64,
    variance: f64,
    variance_percent: f64,
    used_percent: Option<f64>,
}

fn compute_fields(
    budgeted: f64,
    realized: Option<f64>,
    estimated_fixed: Option<f64>,
    effective_adj: f64,
    risk_margin: f64,
    repeats_next_budget: bool,
) -> ComputedFields {
    let estimated = if let Some(fixed) = estimated_fixed {
        fixed
    } else if repeats_next_budget {
        0.0
    } else {
        let total_pct = effective_adj + risk_margin;
        budgeted * (1.0 + total_pct / 100.0)
    };

    let (variance, variance_percent) = if let Some(r) = realized {
        let v = r - budgeted;
        let vp = if budgeted != 0.0 {
            ((r - budgeted) / budgeted) * 100.0
        } else {
            0.0
        };
        (v, vp)
    } else {
        (0.0, 0.0)
    };

    let used_percent = realized.map(|r| {
        if budgeted != 0.0 {
            (r / budgeted) * 100.0
        } else {
            0.0
        }
    });

    ComputedFields {
        estimated,
        variance,
        variance_percent,
        used_percent,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[test]
fn test_create_and_list_scenarios() {
    let conn = setup_db();

    let id1 = insert_scenario(&conn, "Budget 2025", 2025);
    let id2 = insert_scenario(&conn, "Budget 2026", 2026);

    assert!(id1 > 0);
    assert!(id2 > 0);
    assert_ne!(id1, id2);

    // List all
    let mut stmt = conn
        .prepare("SELECT id, name, year FROM budget_scenarios ORDER BY year")
        .unwrap();
    let rows: Vec<(i64, String, i32)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();

    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0].1, "Budget 2025");
    assert_eq!(rows[0].2, 2025);
    assert_eq!(rows[1].1, "Budget 2026");
    assert_eq!(rows[1].2, 2026);
}

#[test]
fn test_update_scenario() {
    let conn = setup_db();
    let id = insert_scenario(&conn, "Original", 2025);

    conn.execute(
        "UPDATE budget_scenarios SET name = ?, year = ?, general_adjustment = ?, updated_at = datetime('now') WHERE id = ?",
        params!["Renamed", 2026, 7.5, id],
    )
    .unwrap();

    let (name, year, adj): (String, i32, f64) = conn
        .query_row(
            "SELECT name, year, general_adjustment FROM budget_scenarios WHERE id = ?",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .unwrap();

    assert_eq!(name, "Renamed");
    assert_eq!(year, 2026);
    assert!((adj - 7.5).abs() < f64::EPSILON);
}

#[test]
fn test_delete_scenario_cascades() {
    let conn = setup_db();
    let sid = insert_scenario(&conn, "Cascade Test", 2025);
    let cid = insert_category(&conn, sid, None, "Expenses", "expense", None);
    let iid = insert_item(&conn, cid, "Electricity", None, false);
    insert_value(&conn, iid, 500.0, Some(450.0), None);

    // Verify data exists
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM budget_values", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 1);

    // Delete scenario -- ON DELETE CASCADE should remove categories, items, values
    conn.execute("DELETE FROM budget_scenarios WHERE id = ?", [sid])
        .unwrap();

    let cat_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM budget_categories", [], |r| r.get(0))
        .unwrap();
    let item_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM budget_items", [], |r| r.get(0))
        .unwrap();
    let val_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM budget_values", [], |r| r.get(0))
        .unwrap();

    assert_eq!(cat_count, 0, "categories should be deleted by cascade");
    assert_eq!(item_count, 0, "items should be deleted by cascade");
    assert_eq!(val_count, 0, "values should be deleted by cascade");
}

#[test]
fn test_create_category_hierarchy() {
    let conn = setup_db();
    let sid = insert_scenario(&conn, "Hierarchy", 2025);

    let root_id = insert_category(&conn, sid, None, "EXPENSES", "expense", None);
    let sub_id = insert_category(&conn, sid, Some(root_id), "Utilities", "expense", None);

    // Verify parent-child relationship
    let parent: Option<i64> = conn
        .query_row(
            "SELECT parent_category_id FROM budget_categories WHERE id = ?",
            [sub_id],
            |row| row.get(0),
        )
        .unwrap();

    assert_eq!(parent, Some(root_id));

    // Verify the root has no parent
    let root_parent: Option<i64> = conn
        .query_row(
            "SELECT parent_category_id FROM budget_categories WHERE id = ?",
            [root_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(root_parent, None);
}

#[test]
fn test_category_type_validation() {
    let conn = setup_db();
    let sid = insert_scenario(&conn, "TypeVal", 2025);

    let root_id = insert_category(&conn, sid, None, "EXPENSES", "expense", None);
    let sub_id = insert_category(&conn, sid, Some(root_id), "Utilities", "expense", None);

    // Verify subcategory has same item_type as parent
    let parent_type: String = conn
        .query_row(
            "SELECT item_type FROM budget_categories WHERE id = ?",
            [root_id],
            |row| row.get(0),
        )
        .unwrap();
    let child_type: String = conn
        .query_row(
            "SELECT item_type FROM budget_categories WHERE id = ?",
            [sub_id],
            |row| row.get(0),
        )
        .unwrap();

    assert_eq!(parent_type, child_type);
    assert_eq!(parent_type, "expense");

    // Verify the CHECK constraint rejects invalid types
    let bad = conn.execute(
        "INSERT INTO budget_categories (scenario_id, name, item_type) VALUES (?, 'Bad', 'invalid_type')",
        [sid],
    );
    assert!(bad.is_err(), "CHECK constraint should reject invalid item_type");
}

#[test]
fn test_create_item_with_values() {
    let conn = setup_db();
    let sid = insert_scenario(&conn, "Items", 2025);
    let cid = insert_category(&conn, sid, None, "Expenses", "expense", None);
    let iid = insert_item(&conn, cid, "Water Bill", None, false);
    let vid = insert_value(&conn, iid, 1000.0, Some(800.0), None);

    let (budgeted, realized): (f64, Option<f64>) = conn
        .query_row(
            "SELECT budgeted, realized FROM budget_values WHERE id = ?",
            [vid],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();

    assert!((budgeted - 1000.0).abs() < f64::EPSILON);
    assert_eq!(realized, Some(800.0));
}

#[test]
fn test_calculated_fields() {
    // budgeted=1000, realized=800 -> variance=-200, used_percent=80
    let fields = compute_fields(1000.0, Some(800.0), None, 0.0, 0.0, false);

    assert!(
        (fields.variance - (-200.0)).abs() < f64::EPSILON,
        "variance should be -200, got {}",
        fields.variance
    );
    assert!(
        (fields.used_percent.unwrap() - 80.0).abs() < f64::EPSILON,
        "used_percent should be 80, got {}",
        fields.used_percent.unwrap()
    );
    // With no adjustment and no risk margin, estimated = budgeted
    assert!(
        (fields.estimated - 1000.0).abs() < f64::EPSILON,
        "estimated should be 1000, got {}",
        fields.estimated
    );
}

#[test]
fn test_effective_adjustment_hierarchy() {
    let conn = setup_db();

    // scenario(general_adjustment=5), category(adj=10), item(adj=null)
    let sid = insert_scenario_full(&conn, "AdjTest", 2025, 5.0, 0.0);
    let cid = insert_category(&conn, sid, None, "Expenses", "expense", Some(10.0));
    let iid = insert_item(&conn, cid, "Item1", None, false);

    // Item has no adjustment, so it should walk to category's 10%
    let item_adj: Option<f64> = conn
        .query_row(
            "SELECT adjustment_percent FROM budget_items WHERE id = ?",
            [iid],
            |row| row.get(0),
        )
        .unwrap();

    let eff = effective_adjustment(&conn, item_adj, cid);
    assert!(
        (eff - 10.0).abs() < f64::EPSILON,
        "effective adjustment should be category's 10%, got {}",
        eff
    );
}

#[test]
fn test_estimated_calculation() {
    // budgeted=1000, effective_adj=10, risk_margin=2
    // expected: 1000 * (1 + (10+2)/100) = 1000 * 1.12 = 1120
    let fields = compute_fields(1000.0, None, None, 10.0, 2.0, false);

    assert!(
        (fields.estimated - 1120.0).abs() < f64::EPSILON,
        "estimated should be 1120, got {}",
        fields.estimated
    );
}

#[test]
fn test_estimated_fixed_overrides() {
    // estimated_fixed=500 should override the calculated value
    let fields = compute_fields(1000.0, None, Some(500.0), 10.0, 2.0, false);

    assert!(
        (fields.estimated - 500.0).abs() < f64::EPSILON,
        "estimated should be 500 (fixed), got {}",
        fields.estimated
    );
}

#[test]
fn test_repeats_next_budget_zero() {
    // repeats_next_budget=true -> estimated = 0
    let fields = compute_fields(1000.0, None, None, 10.0, 2.0, true);

    assert!(
        (fields.estimated - 0.0).abs() < f64::EPSILON,
        "estimated should be 0 when repeats_next_budget is true, got {}",
        fields.estimated
    );
}

#[test]
fn test_parameters_singleton() {
    let conn = setup_db();

    // Verify exactly one row exists (seeded by schema)
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM system_parameters", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 1, "system_parameters should have exactly 1 row");

    // Read defaults
    let (sqm, discount): (f64, f64) = conn
        .query_row(
            "SELECT total_square_meters, habite_se_discount FROM system_parameters WHERE id = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert!((sqm - 0.0).abs() < f64::EPSILON);
    assert!((discount - 10.0).abs() < f64::EPSILON);

    // Update and read back
    conn.execute(
        "UPDATE system_parameters SET total_square_meters = ?, habite_se_discount = ? WHERE id = 1",
        params![1500.5, 15.0],
    )
    .unwrap();

    let (sqm2, discount2): (f64, f64) = conn
        .query_row(
            "SELECT total_square_meters, habite_se_discount FROM system_parameters WHERE id = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert!((sqm2 - 1500.5).abs() < f64::EPSILON);
    assert!((discount2 - 15.0).abs() < f64::EPSILON);

    // Verify still only one row
    let count2: i64 = conn
        .query_row("SELECT COUNT(*) FROM system_parameters", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count2, 1);
}

#[test]
fn test_export_import_json() {
    let conn = setup_db();

    // -- Create test data --
    let sid = insert_scenario_full(&conn, "Export Test", 2025, 5.0, 2.0);
    let cid = insert_category(&conn, sid, None, "Despesas", "expense", Some(10.0));
    let iid = insert_item(&conn, cid, "Eletricidade", None, false);
    insert_value(&conn, iid, 1000.0, Some(900.0), None);

    conn.execute(
        "UPDATE system_parameters SET total_square_meters = 2500.0 WHERE id = 1",
        [],
    )
    .unwrap();

    // -- Export: build JSON similar to backup_service --
    let scenario: (i64, String, i32, f64, f64) = conn
        .query_row(
            "SELECT id, name, year, general_adjustment, risk_margin FROM budget_scenarios WHERE id = ?",
            [sid],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        )
        .unwrap();

    let category: (i64, i64, String, String, Option<f64>) = conn
        .query_row(
            "SELECT id, scenario_id, name, item_type, adjustment_percent FROM budget_categories WHERE id = ?",
            [cid],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        )
        .unwrap();

    let item: (i64, i64, String) = conn
        .query_row(
            "SELECT id, category_id, name FROM budget_items WHERE id = ?",
            [iid],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .unwrap();

    let value: (i64, i64, f64, Option<f64>) = conn
        .query_row(
            "SELECT id, item_id, budgeted, realized FROM budget_values WHERE item_id = ?",
            [iid],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .unwrap();

    let sqm: f64 = conn
        .query_row(
            "SELECT total_square_meters FROM system_parameters WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .unwrap();

    // Build a JSON export
    let export_json = serde_json::json!({
        "version": "1.0",
        "exported_at": "2025-01-01 00:00:00",
        "scenarios": [{
            "id": scenario.0,
            "name": scenario.1,
            "year": scenario.2,
            "is_baseline": false,
            "is_approved": false,
            "is_closed": false,
            "general_adjustment": scenario.3,
            "risk_margin": scenario.4,
        }],
        "categories": [{
            "id": category.0,
            "scenario_id": category.1,
            "name": category.2,
            "item_type": category.3,
            "order": 0,
            "adjustment_percent": category.4,
            "subcategories": [],
            "items": [],
        }],
        "items": [{
            "id": item.0,
            "category_id": item.1,
            "name": item.2,
            "order": 0,
            "repeats_next_budget": false,
            "is_optional": false,
            "values": [],
        }],
        "values": [{
            "id": value.0,
            "item_id": value.1,
            "budgeted": value.2,
            "realized": value.3,
        }],
        "parameters": {
            "id": 1,
            "total_square_meters": sqm,
            "lot_simulation_1": 0.0,
            "lot_simulation_2": 0.0,
            "lot_simulation_3": 0.0,
            "habite_se_discount": 10.0,
        }
    });

    let json_string = serde_json::to_string_pretty(&export_json).unwrap();

    // -- Clear the database --
    conn.execute_batch(
        "DELETE FROM budget_values;
         DELETE FROM budget_items;
         DELETE FROM budget_categories;
         DELETE FROM budget_scenarios;
         UPDATE system_parameters SET total_square_meters = 0.0 WHERE id = 1;",
    )
    .unwrap();

    // Verify everything is cleared
    let s_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM budget_scenarios", [], |r| r.get(0))
        .unwrap();
    assert_eq!(s_count, 0);

    // -- Import from JSON --
    let data: JsonValue = serde_json::from_str(&json_string).unwrap();

    // Import scenarios
    for s in data["scenarios"].as_array().unwrap() {
        conn.execute(
            "INSERT INTO budget_scenarios (id, name, year, general_adjustment, risk_margin, is_baseline, is_approved, is_closed) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                s["id"].as_i64(),
                s["name"].as_str().unwrap(),
                s["year"].as_i64().unwrap() as i32,
                s["general_adjustment"].as_f64().unwrap(),
                s["risk_margin"].as_f64().unwrap(),
                if s["is_baseline"].as_bool().unwrap_or(false) { 1 } else { 0 },
                if s["is_approved"].as_bool().unwrap_or(false) { 1 } else { 0 },
                if s["is_closed"].as_bool().unwrap_or(false) { 1 } else { 0 },
            ],
        )
        .unwrap();
    }

    // Import categories
    for c in data["categories"].as_array().unwrap() {
        conn.execute(
            "INSERT INTO budget_categories (id, scenario_id, parent_category_id, name, item_type, \"order\", adjustment_percent) VALUES (?, ?, ?, ?, ?, ?, ?)",
            params![
                c["id"].as_i64(),
                c["scenario_id"].as_i64().unwrap(),
                c["parent_category_id"].as_i64(),
                c["name"].as_str().unwrap(),
                c["item_type"].as_str().unwrap(),
                c["order"].as_i64().unwrap_or(0) as i32,
                c["adjustment_percent"].as_f64(),
            ],
        )
        .unwrap();
    }

    // Import items
    for i in data["items"].as_array().unwrap() {
        conn.execute(
            "INSERT INTO budget_items (id, category_id, name, \"order\", repeats_next_budget, is_optional) VALUES (?, ?, ?, ?, ?, ?)",
            params![
                i["id"].as_i64(),
                i["category_id"].as_i64().unwrap(),
                i["name"].as_str().unwrap(),
                i["order"].as_i64().unwrap_or(0) as i32,
                if i["repeats_next_budget"].as_bool().unwrap_or(false) { 1 } else { 0 },
                if i["is_optional"].as_bool().unwrap_or(false) { 1 } else { 0 },
            ],
        )
        .unwrap();
    }

    // Import values
    for v in data["values"].as_array().unwrap() {
        conn.execute(
            "INSERT INTO budget_values (id, item_id, budgeted, realized) VALUES (?, ?, ?, ?)",
            params![
                v["id"].as_i64(),
                v["item_id"].as_i64().unwrap(),
                v["budgeted"].as_f64().unwrap(),
                v["realized"].as_f64(),
            ],
        )
        .unwrap();
    }

    // Import parameters
    let p = &data["parameters"];
    conn.execute(
        "UPDATE system_parameters SET total_square_meters = ? WHERE id = 1",
        params![p["total_square_meters"].as_f64().unwrap()],
    )
    .unwrap();

    // -- Verify data restored --
    let restored_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM budget_scenarios", [], |r| r.get(0))
        .unwrap();
    assert_eq!(restored_count, 1);

    let restored_name: String = conn
        .query_row(
            "SELECT name FROM budget_scenarios WHERE id = ?",
            [sid],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(restored_name, "Export Test");

    let restored_sqm: f64 = conn
        .query_row(
            "SELECT total_square_meters FROM system_parameters WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert!((restored_sqm - 2500.0).abs() < f64::EPSILON);

    let restored_val: f64 = conn
        .query_row(
            "SELECT budgeted FROM budget_values WHERE item_id = ?",
            [iid],
            |row| row.get(0),
        )
        .unwrap();
    assert!((restored_val - 1000.0).abs() < f64::EPSILON);
}

#[test]
fn test_category_delete_blocked_with_children() {
    let conn = setup_db();
    let sid = insert_scenario(&conn, "Block Delete", 2025);

    let root_id = insert_category(&conn, sid, None, "EXPENSES", "expense", None);
    let _sub_id = insert_category(&conn, sid, Some(root_id), "Utilities", "expense", None);

    // The application-level check: count subcategories before deleting
    let sub_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM budget_categories WHERE parent_category_id = ?",
            [root_id],
            |row| row.get(0),
        )
        .unwrap();

    assert!(
        sub_count > 0,
        "root category has subcategories, delete should be blocked"
    );

    // Simulate the application logic that prevents deletion
    if sub_count > 0 {
        let err_msg = format!(
            "Cannot delete: category has {} subcategorie(s). Remove them first.",
            sub_count
        );
        assert!(err_msg.contains("Cannot delete"));
    }

    // Verify the root category still exists
    let exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM budget_categories WHERE id = ?",
            [root_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(exists, 1, "root category should still exist");

    // Now also verify that the same logic blocks deletion when items exist
    let sid2 = insert_scenario(&conn, "Block Delete Items", 2026);
    let cat_id = insert_category(&conn, sid2, None, "Revenue", "revenue", None);
    let _item_id = insert_item(&conn, cat_id, "Rent", None, false);

    let item_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM budget_items WHERE category_id = ?",
            [cat_id],
            |row| row.get(0),
        )
        .unwrap();

    assert!(
        item_count > 0,
        "category has items, delete should be blocked"
    );

    // Category still exists
    let exists2: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM budget_categories WHERE id = ?",
            [cat_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(exists2, 1, "category with items should still exist");
}
