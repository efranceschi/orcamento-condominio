"""
Parameters API routes
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.models.parameters import SystemParameters
from app.models.user import User
from app.schemas.parameters import ParametersResponse, ParametersUpdate, ParametersCreate
from app.services.auth_service import require_admin

router = APIRouter(prefix="/api/parameters", tags=["parameters"])


@router.get("", response_model=ParametersResponse)
def get_parameters(db: Session = Depends(get_db)):
    """
    Retorna os parâmetros do sistema (sempre retorna ou cria o registro único)
    """
    params = db.query(SystemParameters).first()
    if not params:
        # Criar registro inicial se não existir
        params = SystemParameters(
            total_square_meters=0.0,
            lot_simulation_1=0.0,
            lot_simulation_2=0.0,
            lot_simulation_3=0.0,
            habite_se_discount=10.0
        )
        db.add(params)
        db.commit()
        db.refresh(params)
    return params


@router.put("", response_model=ParametersResponse)
def update_parameters(
    params_data: ParametersUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Atualiza os parâmetros do sistema
    """
    params = db.query(SystemParameters).first()
    if not params:
        # Criar se não existir
        params = SystemParameters()
        db.add(params)
    
    update_data = params_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(params, key, value)
    
    db.commit()
    db.refresh(params)
    return params


@router.post("", response_model=ParametersResponse)
def create_parameters(
    params_data: ParametersCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Cria os parâmetros do sistema (apenas se não existir)
    """
    existing = db.query(SystemParameters).first()
    if existing:
        raise HTTPException(status_code=400, detail="Parâmetros já existem. Use PUT para atualizar.")
    
    params = SystemParameters(**params_data.model_dump())
    db.add(params)
    db.commit()
    db.refresh(params)
    return params

