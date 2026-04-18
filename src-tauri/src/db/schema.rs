use rusqlite::Connection;

pub fn create_tables(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "
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

        -- Garantir que system_parameters tenha exatamente um registro
        INSERT OR IGNORE INTO system_parameters (id, total_square_meters, lot_simulation_1, lot_simulation_2, lot_simulation_3, habite_se_discount)
        VALUES (1, 0.0, 0.0, 0.0, 0.0, 10.0);
        "
    )?;

    Ok(())
}
