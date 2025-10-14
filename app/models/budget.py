"""
Budget-related database models
"""
from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Text, Boolean, Enum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

from app.database import Base


class ItemType(str, enum.Enum):
    """Tipo de item orçamentário"""
    EXPENSE = "expense"  # Despesa
    REVENUE = "revenue"  # Receita


class BudgetScenario(Base):
    """
    Orçamento - representa uma proposta orçamentária completa
    """
    __tablename__ = "budgets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=True)
    year = Column(Integer, nullable=False)
    base_scenario_id = Column(Integer, ForeignKey("budgets.id"), nullable=True)
    
    # Metadados
    is_baseline = Column(Boolean, default=False)  # É o orçamento base (realizado)?
    is_approved = Column(Boolean, default=False)  # Foi aprovado?
    is_closed = Column(Boolean, default=False)  # Está finalizado (não editável)?
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Parâmetros de simulação
    general_adjustment = Column(Float, default=0.0)  # Reajuste geral (%)
    risk_margin = Column(Float, default=0.0)  # Margem de risco (%)
    
    # Relacionamentos
    categories = relationship("BudgetCategory", back_populates="scenario", cascade="all, delete-orphan", order_by="BudgetCategory.order, BudgetCategory.name")
    base_scenario = relationship("BudgetScenario", remote_side=[id], uselist=False)


class BudgetCategory(Base):
    """
    Categoria orçamentária (ex: Despesas com Pessoal, Manutenção, etc)
    """
    __tablename__ = "budget_categories"

    id = Column(Integer, primary_key=True, index=True)
    scenario_id = Column(Integer, ForeignKey("budgets.id"), nullable=False)
    parent_category_id = Column(Integer, ForeignKey("budget_categories.id"), nullable=True)
    
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)  # Descrição da categoria
    code = Column(String, nullable=True, index=True)  # Código contábil
    item_type = Column(Enum(ItemType), nullable=False)
    order = Column(Integer, default=0)  # Ordem de exibição
    adjustment_percent = Column(Float, nullable=True)  # % reajuste padrão para itens desta categoria
    
    # Metadados
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relacionamentos
    scenario = relationship("BudgetScenario", back_populates="categories")
    parent_category = relationship("BudgetCategory", remote_side=[id], uselist=False)
    items = relationship("BudgetItem", back_populates="category", cascade="all, delete-orphan", order_by="BudgetItem.name")


class BudgetItem(Base):
    """
    Item orçamentário individual (ex: Salários, INSS, Água, etc)
    """
    __tablename__ = "budget_items"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("budget_categories.id"), nullable=False)
    
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    unit = Column(String, nullable=True)  # Unidade de medida
    order = Column(Integer, default=0)
    adjustment_percent = Column(Float, nullable=True)  # Percentual de reajuste do item
    repeats_next_budget = Column(Boolean, default=False)  # Se true, não calcula estimado (será zero no próximo orçamento)
    is_optional = Column(Boolean, default=False)  # Se true, marca o item como opcional para análise posterior
    
    # Relacionamentos
    category = relationship("BudgetCategory", back_populates="items")
    values = relationship("BudgetValue", back_populates="item", cascade="all, delete-orphan")
    
    def get_effective_adjustment_percent(self):
        """
        Retorna o percentual de reajuste efetivo, considerando hierarquia:
        1. Percentual do item
        2. Percentual da categoria pai
        3. Percentual da hierarquia de categorias (recursivo)
        4. Percentual do cenário (general_adjustment)
        """
        # 1. Se o item tem percentual, usar esse
        if self.adjustment_percent is not None:
            return self.adjustment_percent
        
        # 2. Se a categoria tem percentual, usar esse
        if self.category and self.category.adjustment_percent is not None:
            return self.category.adjustment_percent
        
        # 3. Subir na hierarquia de categorias
        if self.category and self.category.parent_category:
            parent = self.category.parent_category
            while parent:
                if parent.adjustment_percent is not None:
                    return parent.adjustment_percent
                parent = parent.parent_category
        
        # 4. Usar percentual geral do cenário
        if self.category and self.category.scenario:
            return self.category.scenario.general_adjustment or 0
        
        return 0


class BudgetValue(Base):
    """
    Valores orçamentários para diferentes períodos/tipos
    """
    __tablename__ = "budget_values"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("budget_items.id"), nullable=False)
    
    # Valores
    budgeted = Column(Float, default=0.0)  # Valor orçado
    realized = Column(Float, nullable=True)  # Valor realizado
    adjusted = Column(Float, nullable=True)  # Valor ajustado
    estimated_fixed = Column(Float, nullable=True)  # Valor previsto fixo (se preenchido, ignora cálculo por %)
    
    # Parâmetros de ajuste
    adjustment_percent = Column(Float, nullable=True)  # % de reajuste específico do item
    custom_adjustment = Column(Float, nullable=True)  # Ajuste customizado
    
    # Metadados
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relacionamentos
    item = relationship("BudgetItem", back_populates="values")
    
    @property
    def total_used(self):
        """Retorna o total utilizado (realizado)"""
        return self.realized or 0
    
    @property
    def used_percent(self):
        """Calcula a % de utilização em relação ao orçado"""
        if self.budgeted and self.budgeted != 0:
            return (self.total_used / self.budgeted) * 100
        return 0
    
    @property
    def estimated(self):
        """Calcula o valor estimado (orçado * (1 + (aumento + margem_risco)/100))"""
        # Se tem valor previsto fixo, usa ele
        if self.estimated_fixed is not None:
            return self.estimated_fixed
        
        # Se o item não se repete no próximo orçamento, estimado é zero
        if self.item and self.item.repeats_next_budget:
            return 0
        
        if self.item and self.item.category and self.item.category.scenario:
            # Obter percentual de aumento efetivo (item -> categoria -> cenário)
            adjustment_percent = self.item.get_effective_adjustment_percent()
            # Obter margem de risco do cenário
            risk_margin = self.item.category.scenario.risk_margin or 0
            # Calcular: orçado * (1 + (aumento + margem)/100)
            # Os percentuais são SOMADOS, não multiplicados
            total_percent = adjustment_percent + risk_margin
            return self.budgeted * (1 + total_percent / 100)
        return self.budgeted
    
    @property
    def variance(self):
        """Calcula a variação entre orçado e realizado"""
        if self.realized is not None:
            return self.realized - self.budgeted
        return None
    
    @property
    def variance_percent(self):
        """Calcula a % de variação"""
        if self.realized is not None and self.budgeted != 0:
            return ((self.realized - self.budgeted) / self.budgeted) * 100
        return None


# Classe BudgetComparison removida - funcionalidade de comparações descontinuada
# A tabela budget_comparisons ainda existe no banco mas não é mais usada

