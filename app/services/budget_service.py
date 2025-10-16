"""
Service for budget management operations
"""
from typing import List, Optional, Dict
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models import (
    BudgetScenario,
    BudgetCategory,
    BudgetItem,
    BudgetValue
)
from app.models.budget import ItemType
from app.schemas.budget import (
    BudgetScenarioCreate,
    BudgetScenarioUpdate,
    ScenarioSummary,
    CategorySummary,
    ComparisonResponse,
    CategoryComparison,
    ItemComparison
)


class BudgetService:
    """
    Serviço para operações de gerenciamento de orçamentos
    """
    
    def __init__(self, db: Session):
        self.db = db
    
    # CRUD de Cenários
    def create_scenario(self, scenario_data: BudgetScenarioCreate) -> BudgetScenario:
        """Cria um novo cenário orçamentário"""
        scenario = BudgetScenario(**scenario_data.model_dump())
        self.db.add(scenario)
        self.db.commit()
        self.db.refresh(scenario)
        return scenario
    
    def get_scenario(self, scenario_id: int) -> Optional[BudgetScenario]:
        """Busca um cenário por ID"""
        from sqlalchemy.orm import selectinload
        
        return self.db.query(BudgetScenario).options(
            selectinload(BudgetScenario.categories)
        ).filter(
            BudgetScenario.id == scenario_id
        ).first()
    
    def get_scenarios(self, year: Optional[int] = None, 
                     is_baseline: Optional[bool] = None) -> List[BudgetScenario]:
        """Lista cenários com filtros opcionais"""
        query = self.db.query(BudgetScenario)
        
        if year is not None:
            query = query.filter(BudgetScenario.year == year)
        if is_baseline is not None:
            query = query.filter(BudgetScenario.is_baseline == is_baseline)
        
        return query.order_by(BudgetScenario.year.desc(), 
                             BudgetScenario.created_at.desc()).all()
    
    def update_scenario(self, scenario_id: int, 
                       scenario_data: BudgetScenarioUpdate) -> Optional[BudgetScenario]:
        """Atualiza um cenário"""
        scenario = self.get_scenario(scenario_id)
        if not scenario:
            return None
        
        update_data = scenario_data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(scenario, key, value)
        
        self.db.commit()
        self.db.refresh(scenario)
        return scenario
    
    def delete_scenario(self, scenario_id: int) -> bool:
        """Deleta um cenário"""
        scenario = self.get_scenario(scenario_id)
        if not scenario:
            return False
        
        self.db.delete(scenario)
        self.db.commit()
        return True
    
    # Operações de análise
    def get_scenario_summary(self, scenario_id: int) -> Optional[ScenarioSummary]:
        """Gera um resumo consolidado por categorias principais (incluindo as sem itens)"""
        scenario = self.get_scenario(scenario_id)
        if not scenario:
            return None
        
        categories_summary = []
        total_expenses = 0.0
        total_revenues = 0.0
        total_expenses_estimated = 0.0
        total_revenues_estimated = 0.0
        
        # Pegar apenas categorias raiz (parent_category_id IS NULL)
        # Essas categorias já incluem recursivamente os valores das subcategorias
        for category in scenario.categories:
            # Incluir apenas categorias raiz
            if category.parent_category_id is None:
                cat_summary = self._calculate_category_summary(category)
                categories_summary.append(cat_summary)
                
                if category.item_type == ItemType.EXPENSE:
                    total_expenses += cat_summary.total_budgeted
                    total_expenses_estimated += cat_summary.total_estimated
                else:
                    total_revenues += cat_summary.total_budgeted
                    total_revenues_estimated += cat_summary.total_estimated
        
        return ScenarioSummary(
            scenario_id=scenario.id,
            scenario_name=scenario.name,
            total_expenses=total_expenses,
            total_revenues=total_revenues,
            balance=total_revenues - total_expenses,
            total_expenses_estimated=total_expenses_estimated,
            total_revenues_estimated=total_revenues_estimated,
            balance_estimated=total_revenues_estimated - total_expenses_estimated,
            categories=categories_summary
        )
    
    def _calculate_category_summary(self, category: BudgetCategory) -> CategorySummary:
        """Calcula o resumo de uma categoria"""
        total_budgeted = 0.0
        total_realized = 0.0
        total_adjusted = 0.0
        total_estimated = 0.0
        has_realized = False
        has_adjusted = False
        
        # Somar itens da categoria
        for item in category.items:
            for value in item.values:
                total_budgeted += value.budgeted or 0.0
                if value.realized is not None:
                    total_realized += value.realized
                    has_realized = True
                if value.adjusted is not None:
                    total_adjusted += value.adjusted
                    has_adjusted = True
                
                # Calcular estimated manualmente para garantir precisão
                total_estimated += self._calculate_item_estimated(item, value, category.scenario)
        
        # Somar subcategorias recursivamente
        subcategories = self.db.query(BudgetCategory).filter(
            BudgetCategory.parent_category_id == category.id
        ).all()
        
        for subcat in subcategories:
            subcat_summary = self._calculate_category_summary(subcat)
            total_budgeted += subcat_summary.total_budgeted
            if subcat_summary.total_realized is not None:
                total_realized += subcat_summary.total_realized
                has_realized = True
            if subcat_summary.total_adjusted is not None:
                total_adjusted += subcat_summary.total_adjusted
                has_adjusted = True
            total_estimated += subcat_summary.total_estimated
        
        variance = (total_realized - total_budgeted) if has_realized else None
        variance_percent = None
        if variance is not None and total_budgeted != 0:
            variance_percent = (variance / total_budgeted) * 100
        
        return CategorySummary(
            category_id=category.id,
            category_name=category.name,
            item_type=category.item_type.value,  # Adicionar tipo da categoria
            total_budgeted=total_budgeted,
            total_realized=total_realized if has_realized else None,
            total_adjusted=total_adjusted if has_adjusted else None,
            total_estimated=total_estimated,
            variance=variance,
            variance_percent=variance_percent
        )
    
    def _calculate_item_estimated(self, item, value, scenario):
        """Calcula o valor estimado de um item manualmente"""
        if not value:
            return 0.0
            
        # Se tem valor previsto fixo, usa ele
        if value.estimated_fixed is not None:
            return float(value.estimated_fixed)
        
        # Se o item não se repete no próximo orçamento, estimado é zero
        if item.repeats_next_budget:
            return 0.0
        
        # Obter percentual de aumento efetivo
        adjustment_percent = item.get_effective_adjustment_percent()
        
        # Obter margem de risco do cenário
        risk_margin = scenario.risk_margin or 0
        
        # Calcular: orçado * (1 + (aumento + margem)/100)
        budgeted = float(value.budgeted or 0)
        total_percent = adjustment_percent + risk_margin
        return budgeted * (1 + total_percent / 100)
    
    def compare_scenarios(self, base_scenario_id: int, 
                         compared_scenario_id: int) -> Optional[ComparisonResponse]:
        """Compara dois cenários orçamentários"""
        base = self.get_scenario(base_scenario_id)
        compared = self.get_scenario(compared_scenario_id)
        
        if not base or not compared:
            return None
        
        base_summary = self.get_scenario_summary(base_scenario_id)
        compared_summary = self.get_scenario_summary(compared_scenario_id)
        
        if not base_summary or not compared_summary:
            return None
        
        # Comparar categorias
        category_comparisons = []
        
        # Mapear categorias por código para facilitar comparação
        base_categories = {cat.category_id: cat for cat in base_summary.categories}
        compared_categories = {cat.category_id: cat for cat in compared_summary.categories}
        
        # Encontrar categorias correspondentes pelo nome
        for base_cat in base.categories:
            if base_cat.parent_category_id is not None:
                continue
            
            compared_cat = None
            for comp_cat in compared.categories:
                if comp_cat.name == base_cat.name and comp_cat.parent_category_id is None:
                    compared_cat = comp_cat
                    break
            
            if compared_cat:
                cat_comparison = self._compare_categories(base_cat, compared_cat)
                category_comparisons.append(cat_comparison)
        
        return ComparisonResponse(
            base_scenario_id=base.id,
            base_scenario_name=base.name,
            compared_scenario_id=compared.id,
            compared_scenario_name=compared.name,
            total_expenses_base=base_summary.total_expenses,
            total_expenses_compared=compared_summary.total_expenses,
            total_revenues_base=base_summary.total_revenues,
            total_revenues_compared=compared_summary.total_revenues,
            balance_base=base_summary.balance,
            balance_compared=compared_summary.balance,
            categories=category_comparisons
        )
    
    def _compare_categories(self, base_cat: BudgetCategory, 
                           compared_cat: BudgetCategory) -> CategoryComparison:
        """Compara duas categorias"""
        base_summary = self._calculate_category_summary(base_cat)
        compared_summary = self._calculate_category_summary(compared_cat)
        
        difference = compared_summary.total_budgeted - base_summary.total_budgeted
        difference_percent = 0.0
        if base_summary.total_budgeted != 0:
            difference_percent = (difference / base_summary.total_budgeted) * 100
        
        # Comparar itens
        item_comparisons = []
        for base_item in base_cat.items:
            compared_item = None
            for comp_item in compared_cat.items:
                if comp_item.name == base_item.name:
                    compared_item = comp_item
                    break
            
            if compared_item:
                item_comp = self._compare_items(base_item, compared_item)
                item_comparisons.append(item_comp)
        
        return CategoryComparison(
            category_id=base_cat.id,
            category_name=base_cat.name,
            base_total=base_summary.total_budgeted,
            compared_total=compared_summary.total_budgeted,
            difference=difference,
            difference_percent=difference_percent,
            items=item_comparisons
        )
    
    def _compare_items(self, base_item: BudgetItem, 
                      compared_item: BudgetItem) -> ItemComparison:
        """Compara dois itens"""
        base_value = base_item.values[0].budgeted if base_item.values else 0.0
        compared_value = compared_item.values[0].budgeted if compared_item.values else 0.0
        
        difference = compared_value - base_value
        difference_percent = 0.0
        if base_value != 0:
            difference_percent = (difference / base_value) * 100
        
        return ItemComparison(
            item_id=base_item.id,
            item_name=base_item.name,
            base_value=base_value,
            compared_value=compared_value,
            difference=difference,
            difference_percent=difference_percent
        )
    
    # Métodos de comparação removidos - funcionalidade descontinuada

