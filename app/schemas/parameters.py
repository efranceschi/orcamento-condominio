"""
Parameters schemas
"""
from pydantic import BaseModel, ConfigDict
from typing import Optional


class ParametersBase(BaseModel):
    total_square_meters: float = 0.0
    lot_simulation_1: float = 0.0
    lot_simulation_2: float = 0.0
    lot_simulation_3: float = 0.0
    habite_se_discount: float = 10.0


class ParametersCreate(ParametersBase):
    pass


class ParametersUpdate(BaseModel):
    total_square_meters: Optional[float] = None
    lot_simulation_1: Optional[float] = None
    lot_simulation_2: Optional[float] = None
    lot_simulation_3: Optional[float] = None
    habite_se_discount: Optional[float] = None


class ParametersResponse(ParametersBase):
    id: int
    
    model_config = ConfigDict(from_attributes=True)

