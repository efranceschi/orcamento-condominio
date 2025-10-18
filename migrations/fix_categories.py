"""
Script para corrigir categorias existentes e garantir estrutura hierárquica correta
"""
from app.database import SessionLocal
from app.models import BudgetScenario, BudgetCategory
from app.models.budget import ItemType

def fix_categories():
    db = SessionLocal()
    
    print("="*60)
    print("CORREÇÃO DE CATEGORIAS")
    print("="*60)
    
    try:
        # Buscar todos os cenários
        scenarios = db.query(BudgetScenario).all()
        
        print(f"\n✓ Encontrados {len(scenarios)} cenários")
        
        for scenario in scenarios:
            print(f"\n{'─'*60}")
            print(f"Cenário: {scenario.name} (ID: {scenario.id})")
            print(f"{'─'*60}")
            
            # Buscar categorias raiz do cenário
            root_categories = db.query(BudgetCategory).filter(
                BudgetCategory.scenario_id == scenario.id,
                BudgetCategory.parent_category_id.is_(None)
            ).all()
            
            print(f"Categorias raiz atuais: {len(root_categories)}")
            for cat in root_categories:
                print(f"  - {cat.name} ({cat.item_type.value if cat.item_type else 'SEM TIPO'})")
            
            # Verificar se tem categoria de DESPESAS
            expense_root = next(
                (cat for cat in root_categories if cat.item_type == ItemType.EXPENSE),
                None
            )
            
            if not expense_root:
                print("\n  ⚠️  Criando categoria raiz DESPESAS...")
                expense_root = BudgetCategory(
                    scenario_id=scenario.id,
                    name="DESPESAS",
                    item_type=ItemType.EXPENSE,
                    code="1",
                    order=1,
                    parent_category_id=None
                )
                db.add(expense_root)
                db.flush()  # Obter ID sem commitar ainda
                print(f"  ✓ Categoria DESPESAS criada (ID: {expense_root.id})")
            else:
                print(f"  ✓ Categoria DESPESAS já existe (ID: {expense_root.id})")
            
            # Verificar se tem categoria de RECEITAS
            revenue_root = next(
                (cat for cat in root_categories if cat.item_type == ItemType.REVENUE),
                None
            )
            
            if not revenue_root:
                print("\n  ⚠️  Criando categoria raiz RECEITAS...")
                revenue_root = BudgetCategory(
                    scenario_id=scenario.id,
                    name="RECEITAS",
                    item_type=ItemType.REVENUE,
                    code="2",
                    order=2,
                    parent_category_id=None
                )
                db.add(revenue_root)
                db.flush()
                print(f"  ✓ Categoria RECEITAS criada (ID: {revenue_root.id})")
            else:
                print(f"  ✓ Categoria RECEITAS já existe (ID: {revenue_root.id})")
            
            # Associar categorias órfãs às raízes apropriadas
            orphan_categories = db.query(BudgetCategory).filter(
                BudgetCategory.scenario_id == scenario.id,
                BudgetCategory.parent_category_id.is_(None),
                BudgetCategory.id != expense_root.id,
                BudgetCategory.id != revenue_root.id
            ).all()
            
            if orphan_categories:
                print(f"\n  ⚠️  Encontradas {len(orphan_categories)} categorias órfãs")
                for orphan in orphan_categories:
                    if orphan.item_type == ItemType.EXPENSE:
                        orphan.parent_category_id = expense_root.id
                        print(f"    ✓ {orphan.name} → vinculada a DESPESAS")
                    elif orphan.item_type == ItemType.REVENUE:
                        orphan.parent_category_id = revenue_root.id
                        print(f"    ✓ {orphan.name} → vinculada a RECEITAS")
                    else:
                        print(f"    ⚠️  {orphan.name} sem tipo definido - pulando")
            
        # Commitar todas as mudanças
        db.commit()
        
        print(f"\n{'='*60}")
        print("✅ CORREÇÃO CONCLUÍDA COM SUCESSO")
        print(f"{'='*60}\n")
        
        # Mostrar resumo final
        print("RESUMO:")
        for scenario in scenarios:
            categories = db.query(BudgetCategory).filter(
                BudgetCategory.scenario_id == scenario.id
            ).all()
            
            expense_count = len([c for c in categories if c.item_type == ItemType.EXPENSE])
            revenue_count = len([c for c in categories if c.item_type == ItemType.REVENUE])
            
            print(f"\n{scenario.name}:")
            print(f"  • Total de categorias: {len(categories)}")
            print(f"  • Despesas: {expense_count}")
            print(f"  • Receitas: {revenue_count}")
        
    except Exception as e:
        db.rollback()
        print(f"\n❌ ERRO: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        db.close()


if __name__ == "__main__":
    try:
        fix_categories()
    except KeyboardInterrupt:
        print("\n\n⚠️  Execução interrompida pelo usuário")
    except Exception as e:
        print(f"\n\n❌ Erro fatal: {e}")

