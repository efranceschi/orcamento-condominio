#!/usr/bin/env python3
"""
Script de inicialização do banco de dados
Cria as tabelas necessárias para o sistema
"""
import sys
from pathlib import Path

from app.database import init_db


def main():
    """
    Inicializa o banco de dados criando as tabelas
    """
    print("=" * 60)
    print("INICIALIZAÇÃO DO SISTEMA DE GERENCIAMENTO ORÇAMENTÁRIO")
    print("=" * 60)

    # Criar diretório de dados se não existir
    data_dir = Path("data")
    data_dir.mkdir(exist_ok=True)

    # Inicializar banco de dados
    print("\n[1/1] Criando tabelas do banco de dados...")
    try:
        init_db()
        print("✓ Tabelas criadas com sucesso")
    except Exception as e:
        print(f"✗ Erro ao criar tabelas: {e}")
        import traceback
        traceback.print_exc()
        return 1

    print("\n" + "=" * 60)
    print("INICIALIZAÇÃO CONCLUÍDA COM SUCESSO")
    print("=" * 60)
    print("\nPróximos passos:")
    print("  1. Execute o servidor: python main.py")
    print("  2. Acesse http://localhost:8000")
    print("  3. Explore a documentação da API: http://localhost:8000/api/docs")
    print("  4. Use a API para importar dados ou criar cenários")
    print("\n")

    return 0


if __name__ == "__main__":
    sys.exit(main())

