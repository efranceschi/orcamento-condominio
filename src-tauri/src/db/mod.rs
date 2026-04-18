pub mod schema;
pub mod queries;

use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct Database {
    pub conn: Mutex<Connection>,
}

impl Database {
    pub fn new(app_data_dir: PathBuf) -> Result<Self, rusqlite::Error> {
        std::fs::create_dir_all(&app_data_dir).ok();
        let db_path = app_data_dir.join("orcamento.db");
        let conn = Connection::open(&db_path)?;

        // Configurações de performance do SQLite
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA synchronous=NORMAL;
             PRAGMA foreign_keys=ON;"
        )?;

        // Criar tabelas se não existirem
        schema::create_tables(&conn)?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }
}
