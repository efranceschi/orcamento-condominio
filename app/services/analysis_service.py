"""
Service for financial analysis and simulations
"""
from typing import List, Optional, Dict
from sqlalchemy.orm import Session
import numpy as np
from scipy import stats

from app.models import (
    BudgetScenario,
    BudgetCategory,
    BudgetItem,
    BudgetValue
)
from app.models.budget import ItemType
from app.schemas.budget import (
    SimulationRequest,
    SimulationResponse,
    RiskAnalysisResponse,
    RiskMetrics,
    ItemRisk
)
from app.services.budget_service import BudgetService


class AnalysisService:
    """
    Serviço para análises financeiras e simulações
    """
    
    def __init__(self, db: Session):
        self.db = db
        self.budget_service = BudgetService(db)
    
    def create_simulation(self, simulation_request: SimulationRequest) -> SimulationResponse:
        """
        Cria uma nova simulação orçamentária baseada em um cenário existente
        """
        base_scenario = self.budget_service.get_scenario(simulation_request.base_scenario_id)
        if not base_scenario:
            raise ValueError(f"Cenário base {simulation_request.base_scenario_id} não encontrado")
        
        # Criar novo cenário para a simulação
        new_scenario = BudgetScenario(
            name=simulation_request.name,
            description=simulation_request.description or f"Simulação baseada em {base_scenario.name}",
            year=base_scenario.year + 1,
            base_scenario_id=base_scenario.id,
            general_adjustment=simulation_request.general_adjustment,
            risk_margin=simulation_request.risk_margin,
            is_baseline=False,
            is_approved=False
        )
        self.db.add(new_scenario)
        self.db.flush()
        
        # Mapear ajustes por categoria e item
        category_adjustments = {
            adj.category_id: adj.adjustment_percent 
            for adj in simulation_request.category_adjustments
        }
        item_adjustments = {
            adj.item_id: (adj.adjustment_percent, adj.custom_value)
            for adj in simulation_request.item_adjustments
        }
        
        # Copiar estrutura do cenário base com ajustes
        for base_category in base_scenario.categories:
            self._copy_category_with_adjustments(
                base_category, 
                new_scenario,
                simulation_request.general_adjustment,
                category_adjustments,
                item_adjustments,
                simulation_request.risk_margin
            )
        
        self.db.commit()
        self.db.refresh(new_scenario)
        
        # Gerar resumo e comparação
        summary = self.budget_service.get_scenario_summary(new_scenario.id)
        comparison = self.budget_service.compare_scenarios(
            simulation_request.base_scenario_id, 
            new_scenario.id
        )
        
        return SimulationResponse(
            scenario=new_scenario,
            summary=summary,
            comparison_with_base=comparison.model_dump() if comparison else {}
        )
    
    def _copy_category_with_adjustments(
        self, 
        base_category: BudgetCategory,
        new_scenario: BudgetScenario,
        general_adjustment: float,
        category_adjustments: Dict[int, float],
        item_adjustments: Dict[int, tuple],
        risk_margin: float,
        parent_id: Optional[int] = None
    ):
        """
        Copia uma categoria e seus itens aplicando os ajustes
        """
        # Criar nova categoria
        new_category = BudgetCategory(
            scenario_id=new_scenario.id,
            parent_category_id=parent_id,
            name=base_category.name,
            code=base_category.code,
            item_type=base_category.item_type,
            order=base_category.order
        )
        self.db.add(new_category)
        self.db.flush()
        
        # Determinar ajuste para esta categoria
        category_adj = category_adjustments.get(base_category.id, general_adjustment)
        
        # Copiar itens com ajustes
        for base_item in base_category.items:
            new_item = BudgetItem(
                category_id=new_category.id,
                name=base_item.name,
                description=base_item.description,
                unit=base_item.unit,
                order=base_item.order
            )
            self.db.add(new_item)
            self.db.flush()
            
            # Aplicar ajustes aos valores
            for base_value in base_item.values:
                # Determinar valor ajustado
                if base_item.id in item_adjustments:
                    item_adj_percent, custom_value = item_adjustments[base_item.id]
                    if custom_value is not None:
                        adjusted = custom_value
                        adjustment_used = None
                    else:
                        adjusted = base_value.budgeted * (1 + item_adj_percent / 100)
                        adjustment_used = item_adj_percent
                else:
                    adjusted = base_value.budgeted * (1 + category_adj / 100)
                    adjustment_used = category_adj
                
                # Aplicar margem de risco
                if risk_margin > 0:
                    adjusted = adjusted * (1 + risk_margin / 100)
                
                new_value = BudgetValue(
                    item_id=new_item.id,
                    budgeted=adjusted,
                    realized=None,
                    adjusted=adjusted,
                    adjustment_percent=adjustment_used if adjustment_used is not None else category_adj,
                    notes=f"Ajuste aplicado: {adjustment_used if adjustment_used is not None else category_adj}%"
                )
                self.db.add(new_value)
        
        # Copiar subcategorias recursivamente
        subcategories = self.db.query(BudgetCategory).filter(
            BudgetCategory.parent_category_id == base_category.id
        ).all()
        
        for subcat in subcategories:
            self._copy_category_with_adjustments(
                subcat, 
                new_scenario,
                general_adjustment,
                category_adjustments,
                item_adjustments,
                risk_margin,
                new_category.id
            )
    
    def analyze_risk(self, scenario_id: int) -> Optional[RiskAnalysisResponse]:
        """
        Analisa riscos orçamentários baseado em dados históricos
        """
        scenario = self.budget_service.get_scenario(scenario_id)
        if not scenario:
            return None
        
        # Coletar variações históricas
        variances = []
        high_risk_items = []
        
        for category in scenario.categories:
            for item in category.items:
                for value in item.values:
                    if value.variance_percent is not None:
                        variances.append(value.variance_percent)
                        
                        # Identificar itens de alto risco (variação > 20%)
                        if abs(value.variance_percent) > 20:
                            risk_level = "high" if abs(value.variance_percent) > 30 else "medium"
                            high_risk_items.append(ItemRisk(
                                item_id=item.id,
                                item_name=item.name,
                                historical_variance_avg=value.variance_percent,
                                risk_level=risk_level,
                                recommended_margin=min(abs(value.variance_percent) * 1.2, 50.0)
                            ))
        
        if not variances:
            # Sem dados históricos, retornar análise conservadora
            return RiskAnalysisResponse(
                scenario_id=scenario.id,
                scenario_name=scenario.name,
                overall_risk=RiskMetrics(
                    standard_deviation=0.0,
                    coefficient_variation=0.0,
                    risk_score=50.0,
                    confidence_level=50.0
                ),
                high_risk_items=[],
                recommended_adjustments={},
                monte_carlo_scenarios=None
            )
        
        # Calcular métricas de risco
        std_dev = float(np.std(variances))
        mean_variance = float(np.mean(variances))
        coef_variation = (std_dev / abs(mean_variance)) * 100 if mean_variance != 0 else 0
        
        # Risk score (0-100, onde 100 é maior risco)
        risk_score = min(100, max(0, (coef_variation / 2) + (abs(mean_variance) / 2)))
        
        # Nível de confiança (inverso do risco)
        confidence_level = 100 - risk_score
        
        # Recomendações de ajuste
        recommended_adjustments = {}
        summary = self.budget_service.get_scenario_summary(scenario_id)
        if summary:
            for cat in summary.categories:
                if cat.variance_percent and abs(cat.variance_percent) > 10:
                    recommended_adjustments[cat.category_name] = cat.variance_percent
        
        # Simulação Monte Carlo simplificada
        monte_carlo = self._run_monte_carlo_simulation(scenario, variances, 1000)
        
        return RiskAnalysisResponse(
            scenario_id=scenario.id,
            scenario_name=scenario.name,
            overall_risk=RiskMetrics(
                standard_deviation=std_dev,
                coefficient_variation=coef_variation,
                risk_score=risk_score,
                confidence_level=confidence_level
            ),
            high_risk_items=sorted(high_risk_items, 
                                  key=lambda x: abs(x.historical_variance_avg), 
                                  reverse=True)[:10],
            recommended_adjustments=recommended_adjustments,
            monte_carlo_scenarios=monte_carlo
        )
    
    def _run_monte_carlo_simulation(
        self, 
        scenario: BudgetScenario, 
        historical_variances: List[float],
        n_simulations: int = 1000
    ) -> Dict[str, any]:
        """
        Executa simulação Monte Carlo para projetar cenários futuros
        """
        if not historical_variances:
            return {}
        
        # Calcular parâmetros da distribuição
        mean = np.mean(historical_variances)
        std = np.std(historical_variances)
        
        # Gerar simulações
        simulations = np.random.normal(mean, std, n_simulations)
        
        # Calcular estatísticas
        percentiles = {
            "p10": float(np.percentile(simulations, 10)),
            "p25": float(np.percentile(simulations, 25)),
            "p50": float(np.percentile(simulations, 50)),
            "p75": float(np.percentile(simulations, 75)),
            "p90": float(np.percentile(simulations, 90))
        }
        
        return {
            "n_simulations": n_simulations,
            "mean": float(mean),
            "std_dev": float(std),
            "percentiles": percentiles,
            "worst_case": float(np.min(simulations)),
            "best_case": float(np.max(simulations))
        }
    
    def calculate_ideal_budget(self, base_scenario_id: int) -> Optional[BudgetScenario]:
        """
        Calcula orçamento ideal baseado em dados históricos e tendências
        """
        base_scenario = self.budget_service.get_scenario(base_scenario_id)
        if not base_scenario:
            return None
        
        # Criar cenário ideal
        ideal_scenario = BudgetScenario(
            name=f"Orçamento Ideal - {base_scenario.year + 1}",
            description="Calculado com base em médias históricas e ajustes de tendência",
            year=base_scenario.year + 1,
            base_scenario_id=base_scenario.id,
            is_baseline=False,
            is_approved=False
        )
        self.db.add(ideal_scenario)
        self.db.flush()
        
        # Copiar estrutura ajustando para valores realizados quando disponíveis
        for base_category in base_scenario.categories:
            self._copy_category_ideal(base_category, ideal_scenario)
        
        self.db.commit()
        self.db.refresh(ideal_scenario)
        
        return ideal_scenario
    
    def _copy_category_ideal(
        self, 
        base_category: BudgetCategory,
        ideal_scenario: BudgetScenario,
        parent_id: Optional[int] = None
    ):
        """
        Copia categoria usando valores ideais (realizados ou média)
        """
        new_category = BudgetCategory(
            scenario_id=ideal_scenario.id,
            parent_category_id=parent_id,
            name=base_category.name,
            code=base_category.code,
            item_type=base_category.item_type,
            order=base_category.order
        )
        self.db.add(new_category)
        self.db.flush()
        
        for base_item in base_category.items:
            new_item = BudgetItem(
                category_id=new_category.id,
                name=base_item.name,
                description=base_item.description,
                unit=base_item.unit,
                order=base_item.order
            )
            self.db.add(new_item)
            self.db.flush()
            
            for base_value in base_item.values:
                # Usar valor realizado se disponível, senão usar média
                ideal_value = base_value.realized if base_value.realized is not None else base_value.budgeted
                
                # Aplicar ajuste de inflação conservador (5%)
                ideal_value = ideal_value * 1.05
                
                new_value = BudgetValue(
                    item_id=new_item.id,
                    budgeted=ideal_value,
                    realized=None,
                    adjusted=ideal_value,
                    notes="Valor ideal calculado com base em histórico"
                )
                self.db.add(new_value)
        
        # Copiar subcategorias
        subcategories = self.db.query(BudgetCategory).filter(
            BudgetCategory.parent_category_id == base_category.id
        ).all()
        
        for subcat in subcategories:
            self._copy_category_ideal(subcat, ideal_scenario, new_category.id)

