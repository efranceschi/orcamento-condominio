"""
API endpoints para backup e restauração do banco de dados
"""
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import Response, JSONResponse
from typing import List
from app.services.database_backup import DatabaseBackupService

router = APIRouter(prefix="/api/backup", tags=["Backup"])

backup_service = DatabaseBackupService()


@router.get("/export")
async def export_database():
    """
    Exporta o banco de dados completo como arquivo .db

    Retorna:
        Arquivo SQLite com todos os dados do sistema
    """
    try:
        db_content, filename = backup_service.export_database()

        return Response(
            content=db_content,
            media_type="application/x-sqlite3",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"'
            }
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao exportar banco de dados: {str(e)}")


@router.post("/import")
async def import_database(
    file: UploadFile = File(...),
    create_backup: bool = True
):
    """
    Importa um banco de dados a partir de um arquivo .db

    Args:
        file: Arquivo SQLite (.db)
        create_backup: Se True, cria backup do banco atual antes de importar

    Retorna:
        Informações sobre a operação de importação
    """
    # Validar extensão do arquivo
    if not file.filename.endswith('.db'):
        raise HTTPException(
            status_code=400,
            detail="Arquivo deve ter extensão .db"
        )

    try:
        # Ler conteúdo do arquivo
        content = await file.read()

        # Importar banco de dados
        result = backup_service.import_database(content, create_backup=create_backup)

        return JSONResponse(content={
            "success": True,
            "message": "Banco de dados importado com sucesso",
            "details": result
        })

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao importar banco de dados: {str(e)}"
        )


@router.get("/stats")
async def get_database_stats():
    """
    Obtém estatísticas do banco de dados atual

    Retorna:
        Estatísticas incluindo tamanho e número de registros por tabela
    """
    try:
        stats = backup_service.get_database_stats()
        return JSONResponse(content=stats)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao obter estatísticas: {str(e)}"
        )


@router.get("/list")
async def list_backups():
    """
    Lista todos os backups disponíveis

    Retorna:
        Lista de backups com informações (nome, tamanho, data)
    """
    try:
        backups = backup_service.list_backups()
        return JSONResponse(content={
            "backups": backups,
            "count": len(backups)
        })
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao listar backups: {str(e)}"
        )


@router.post("/restore/{backup_filename}")
async def restore_backup(backup_filename: str):
    """
    Restaura um backup específico

    Args:
        backup_filename: Nome do arquivo de backup

    Retorna:
        Informações sobre a operação de restauração
    """
    try:
        result = backup_service.restore_backup(backup_filename)

        return JSONResponse(content={
            "success": True,
            "message": "Backup restaurado com sucesso",
            "details": result
        })

    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao restaurar backup: {str(e)}"
        )


@router.delete("/delete/{backup_filename}")
async def delete_backup(backup_filename: str):
    """
    Deleta um backup específico

    Args:
        backup_filename: Nome do arquivo de backup

    Retorna:
        Confirmação da deleção
    """
    try:
        backup_service.delete_backup(backup_filename)

        return JSONResponse(content={
            "success": True,
            "message": f"Backup '{backup_filename}' deletado com sucesso"
        })

    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao deletar backup: {str(e)}"
        )
