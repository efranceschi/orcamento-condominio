use tauri::State;
use std::sync::{Arc, Mutex};
use crate::db::Database;
use crate::server;

/// Estado do servidor de rede
pub struct NetworkServer {
    pub handle: Mutex<Option<server::ServerHandle>>,
    pub running: Mutex<bool>,
    pub port: Mutex<u16>,
    pub db_path: Mutex<Option<String>>,
}

impl NetworkServer {
    pub fn new() -> Self {
        Self {
            handle: Mutex::new(None),
            running: Mutex::new(false),
            port: Mutex::new(3000),
            db_path: Mutex::new(None),
        }
    }
}

#[derive(serde::Serialize, Clone)]
pub struct NetworkInfo {
    pub running: bool,
    pub port: u16,
    pub addresses: Vec<String>,
}

fn get_local_ips() -> Vec<String> {
    let mut ips = Vec::new();
    if let Ok(socket) = std::net::UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                ips.push(addr.ip().to_string());
            }
        }
    }
    if ips.is_empty() {
        ips.push("127.0.0.1".to_string());
    }
    ips
}

#[tauri::command]
pub fn register_db_path(
    db: State<'_, Database>,
    network: State<'_, NetworkServer>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let path = conn
        .path()
        .ok_or("Não foi possível obter o caminho do banco")?
        .to_string();
    *network.db_path.lock().map_err(|e| e.to_string())? = Some(path);
    Ok(())
}

#[tauri::command]
pub async fn start_network_server(
    network: State<'_, NetworkServer>,
    port: Option<u16>,
) -> Result<NetworkInfo, String> {
    // Extrair tudo do State ANTES de qualquer .await
    let (is_running, db_path, actual_port) = {
        let running = network.running.lock().map_err(|e| e.to_string())?;
        if *running {
            return Err("Servidor já está em execução".to_string());
        }
        let p = port.unwrap_or(3000);
        *network.port.lock().map_err(|e| e.to_string())? = p;
        let db_path = network
            .db_path
            .lock()
            .map_err(|e| e.to_string())?
            .clone()
            .ok_or("Caminho do banco não registrado. Reinicie o app.")?;
        (*running, db_path, p)
    };

    let _ = is_running; // já validamos acima

    // Criar conexão SQLite independente para o servidor HTTP
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON;",
    )
    .map_err(|e| e.to_string())?;

    let db_arc = Arc::new(Database {
        conn: std::sync::Mutex::new(conn),
    });

    // Agora podemos chamar .await sem segurar referências a State
    let handle = server::start_server(db_arc, actual_port).await?;

    // Atualizar estado
    *network.handle.lock().map_err(|e| e.to_string())? = Some(handle);
    *network.running.lock().map_err(|e| e.to_string())? = true;

    let ips = get_local_ips();
    let addresses: Vec<String> = ips
        .iter()
        .map(|ip| format!("http://{}:{}", ip, actual_port))
        .collect();

    Ok(NetworkInfo {
        running: true,
        port: actual_port,
        addresses,
    })
}

#[tauri::command]
pub fn stop_network_server(
    network: State<'_, NetworkServer>,
) -> Result<NetworkInfo, String> {
    let mut running = network.running.lock().map_err(|e| e.to_string())?;
    if !*running {
        return Err("Servidor não está em execução".to_string());
    }

    if let Some(mut handle) = network.handle.lock().map_err(|e| e.to_string())?.take() {
        handle.shutdown();
    }
    *running = false;

    Ok(NetworkInfo {
        running: false,
        port: *network.port.lock().map_err(|e| e.to_string())?,
        addresses: vec![],
    })
}

#[tauri::command]
pub fn get_network_status(
    network: State<'_, NetworkServer>,
) -> Result<NetworkInfo, String> {
    let running = *network.running.lock().map_err(|e| e.to_string())?;
    let port = *network.port.lock().map_err(|e| e.to_string())?;
    let addresses = if running {
        get_local_ips()
            .iter()
            .map(|ip| format!("http://{}:{}", ip, port))
            .collect()
    } else {
        vec![]
    };

    Ok(NetworkInfo {
        running,
        port,
        addresses,
    })
}
