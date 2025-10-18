#!/usr/bin/env python3
"""
Script para aplicar migrations automaticamente
Executa todas as migrations pendentes usando Alembic
"""
import sys
from pathlib import Path

# Adicionar o diretório raiz ao path
sys.path.insert(0, str(Path(__file__).parent.parent))

from alembic.config import Config
from alembic import command
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def run_migrations():
    """
    Aplica todas as migrations pendentes
    """
    try:
        # Criar configuração do Alembic
        alembic_cfg = Config("alembic.ini")

        # Verificar versão atual
        logger.info("Verificando versão atual do banco de dados...")

        # Aplicar migrations até a mais recente
        logger.info("Aplicando migrations pendentes...")
        command.upgrade(alembic_cfg, "head")

        logger.info("✅ Migrations aplicadas com sucesso!")
        return True

    except Exception as e:
        logger.error(f"❌ Erro ao aplicar migrations: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = run_migrations()
    sys.exit(0 if success else 1)
