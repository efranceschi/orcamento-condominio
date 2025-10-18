"""
Serviço de backup e restauração do banco de dados SQLite
Permite exportar e importar toda a base de dados
"""
import os
import shutil
import tempfile
from pathlib import Path
from datetime import datetime
from typing import BinaryIO
from sqlalchemy import text
from app.database import SessionLocal, engine, SQLALCHEMY_DATABASE_URL


class DatabaseBackupService:
    """Serviço para backup e restauração do banco de dados"""

    def __init__(self):
        # Extrair o caminho do arquivo do database URL
        # sqlite:///./data/condominio_orcamento.db -> ./data/condominio_orcamento.db
        self.db_path = Path(SQLALCHEMY_DATABASE_URL.replace("sqlite:///", ""))

    def export_database(self) -> tuple[bytes, str]:
        """
        Exporta o banco de dados completo

        Returns:
            tuple: (bytes do arquivo, nome do arquivo sugerido)
        """
        if not self.db_path.exists():
            raise FileNotFoundError("Banco de dados não encontrado")

        # Criar checkpoint do SQLite para garantir que todos os dados estejam no arquivo
        db = SessionLocal()
        try:
            db.execute(text("PRAGMA wal_checkpoint(FULL)"))
            db.commit()
        except Exception:
            # Se não estiver em modo WAL, ignora o erro
            pass
        finally:
            db.close()

        # Ler o arquivo do banco de dados
        with open(self.db_path, 'rb') as f:
            db_content = f.read()

        # Gerar nome do arquivo com timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"orcamento_backup_{timestamp}.db"

        return db_content, filename

    def import_database(self, file_content: bytes, create_backup: bool = True) -> dict:
        """
        Importa um banco de dados a partir de um arquivo

        Args:
            file_content: Conteúdo do arquivo .db
            create_backup: Se True, cria backup do banco atual antes de importar

        Returns:
            dict: Informações sobre a operação
        """
        # Validar que é um arquivo SQLite válido
        if not file_content.startswith(b'SQLite format 3'):
            raise ValueError("Arquivo inválido. Deve ser um arquivo SQLite válido.")

        result = {
            "backup_created": False,
            "backup_path": None,
            "imported_at": datetime.now().isoformat()
        }

        # Criar backup do banco atual se solicitado e se existir
        if create_backup and self.db_path.exists():
            backup_dir = self.db_path.parent / "backups"
            backup_dir.mkdir(exist_ok=True)

            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_path = backup_dir / f"backup_before_import_{timestamp}.db"

            shutil.copy2(self.db_path, backup_path)
            result["backup_created"] = True
            result["backup_path"] = str(backup_path)

        # Fechar todas as conexões ativas
        engine.dispose()

        # Criar diretório se não existir
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

        # Escrever o novo banco de dados
        with open(self.db_path, 'wb') as f:
            f.write(file_content)

        # Verificar integridade do banco importado
        db = SessionLocal()
        try:
            db.execute(text("PRAGMA integrity_check"))
            db.commit()
            result["integrity_check"] = "OK"
        except Exception as e:
            result["integrity_check"] = f"FAILED: {str(e)}"
            # Se falhou, restaurar o backup se existir
            if result["backup_created"]:
                shutil.copy2(result["backup_path"], self.db_path)
                raise RuntimeError(f"Falha na verificação de integridade. Backup restaurado. Erro: {str(e)}")
        finally:
            db.close()

        # Obter estatísticas do banco importado
        result["stats"] = self.get_database_stats()

        return result

    def get_database_stats(self) -> dict:
        """
        Obtém estatísticas do banco de dados atual

        Returns:
            dict: Estatísticas incluindo número de registros por tabela
        """
        if not self.db_path.exists():
            return {"error": "Banco de dados não encontrado"}

        db = SessionLocal()
        stats = {
            "file_size_mb": round(self.db_path.stat().st_size / (1024 * 1024), 2),
            "tables": {}
        }

        try:
            # Obter lista de tabelas
            result = db.execute(text(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            ))
            tables = [row[0] for row in result]

            # Contar registros em cada tabela
            for table in tables:
                count_result = db.execute(text(f"SELECT COUNT(*) FROM {table}"))
                count = count_result.scalar()
                stats["tables"][table] = count

            stats["total_records"] = sum(stats["tables"].values())

        except Exception as e:
            stats["error"] = str(e)
        finally:
            db.close()

        return stats

    def list_backups(self) -> list[dict]:
        """
        Lista todos os backups disponíveis

        Returns:
            list: Lista de backups com informações
        """
        backup_dir = self.db_path.parent / "backups"
        if not backup_dir.exists():
            return []

        backups = []
        for backup_file in backup_dir.glob("*.db"):
            stat = backup_file.stat()
            backups.append({
                "filename": backup_file.name,
                "path": str(backup_file),
                "size_mb": round(stat.st_size / (1024 * 1024), 2),
                "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat()
            })

        # Ordenar por data de criação (mais recente primeiro)
        backups.sort(key=lambda x: x["created_at"], reverse=True)

        return backups

    def restore_backup(self, backup_filename: str) -> dict:
        """
        Restaura um backup específico

        Args:
            backup_filename: Nome do arquivo de backup

        Returns:
            dict: Informações sobre a operação
        """
        backup_dir = self.db_path.parent / "backups"
        backup_path = backup_dir / backup_filename

        if not backup_path.exists():
            raise FileNotFoundError(f"Backup não encontrado: {backup_filename}")

        # Ler o arquivo de backup
        with open(backup_path, 'rb') as f:
            backup_content = f.read()

        # Importar usando o método de importação padrão
        result = self.import_database(backup_content, create_backup=True)
        result["restored_from"] = backup_filename

        return result

    def delete_backup(self, backup_filename: str) -> bool:
        """
        Deleta um backup específico

        Args:
            backup_filename: Nome do arquivo de backup

        Returns:
            bool: True se deletado com sucesso
        """
        backup_dir = self.db_path.parent / "backups"
        backup_path = backup_dir / backup_filename

        if not backup_path.exists():
            raise FileNotFoundError(f"Backup não encontrado: {backup_filename}")

        backup_path.unlink()
        return True
