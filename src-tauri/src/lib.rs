pub mod commands;
pub mod db;
pub mod models;
pub mod services;

use db::Database;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Não foi possível obter o diretório de dados do app");

            let database = Database::new(app_data_dir)
                .expect("Não foi possível inicializar o banco de dados");

            app.manage(database);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Cenários
            commands::scenarios::list_scenarios,
            commands::scenarios::get_scenario,
            commands::scenarios::create_scenario,
            commands::scenarios::update_scenario,
            commands::scenarios::delete_scenario,
            // Categorias
            commands::categories::list_categories,
            commands::categories::get_category,
            commands::categories::create_category,
            commands::categories::update_category,
            commands::categories::delete_category,
            commands::categories::reorder_category,
            // Itens e Valores
            commands::items::list_items,
            commands::items::get_item,
            commands::items::create_item,
            commands::items::update_item,
            commands::items::delete_item,
            commands::items::create_value,
            commands::items::update_value,
            // Parâmetros
            commands::parameters::get_parameters,
            commands::parameters::update_parameters,
            // Análise
            commands::analysis::get_scenario_summary,
            commands::analysis::compare_scenarios,
            // Backup
            commands::backup::export_data,
            commands::backup::import_data,
            commands::backup::get_db_stats,
            // PDF
            commands::pdf::generate_pdf,
        ])
        .run(tauri::generate_context!())
        .expect("Erro ao executar a aplicação Tauri");
}
