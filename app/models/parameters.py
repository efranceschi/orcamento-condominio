"""
Parameters model - configurações gerais do sistema
"""
from sqlalchemy import Column, Integer, Float
from app.database import Base


class SystemParameters(Base):
    """
    Parâmetros do sistema para cálculos
    """
    __tablename__ = "system_parameters"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Metragem total do condomínio
    total_square_meters = Column(Float, default=0.0)
    
    # Simulações de lotes (tamanhos comuns em m²)
    lot_simulation_1 = Column(Float, default=0.0)  # Lote pequeno
    lot_simulation_2 = Column(Float, default=0.0)  # Lote médio
    lot_simulation_3 = Column(Float, default=0.0)  # Lote grande
    
    # Desconto habite-se (em %)
    habite_se_discount = Column(Float, default=10.0)

