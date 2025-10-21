"""
Items management API endpoints
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import BudgetItem, BudgetValue, User
from app.schemas.budget import (
    BudgetItemCreate,
    BudgetItemUpdate,
    BudgetItemResponse,
    BudgetValueCreate,
    BudgetValueUpdate,
    BudgetValueResponse
)
from app.services.auth_service import require_admin, get_current_user

router = APIRouter(prefix="/api/items", tags=["items"])


@router.post("", response_model=BudgetItemResponse)
def create_item(item_data: BudgetItemCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    """
    Cria um novo item orçamentário
    """
    new_item = BudgetItem(**item_data.model_dump())
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    
    # Adicionar o percentual efetivo calculado
    response = BudgetItemResponse.model_validate(new_item)
    response.effective_adjustment_percent = new_item.get_effective_adjustment_percent()
    return response


@router.get("/{item_id}", response_model=BudgetItemResponse)
def get_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Obtém um item orçamentário específico
    """
    item = db.query(BudgetItem).filter(BudgetItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    
    # Adicionar o percentual efetivo calculado
    response = BudgetItemResponse.model_validate(item)
    response.effective_adjustment_percent = item.get_effective_adjustment_percent()
    return response


@router.put("/{item_id}", response_model=BudgetItemResponse)
def update_item(
    item_id: int,
    item_data: BudgetItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Atualiza um item orçamentário (atualização parcial)
    """
    item = db.query(BudgetItem).filter(BudgetItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    
    update_data = item_data.model_dump(exclude_unset=True)
    for key, val in update_data.items():
        setattr(item, key, val)
    
    db.commit()
    db.refresh(item)
    
    # Adicionar o percentual efetivo calculado
    response = BudgetItemResponse.model_validate(item)
    response.effective_adjustment_percent = item.get_effective_adjustment_percent()
    return response


@router.delete("/{item_id}")
def delete_item(item_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    """
    Deleta um item orçamentário
    """
    item = db.query(BudgetItem).filter(BudgetItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    
    db.delete(item)
    db.commit()
    return {"message": "Item deletado com sucesso"}


@router.post("/values", response_model=BudgetValueResponse)
def create_item_value(value_data: BudgetValueCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    """
    Cria um novo valor para um item orçamentário
    """
    # Verificar se o item existe
    item = db.query(BudgetItem).filter(BudgetItem.id == value_data.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    
    new_value = BudgetValue(**value_data.model_dump())
    db.add(new_value)
    db.commit()
    db.refresh(new_value)
    return new_value


@router.put("/values/{value_id}", response_model=BudgetValueResponse)
def update_item_value(
    value_id: int,
    value_data: BudgetValueUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Atualiza os valores de um item orçamentário
    """
    # Buscar o valor
    value = db.query(BudgetValue).filter(BudgetValue.id == value_id).first()
    
    if not value:
        raise HTTPException(status_code=404, detail="Valor não encontrado")
    
    # Atualizar apenas os campos fornecidos
    update_data = value_data.model_dump(exclude_unset=True)
    for key, val in update_data.items():
        setattr(value, key, val)
    
    db.commit()
    db.refresh(value)
    return value

