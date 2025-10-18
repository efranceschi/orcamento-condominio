"""
Pydantic schemas for budget operations
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class ItemType(str, Enum):
    EXPENSE = "expense"
    REVENUE = "revenue"


# Category Schemas
class CategoryBase(BaseModel):
    name: str
    description: Optional[str] = None
    parent_category_id: Optional[int] = None
    item_type: ItemType
    adjustment_percent: Optional[float] = None


class CategoryCreate(CategoryBase):
    scenario_id: int


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    parent_category_id: Optional[int] = None
    item_type: Optional[ItemType] = None
    adjustment_percent: Optional[float] = None
    order: Optional[int] = None


class CategoryResponse(CategoryBase):
    id: int
    scenario_id: int
    code: Optional[str] = None
    order: int
    items: List['BudgetItemResponse'] = []
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# Budget Value Schemas
class BudgetValueBase(BaseModel):
    budgeted: float = 0.0
    realized: Optional[float] = None
    adjusted: Optional[float] = None
    estimated_fixed: Optional[float] = None
    adjustment_percent: Optional[float] = None
    custom_adjustment: Optional[float] = None
    notes: Optional[str] = None


class BudgetValueCreate(BudgetValueBase):
    item_id: int


class BudgetValueUpdate(BaseModel):
    budgeted: Optional[float] = None
    realized: Optional[float] = None
    adjusted: Optional[float] = None
    estimated_fixed: Optional[float] = None
    adjustment_percent: Optional[float] = None
    custom_adjustment: Optional[float] = None
    notes: Optional[str] = None


class BudgetValueResponse(BudgetValueBase):
    id: int
    item_id: int
    total_used: Optional[float] = None
    used_percent: Optional[float] = None
    estimated: Optional[float] = None
    variance: Optional[float] = None
    variance_percent: Optional[float] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# Budget Item Schemas
class BudgetItemBase(BaseModel):
    name: str
    description: Optional[str] = None
    unit: Optional[str] = None
    order: int = 0
    adjustment_percent: Optional[float] = None
    repeats_next_budget: bool = False
    is_optional: bool = False
    observations: Optional[str] = None


class BudgetItemCreate(BudgetItemBase):
    category_id: int


class BudgetItemUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[int] = None
    unit: Optional[str] = None
    order: Optional[int] = None
    adjustment_percent: Optional[float] = None
    repeats_next_budget: Optional[bool] = None
    is_optional: Optional[bool] = None
    observations: Optional[str] = None


class BudgetItemResponse(BudgetItemBase):
    id: int
    category_id: int
    values: List[BudgetValueResponse] = []
    effective_adjustment_percent: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)


# Budget Category Schemas
class BudgetCategoryBase(BaseModel):
    name: str
    code: Optional[str] = None
    item_type: ItemType
    order: int = 0


class BudgetCategoryCreate(BudgetCategoryBase):
    scenario_id: int
    parent_category_id: Optional[int] = None


class BudgetCategoryResponse(BudgetCategoryBase):
    id: int
    scenario_id: int
    parent_category_id: Optional[int] = None
    items: List[BudgetItemResponse] = []

    model_config = ConfigDict(from_attributes=True)


# Budget Schemas (Orçamento)
class BudgetScenarioBase(BaseModel):
    """Schema base para orçamento"""
    name: str
    description: Optional[str] = None
    year: int
    general_adjustment: float = 0.0
    risk_margin: float = 0.0
    is_baseline: bool = False
    is_approved: bool = False
    is_closed: bool = False


class BudgetScenarioCreate(BudgetScenarioBase):
    """Schema para criação de novo orçamento"""
    base_scenario_id: Optional[int] = None  # ID do orçamento base


class BudgetScenarioUpdate(BaseModel):
    """Schema para atualização de orçamento"""
    name: Optional[str] = None
    description: Optional[str] = None
    year: Optional[int] = None
    general_adjustment: Optional[float] = None
    risk_margin: Optional[float] = None
    is_approved: Optional[bool] = None
    is_baseline: Optional[bool] = None
    is_closed: Optional[bool] = None


class BudgetScenarioResponse(BudgetScenarioBase):
    """Schema de resposta de orçamento"""
    id: int
    base_scenario_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    categories: List[BudgetCategoryResponse] = []

    model_config = ConfigDict(from_attributes=True)


# Summary Schemas
class CategorySummary(BaseModel):
    category_id: int
    category_name: str
    item_type: str  # 'expense' ou 'revenue'
    total_budgeted: float
    total_realized: Optional[float]
    total_adjusted: Optional[float]
    total_estimated: float = 0.0
    variance: Optional[float]
    variance_percent: Optional[float]


class ScenarioSummary(BaseModel):
    scenario_id: int
    scenario_name: str
    total_expenses: float
    total_revenues: float
    balance: float
    total_expenses_estimated: float = 0.0
    total_revenues_estimated: float = 0.0
    balance_estimated: float = 0.0
    categories: List[CategorySummary]


# Simulation Schemas
class ItemAdjustment(BaseModel):
    item_id: int
    adjustment_percent: Optional[float] = None
    custom_value: Optional[float] = None


class CategoryAdjustment(BaseModel):
    category_id: int
    adjustment_percent: float


class SimulationRequest(BaseModel):
    base_scenario_id: int
    name: str
    description: Optional[str] = None
    general_adjustment: float = 0.0
    category_adjustments: List[CategoryAdjustment] = []
    item_adjustments: List[ItemAdjustment] = []
    risk_margin: float = 0.0


class SimulationResponse(BaseModel):
    scenario: BudgetScenarioResponse
    summary: ScenarioSummary
    comparison_with_base: Dict[str, Any]


# Comparison Schemas
class ItemComparison(BaseModel):
    item_id: int
    item_name: str
    base_value: float
    compared_value: float
    difference: float
    difference_percent: float


class CategoryComparison(BaseModel):
    category_id: int
    category_name: str
    base_total: float
    compared_total: float
    difference: float
    difference_percent: float
    items: List[ItemComparison]


class ComparisonResponse(BaseModel):
    base_scenario_id: int
    base_scenario_name: str
    compared_scenario_id: int
    compared_scenario_name: str
    total_expenses_base: float
    total_expenses_compared: float
    total_revenues_base: float
    total_revenues_compared: float
    balance_base: float
    balance_compared: float
    categories: List[CategoryComparison]


# Risk Analysis Schemas
class RiskMetrics(BaseModel):
    standard_deviation: float
    coefficient_variation: float
    risk_score: float  # 0-100
    confidence_level: float


class ItemRisk(BaseModel):
    item_id: int
    item_name: str
    historical_variance_avg: float
    risk_level: str  # "low", "medium", "high"
    recommended_margin: float


class RiskAnalysisResponse(BaseModel):
    scenario_id: int
    scenario_name: str
    overall_risk: RiskMetrics
    high_risk_items: List[ItemRisk]
    recommended_adjustments: Dict[str, float]
    monte_carlo_scenarios: Optional[Dict[str, Any]] = None


# Rebuild models to resolve forward references
CategoryResponse.model_rebuild()

