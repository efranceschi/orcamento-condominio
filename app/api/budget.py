"""
Budget management API endpoints
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import BudgetCategory, BudgetItem, BudgetScenario, User
from app.schemas.budget import (
    BudgetScenarioCreate,
    BudgetScenarioUpdate,
    BudgetScenarioResponse,
    ScenarioSummary,
    ComparisonResponse,
    CategoryCreate,
    CategoryUpdate,
    CategoryResponse
)
from app.services.budget_service import BudgetService
from app.services.pdf_service import BudgetPDFGenerator
from app.services.auth_service import require_admin

router = APIRouter(prefix="/api/budgets", tags=["budgets"])


@router.post("/scenarios", response_model=BudgetScenarioResponse, status_code=201)
def create_scenario(
    scenario_data: BudgetScenarioCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Cria um novo cenário orçamentário
    """
    service = BudgetService(db)
    return service.create_scenario(scenario_data)


@router.get("/scenarios", response_model=List[BudgetScenarioResponse])
def list_scenarios(
    year: Optional[int] = Query(None, description="Filtrar por ano"),
    is_baseline: Optional[bool] = Query(None, description="Filtrar por cenário base"),
    db: Session = Depends(get_db)
):
    """
    Lista todos os cenários orçamentários com filtros opcionais
    """
    service = BudgetService(db)
    return service.get_scenarios(year=year, is_baseline=is_baseline)


@router.get("/scenarios/{scenario_id}", response_model=BudgetScenarioResponse)
def get_scenario(
    scenario_id: int,
    db: Session = Depends(get_db)
):
    """
    Obtém um cenário orçamentário específico
    """
    service = BudgetService(db)
    scenario = service.get_scenario(scenario_id)
    if not scenario:
        raise HTTPException(status_code=404, detail="Cenário não encontrado")
    return scenario


