use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemParameters {
    pub id: Option<i64>,
    pub total_square_meters: f64,
    pub lot_simulation_1: f64,
    pub lot_simulation_2: f64,
    pub lot_simulation_3: f64,
    pub habite_se_discount: f64,
}

impl Default for SystemParameters {
    fn default() -> Self {
        Self {
            id: None,
            total_square_meters: 0.0,
            lot_simulation_1: 0.0,
            lot_simulation_2: 0.0,
            lot_simulation_3: 0.0,
            habite_se_discount: 10.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateParametersRequest {
    pub total_square_meters: Option<f64>,
    pub lot_simulation_1: Option<f64>,
    pub lot_simulation_2: Option<f64>,
    pub lot_simulation_3: Option<f64>,
    pub habite_se_discount: Option<f64>,
}
