use tauri::State;
use crate::db::Database;

#[tauri::command]
pub fn generate_pdf(
    _db: State<Database>,
    _scenario_id: i64,
) -> Result<Vec<u8>, String> {
    Err("PDF generation not yet implemented".to_string())
}
