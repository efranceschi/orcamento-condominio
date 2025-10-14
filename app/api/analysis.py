"""
Financial analysis and simulation API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.budget import (
    SimulationRequest,
    SimulationResponse,
    RiskAnalysisResponse,
    BudgetScenarioResponse
)
from app.services.analysis_service import AnalysisService

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


@router.post("/simulations", response_model=SimulationResponse, status_code=201)
def create_simulation(
    simulation_request: SimulationRequest,
    db: Session = Depends(get_db)
):
    """
    Cria uma nova simulação orçamentária
    
    Permite aplicar:
    - Reajuste geral
    - Reajustes específicos por categoria
    - Reajustes específicos por item
    - Margem de risco
    """
    service = AnalysisService(db)
    try:
        return service.create_simulation(simulation_request)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/scenarios/{scenario_id}/risk-analysis", response_model=RiskAnalysisResponse)
def analyze_risk(
    scenario_id: int,
    db: Session = Depends(get_db)
):
    """
    Analisa os riscos de um cenário orçamentário
    
    Retorna:
    - Métricas de risco geral
    - Itens de alto risco
    - Recomendações de ajuste
    - Simulações Monte Carlo
    """
    service = AnalysisService(db)
    analysis = service.analyze_risk(scenario_id)
    if not analysis:
        raise HTTPException(status_code=404, detail="Cenário não encontrado")
    return analysis


@router.post("/scenarios/{scenario_id}/ideal-budget", response_model=BudgetScenarioResponse)
def calculate_ideal_budget(
    scenario_id: int,
    db: Session = Depends(get_db)
):
    """
    Calcula um orçamento ideal baseado em dados históricos
    
    Utiliza valores realizados quando disponíveis e aplica
    ajustes de tendência e inflação conservadora.
    """
    service = AnalysisService(db)
    ideal_scenario = service.calculate_ideal_budget(scenario_id)
    if not ideal_scenario:
        raise HTTPException(status_code=404, detail="Cenário não encontrado")
    return ideal_scenario


@router.get("/health")
def health_check():
    """
    Endpoint para verificar saúde da API
    """
    return {"status": "healthy", "service": "budget-analysis-api"}

