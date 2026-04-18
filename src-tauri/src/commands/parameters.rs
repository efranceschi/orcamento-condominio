use tauri::State;
use crate::db::Database;
use crate::models::parameters::*;

#[tauri::command]
pub fn get_parameters(db: State<Database>) -> Result<SystemParameters, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.query_row(
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
    .map_err(|e| format!("Parâmetros não encontrados: {}", e))
}

#[tauri::command]
pub fn update_parameters(
    db: State<Database>,
    request: UpdateParametersRequest,
) -> Result<SystemParameters, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut updates = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(sqm) = request.total_square_meters {
        updates.push("total_square_meters = ?");
        params.push(Box::new(sqm));
    }
    if let Some(lot1) = request.lot_simulation_1 {
        updates.push("lot_simulation_1 = ?");
        params.push(Box::new(lot1));
    }
    if let Some(lot2) = request.lot_simulation_2 {
        updates.push("lot_simulation_2 = ?");
        params.push(Box::new(lot2));
    }
    if let Some(lot3) = request.lot_simulation_3 {
        updates.push("lot_simulation_3 = ?");
        params.push(Box::new(lot3));
    }
    if let Some(disc) = request.habite_se_discount {
        updates.push("habite_se_discount = ?");
        params.push(Box::new(disc));
    }

    if !updates.is_empty() {
        let sql = format!(
            "UPDATE system_parameters SET {} WHERE id = 1",
            updates.join(", ")
        );
        let param_refs: Vec<&dyn rusqlite::types::ToSql> =
            params.iter().map(|p| p.as_ref()).collect();
        conn.execute(&sql, param_refs.as_slice())
            .map_err(|e| e.to_string())?;
    }

    drop(conn);
    get_parameters(db)
}
