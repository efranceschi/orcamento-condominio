#!/usr/bin/env python3
"""
Script para remover cenários duplicados
Mantém apenas o primeiro de cada cenário duplicado
"""
import sys
from app.database import SessionLocal
from app.models import BudgetScenario


def main():
    """
    Remove cenários duplicados mantendo apenas o primeiro
    """
    print("=" * 60)
    print("LIMPEZA DE CENÁRIOS DUPLICADOS")
    print("=" * 60)
    
    db = SessionLocal()
    try:
        # Buscar todos os cenários
        scenarios = db.query(BudgetScenario).order_by(BudgetScenario.id).all()
        
        print(f"\n[1/3] Cenários encontrados: {len(scenarios)}")
        for s in scenarios:
            print(f"  - ID {s.id}: {s.name} ({s.year})")
        
        # Identificar duplicados
        seen = {}
        duplicates = []
        
        for scenario in scenarios:
            key = (scenario.name, scenario.year)
            if key in seen:
                duplicates.append(scenario)
            else:
                seen[key] = scenario
        
        if not duplicates:
            print("\n✓ Nenhum cenário duplicado encontrado!")
            return 0
        
        print(f"\n[2/3] Cenários duplicados encontrados: {len(duplicates)}")
        for s in duplicates:
            print(f"  - ID {s.id}: {s.name} ({s.year}) [SERÁ REMOVIDO]")
        
        # Confirmar
        response = input("\nDeseja remover os duplicados? (digite 'SIM' para confirmar): ")
        
        if response.strip().upper() != 'SIM':
            print("\n✗ Operação cancelada.")
            return 0
        
        # Remover duplicados
        print("\n[3/3] Removendo duplicados...")
        for scenario in duplicates:
            print(f"  Removendo ID {scenario.id}: {scenario.name}...")
            db.delete(scenario)
        
        db.commit()
        
        # Verificar resultado
        remaining = db.query(BudgetScenario).count()
        print(f"\n✓ Limpeza concluída!")
        print(f"  - Removidos: {len(duplicates)} cenário(s)")
        print(f"  - Restantes: {remaining} cenário(s)")
        print("\n")
        
        return 0
        
    except Exception as e:
        print(f"\n✗ Erro ao limpar duplicados: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())

