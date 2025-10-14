#!/usr/bin/env python3
"""
Script de inicialização do banco de dados
Cria as tabelas e importa dados do Excel
"""
import sys
from pathlib import Path

from app.database import init_db, SessionLocal
from app.services.excel_import import ExcelImportService


def main():
    """
    Inicializa o banco de dados e importa dados do Excel
    """
    print("=" * 60)
    print("INICIALIZAÇÃO DO SISTEMA DE GERENCIAMENTO ORÇAMENTÁRIO")
    print("=" * 60)
    
    # Criar diretório de dados se não existir
    data_dir = Path("data")
    data_dir.mkdir(exist_ok=True)
    
    # Inicializar banco de dados
    print("\n[1/4] Criando tabelas do banco de dados...")
    try:
        init_db()
        print("✓ Tabelas criadas com sucesso")
    except Exception as e:
        print(f"✗ Erro ao criar tabelas: {e}")
        return 1
    
    # Verificar se há arquivo Excel para importar
    excel_file = Path("Proposta Orçamentária 2026 .xlsx")
    
    if not excel_file.exists():
        print("\n⚠ Arquivo Excel não encontrado")
        print("  Arquivo esperado: Proposta Orçamentária 2026 .xlsx")
        print("  Nenhum dado será importado")
        return 1
    
    # Verificar dados existentes e decidir ação
    print("\n[2/4] Verificando dados existentes...")
    db = SessionLocal()
    try:
        from app.models import BudgetScenario, BudgetItem, BudgetValue, BudgetCategory
        
        existing_scenarios = db.query(BudgetScenario).count()
        
        if existing_scenarios > 0:
            print(f"✓ Banco de dados já possui {existing_scenarios} cenário(s)")
            print("\n[3/4] Removendo itens e valores existentes...")
            
            # Contar itens e valores antes
            items_count = db.query(BudgetItem).count()
            values_count = db.query(BudgetValue).count()
            print(f"  - Removendo {items_count} itens e {values_count} valores...")
            
            # Deletar todos os valores primeiro (por causa de foreign keys)
            db.query(BudgetValue).delete()
            db.commit()
            
            # Deletar todos os itens
            db.query(BudgetItem).delete()
            db.commit()
            
            print(f"✓ Itens e valores removidos com sucesso")
            
            # Deletar cenários existentes
            print(f"  - Removendo {existing_scenarios} cenário(s) antigo(s)...")
            db.query(BudgetCategory).delete()
            db.commit()
            db.query(BudgetScenario).delete()
            db.commit()
            print(f"✓ Cenários e categorias removidos")
        else:
            print("✓ Banco de dados vazio, pronto para importação inicial")
            print("\n[3/4] Preparando para importação...")
        
        # Importar dados do Excel
        print(f"\n  Importando dados do arquivo: {excel_file}")
        
        import_service = ExcelImportService(db)
        
        # Importar cenário de 2026
        scenario = import_service.import_from_file(
            str(excel_file),
            year=2026,
            scenario_name="Orçamento 2026"
        )
        
        # Contar o que foi importado
        new_items_count = db.query(BudgetItem).count()
        new_values_count = db.query(BudgetValue).count()
        new_categories_count = db.query(BudgetCategory).filter(
            BudgetCategory.scenario_id == scenario.id
        ).count()
        
        print(f"\n✓ Cenário '{scenario.name}' importado com sucesso")
        print(f"  - ID: {scenario.id}")
        print(f"  - Ano: {scenario.year}")
        print(f"  - Categorias: {new_categories_count}")
        print(f"  - Itens: {new_items_count}")
        print(f"  - Valores: {new_values_count}")
                
    except Exception as e:
        print(f"\n✗ Erro ao processar dados: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        return 1
    finally:
        db.close()
    
    print("\n[4/4] Verificando integridade do banco de dados...")
    db = SessionLocal()
    try:
        from app.models import BudgetScenario, BudgetCategory, BudgetItem
        
        scenario_count = db.query(BudgetScenario).count()
        category_count = db.query(BudgetCategory).count()
        item_count = db.query(BudgetItem).count()
        
        print(f"✓ Banco de dados verificado")
        print(f"  - Total de cenários: {scenario_count}")
        print(f"  - Total de categorias: {category_count}")
        print(f"  - Total de itens: {item_count}")
        
    except Exception as e:
        print(f"✗ Erro ao verificar banco de dados: {e}")
        return 1
    finally:
        db.close()
    
    print("\n" + "=" * 60)
    print("INICIALIZAÇÃO CONCLUÍDA COM SUCESSO")
    print("=" * 60)
    print("\n⚠ ATENÇÃO: Todos os dados foram sobrescritos com os dados do Excel")
    print("\nPróximos passos:")
    print("  1. Execute o servidor: python main.py")
    print("  2. Acesse http://localhost:8000")
    print("  3. Explore a documentação da API: http://localhost:8000/api/docs")
    print("\n")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())

