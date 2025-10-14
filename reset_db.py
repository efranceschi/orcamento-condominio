#!/usr/bin/env python3
"""
Script para resetar o banco de dados
Remove todos os dados e permite reimportação
"""
import sys
from pathlib import Path


def main():
    """
    Remove o banco de dados para permitir reimportação
    """
    print("=" * 60)
    print("RESET DO BANCO DE DADOS")
    print("=" * 60)
    
    db_file = Path("data/condominio_orcamento.db")
    
    if not db_file.exists():
        print("\n✓ Banco de dados não existe. Nada a fazer.")
        print("  Execute 'python init_db.py' para criar um novo banco.")
        return 0
    
    # Confirmar
    print(f"\n⚠️  ATENÇÃO: Esta ação irá DELETAR todos os dados!")
    print(f"  Arquivo: {db_file}")
    
    response = input("\nDeseja continuar? (digite 'SIM' para confirmar): ")
    
    if response.strip().upper() != 'SIM':
        print("\n✗ Operação cancelada.")
        return 0
    
    # Remover arquivo
    try:
        db_file.unlink()
        print("\n✓ Banco de dados removido com sucesso!")
        print("\nPróximos passos:")
        print("  1. Execute: python init_db.py")
        print("  2. Os dados serão reimportados do Excel")
        print("\n")
        return 0
        
    except Exception as e:
        print(f"\n✗ Erro ao remover banco de dados: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())