@router.put("/scenarios/{scenario_id}", response_model=BudgetScenarioResponse)
def update_scenario(
    scenario_id: int,
    scenario_data: BudgetScenarioUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Atualiza um cenário orçamentário
    """
    service = BudgetService(db)
    scenario = service.update_scenario(scenario_id, scenario_data)
    if not scenario:
        raise HTTPException(status_code=404, detail="Cenário não encontrado")
    return scenario


@router.delete("/scenarios/{scenario_id}", status_code=204)
def delete_scenario(
    scenario_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Deleta um cenário orçamentário
    """
    service = BudgetService(db)
    if not service.delete_scenario(scenario_id):
        raise HTTPException(status_code=404, detail="Cenário não encontrado")
    return None


@router.get("/scenarios/{scenario_id}/summary", response_model=ScenarioSummary)
def get_scenario_summary(
    scenario_id: int,
    db: Session = Depends(get_db)
):
    """
    Obtém o resumo financeiro de um cenário
    """
    service = BudgetService(db)
    summary = service.get_scenario_summary(scenario_id)
    if not summary:
        raise HTTPException(status_code=404, detail="Cenário não encontrado")
    return summary


@router.get("/scenarios/compare/{base_id}/{compared_id}", response_model=ComparisonResponse)
def compare_scenarios(
    base_id: int,
    compared_id: int,
    db: Session = Depends(get_db)
):
    """
    Compara dois cenários orçamentários
    """
    service = BudgetService(db)
    comparison = service.compare_scenarios(base_id, compared_id)
    if not comparison:
        raise HTTPException(status_code=404, detail="Um ou ambos os cenários não foram encontrados")
    return comparison


@router.post("/scenarios/compare")
def save_comparison(
    base_scenario_id: int,
    compared_scenario_id: int,
    name: str,
    description: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Salva uma comparação entre cenários
    """
    service = BudgetService(db)
    comparison = service.create_comparison(
        base_scenario_id, 
        compared_scenario_id, 
        name, 
        description
    )
    return comparison


# Category Management Endpoints

@router.post("/categories", response_model=CategoryResponse, status_code=201)
def create_category(
    category_data: CategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Cria uma nova categoria orçamentária
    
    Regras:
    - Categorias raiz (sem pai) podem ser EXPENSE ou REVENUE
    - Categorias filhas devem ter o mesmo item_type da pai
    - Não pode misturar receitas com despesas na hierarquia
    """
    # Validar que o cenário existe
    from app.models import BudgetScenario
    scenario = db.query(BudgetScenario).filter(BudgetScenario.id == category_data.scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Cenário não encontrado")
    
    # Se tem pai, validar que o tipo é o mesmo
    if category_data.parent_category_id:
        parent = db.query(BudgetCategory).filter(BudgetCategory.id == category_data.parent_category_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Categoria pai não encontrada")
        
        if parent.item_type != category_data.item_type:
            raise HTTPException(
                status_code=400,
                detail=f"Categoria filha deve ter o mesmo tipo da pai. "
                       f"Pai é {parent.item_type.value}, tentando criar {category_data.item_type.value}"
            )
    
    new_category = BudgetCategory(**category_data.model_dump())
    db.add(new_category)
    db.commit()
    db.refresh(new_category)
    return new_category


@router.get("/categories", response_model=List[CategoryResponse])
def list_categories(
    scenario_id: Optional[int] = Query(None),
    parent_category_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Lista categorias com filtros opcionais
    """
    from sqlalchemy.orm import selectinload
    
    query = db.query(BudgetCategory).options(
        selectinload(BudgetCategory.items).selectinload(BudgetItem.values)
    )
    if scenario_id:
        query = query.filter(BudgetCategory.scenario_id == scenario_id)
    if parent_category_id is not None:
        query = query.filter(BudgetCategory.parent_category_id == parent_category_id)
    
    categories = query.order_by(BudgetCategory.order, BudgetCategory.name).all()
    
    # Adicionar effective_adjustment_percent para cada item
    result = []
    for category in categories:
        category_dict = CategoryResponse.model_validate(category).model_dump()
        # Processar itens para adicionar effective_adjustment_percent
        for i, item in enumerate(category.items):
            if i < len(category_dict['items']):
                category_dict['items'][i]['effective_adjustment_percent'] = item.get_effective_adjustment_percent()
        result.append(CategoryResponse(**category_dict))
    
    return result


@router.get("/categories/{category_id}", response_model=CategoryResponse)
def get_category(
    category_id: int,
    db: Session = Depends(get_db)
):
    """
    Obtém uma categoria específica
    """
    category = db.query(BudgetCategory).filter(BudgetCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Categoria não encontrada")
    return category


@router.put("/categories/{category_id}", response_model=CategoryResponse)
def update_category(
    category_id: int,
    category_data: CategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Atualiza uma categoria (sem propagar mudanças para itens filhos)
    """
    category = db.query(BudgetCategory).filter(BudgetCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Categoria não encontrada")
    
    # Usar exclude_unset=True para pegar apenas campos fornecidos
    update_data = category_data.model_dump(exclude_unset=True)
    
    print(f"Atualizando categoria {category_id}")
    print(f"Dados recebidos: {update_data}")
    print(f"Valor atual de adjustment_percent: {category.adjustment_percent}")
    
    for key, value in update_data.items():
        print(f"Setando {key} = {value}")
        setattr(category, key, value)
    
    print(f"Novo valor de adjustment_percent: {category.adjustment_percent}")
    
    db.commit()
    db.refresh(category)
    
    print(f"Após commit - adjustment_percent: {category.adjustment_percent}")
    
    return category


@router.delete("/categories/{category_id}", status_code=204)
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Deleta uma categoria
    """
    category = db.query(BudgetCategory).filter(BudgetCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Categoria não encontrada")
    
    # Verificar se tem subcategorias
    subcategories = db.query(BudgetCategory).filter(
        BudgetCategory.parent_category_id == category_id
    ).count()
    if subcategories > 0:
        raise HTTPException(
            status_code=400,
            detail="Não é possível deletar categoria com subcategorias. Delete as subcategorias primeiro."
        )
    
    # Verificar se tem itens
    if category.items:
        raise HTTPException(
            status_code=400,
            detail="Não é possível deletar categoria com itens associados"
        )
    
    db.delete(category)
    db.commit()
    return None


@router.post("/scenarios/{scenario_id}/initialize-categories")
def initialize_root_categories(
    scenario_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Inicializa as categorias raiz (RECEITAS e DESPESAS) para um cenário
    
    Este endpoint cria automaticamente:
    - Categoria raiz "RECEITAS" (tipo: revenue)
    - Categoria raiz "DESPESAS" (tipo: expense)
    
    Se já existirem categorias raiz para o cenário, retorna as existentes.
    """
    from app.models import BudgetScenario
    from app.models.budget import ItemType as ModelItemType
    
    # Verificar se cenário existe
    scenario = db.query(BudgetScenario).filter(BudgetScenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Cenário não encontrado")
    
    # Verificar categorias raiz existentes
    existing_categories = db.query(BudgetCategory).filter(
        BudgetCategory.scenario_id == scenario_id,
        BudgetCategory.parent_category_id.is_(None)
    ).all()
    
    # Se já tem ambas as categorias raiz, retornar
    if len(existing_categories) >= 2:
        return {
            "message": "Categorias raiz já existem",
            "categories": existing_categories
        }
    
    # Criar categoria de DESPESAS se não existir
    expense_cat = next(
        (cat for cat in existing_categories if cat.item_type == ModelItemType.EXPENSE),
        None
    )
    if not expense_cat:
        expense_cat = BudgetCategory(
            scenario_id=scenario_id,
            name="DESPESAS",
            item_type=ModelItemType.EXPENSE,
            code="1",
            order=1,
            parent_category_id=None
        )
        db.add(expense_cat)
    
    # Criar categoria de RECEITAS se não existir
    revenue_cat = next(
        (cat for cat in existing_categories if cat.item_type == ModelItemType.REVENUE),
        None
    )
    if not revenue_cat:
        revenue_cat = BudgetCategory(
            scenario_id=scenario_id,
            name="RECEITAS",
            item_type=ModelItemType.REVENUE,
            code="2",
            order=2,
            parent_category_id=None
        )
        db.add(revenue_cat)
    
    db.commit()
    db.refresh(expense_cat)
    db.refresh(revenue_cat)
    
    return {
        "message": "Categorias raiz criadas com sucesso",
        "categories": [expense_cat, revenue_cat]
    }


@router.post("/scenarios/{scenario_id}/close")
def close_scenario(scenario_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    """
    Finaliza um cenário orçamentário, tornando-o não editável
    """
    from app.models import BudgetScenario
    
    scenario = db.query(BudgetScenario).filter(BudgetScenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Cenário não encontrado")
    
    if scenario.is_closed:
        raise HTTPException(status_code=400, detail="Cenário já está finalizado")
    
    scenario.is_closed = True
    db.commit()
    db.refresh(scenario)
    
    return {"message": "Cenário finalizado com sucesso", "scenario": scenario}


@router.post("/scenarios/{scenario_id}/reopen")
def reopen_scenario(scenario_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    """
    Reabre um cenário orçamentário finalizado, permitindo edição
    """
    from app.models import BudgetScenario
    
    scenario = db.query(BudgetScenario).filter(BudgetScenario.id == scenario_id).first()
    if not scenario:
        raise HTTPException(status_code=404, detail="Cenário não encontrado")
    
    if not scenario.is_closed:
        raise HTTPException(status_code=400, detail="Cenário já está aberto")
    
    scenario.is_closed = False
    db.commit()
    db.refresh(scenario)
    
    return {"message": "Cenário reaberto com sucesso", "scenario": scenario}


@router.post("/scenarios/{scenario_id}/copy-from-previous-year")
def copy_from_previous_year(
    scenario_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Copia estrutura e valores do orçamento do ano anterior para este cenário
    
    Copia:
    - Categorias (estrutura hierárquica)
    - Itens orçamentários
    - Valores orçados (como base para o novo ano)
    - Percentuais de reajuste
    """
    from app.models import BudgetScenario, BudgetItem, BudgetValue
    
    # Buscar cenário atual
    current_scenario = db.query(BudgetScenario).filter(BudgetScenario.id == scenario_id).first()
    if not current_scenario:
        raise HTTPException(status_code=404, detail="Cenário não encontrado")
    
    # Buscar cenário do ano anterior
    previous_year = current_scenario.year - 1
    previous_scenario = db.query(BudgetScenario).filter(
        BudgetScenario.year == previous_year,
        BudgetScenario.is_baseline == True
    ).first()
    
    if not previous_scenario:
        raise HTTPException(
            status_code=404,
            detail=f"Nenhum cenário base encontrado para o ano {previous_year}"
        )
    
    # Verificar se já tem categorias (evitar duplicação)
    existing_categories = db.query(BudgetCategory).filter(
        BudgetCategory.scenario_id == scenario_id
    ).count()
    
    if existing_categories > 2:  # Mais que as raizes
        raise HTTPException(
            status_code=400,
            detail="Cenário já possui categorias. Limpe antes de copiar."
        )
    
    # Copiar categorias
    category_map = {}  # old_id -> new_id
    
    def copy_categories(parent_category_id=None, new_parent_category_id=None):
        categories = db.query(BudgetCategory).filter(
            BudgetCategory.scenario_id == previous_scenario.id,
            BudgetCategory.parent_category_id == parent_category_id
        ).all()
        
        for old_cat in categories:
            new_cat = BudgetCategory(
                scenario_id=current_scenario.id,
                parent_category_id=new_parent_category_id,
                name=old_cat.name,
                description=old_cat.description,
                code=old_cat.code,
                item_type=old_cat.item_type,
                order=old_cat.order,
                adjustment_percent=old_cat.adjustment_percent
            )
            db.add(new_cat)
            db.flush()  # Para obter o ID
            
            category_map[old_cat.id] = new_cat.id
            
            # Recursivamente copiar subcategorias
            copy_categories(old_cat.id, new_cat.id)
            
            # Copiar itens desta categoria
            items = db.query(BudgetItem).filter(
                BudgetItem.category_id == old_cat.id
            ).all()
            
            for old_item in items:
                new_item = BudgetItem(
                    category_id=new_cat.id,
                    name=old_item.name,
                    description=old_item.description,
                    item_type=old_item.item_type,
                    unit=old_item.unit,
                    quantity=old_item.quantity
                )
                db.add(new_item)
                db.flush()
                
                # Copiar valores (último valor do ano anterior como orçado)
                old_values = db.query(BudgetValue).filter(
                    BudgetValue.item_id == old_item.id
                ).order_by(BudgetValue.created_at.desc()).first()
                
                if old_values:
                    new_value = BudgetValue(
                        item_id=new_item.id,
                        budgeted=old_values.budgeted,  # Orçado do ano anterior como base
                        adjustment_percent=old_values.adjustment_percent,
                        notes=f"Copiado do orçamento {previous_year}"
                    )
                    db.add(new_value)
    
    # Iniciar cópia recursiva das categorias raiz
    copy_categories()
    
    db.commit()
    
    return {
        "message": f"Estrutura copiada com sucesso do ano {previous_year}",
        "categories_copied": len(category_map),
        "previous_scenario": previous_scenario.name
    }


@router.get("/scenarios/{scenario_id}/download-pdf")
def download_budget_pdf(
    scenario_id: int,
    db: Session = Depends(get_db)
):
    """
    Gera e baixa o orçamento completo em formato PDF
    """
    # Buscar cenário com todas as categorias e itens
    scenario = db.query(BudgetScenario).filter(
        BudgetScenario.id == scenario_id
    ).first()
    
    if not scenario:
        raise HTTPException(status_code=404, detail="Orçamento não encontrado")
    
    # Buscar todas as categorias com itens e valores (eager loading)
    categories = db.query(BudgetCategory).filter(
        BudgetCategory.scenario_id == scenario_id
    ).options(
        selectinload(BudgetCategory.items).selectinload(BudgetItem.values)
    ).order_by(BudgetCategory.order, BudgetCategory.name).all()
    
    # Gerar PDF
    pdf_generator = BudgetPDFGenerator(scenario, categories, db)
    pdf_buffer = pdf_generator.generate()
    
    # Nome do arquivo
    filename = f"Orcamento_{scenario.name.replace(' ', '_')}_{scenario.year}.pdf"
    
    # Retornar como streaming response
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )

