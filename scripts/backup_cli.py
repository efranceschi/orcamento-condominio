#!/usr/bin/env python3
"""
Script CLI para backup e restauração do banco de dados
Uso:
    python scripts/backup_cli.py export [--output arquivo.db]
    python scripts/backup_cli.py import <arquivo.db> [--no-backup]
    python scripts/backup_cli.py list
    python scripts/backup_cli.py restore <nome-backup>
    python scripts/backup_cli.py stats
"""
import sys
import argparse
from pathlib import Path
from datetime import datetime

# Adicionar o diretório raiz ao path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.database_backup import DatabaseBackupService


def export_command(args):
    """Exporta o banco de dados"""
    service = DatabaseBackupService()

    try:
        db_content, suggested_filename = service.export_database()

        # Usar nome sugerido ou o fornecido pelo usuário
        output_file = args.output if args.output else suggested_filename

        # Escrever arquivo
        with open(output_file, 'wb') as f:
            f.write(db_content)

        print(f"✅ Banco de dados exportado com sucesso!")
        print(f"📁 Arquivo: {output_file}")
        print(f"📊 Tamanho: {len(db_content) / (1024 * 1024):.2f} MB")

    except Exception as e:
        print(f"❌ Erro ao exportar: {e}")
        sys.exit(1)


def import_command(args):
    """Importa um banco de dados"""
    service = DatabaseBackupService()

    input_file = Path(args.file)

    if not input_file.exists():
        print(f"❌ Arquivo não encontrado: {input_file}")
        sys.exit(1)

    # Ler arquivo
    with open(input_file, 'rb') as f:
        db_content = f.read()

    # Confirmar operação
    if not args.yes:
        print(f"⚠️  ATENÇÃO: Esta operação substituirá TODOS os dados atuais!")
        if args.no_backup:
            print(f"⚠️  BACKUP NÃO SERÁ CRIADO (--no-backup especificado)")
        else:
            print(f"✅ Um backup automático será criado antes da importação")

        response = input("\nDeseja continuar? (sim/não): ")
        if response.lower() not in ['sim', 's', 'yes', 'y']:
            print("❌ Operação cancelada")
            sys.exit(0)

    try:
        create_backup = not args.no_backup
        result = service.import_database(db_content, create_backup=create_backup)

        print(f"\n✅ Banco de dados importado com sucesso!")

        if result["backup_created"]:
            print(f"📦 Backup criado: {result['backup_path']}")

        print(f"\n📊 Estatísticas do banco importado:")
        stats = result["stats"]
        print(f"   Tamanho: {stats['file_size_mb']} MB")
        print(f"   Total de registros: {stats['total_records']}")

        print(f"\n📋 Registros por tabela:")
        for table, count in stats['tables'].items():
            print(f"   - {table}: {count}")

    except Exception as e:
        print(f"❌ Erro ao importar: {e}")
        sys.exit(1)


def list_command(args):
    """Lista backups disponíveis"""
    service = DatabaseBackupService()

    try:
        backups = service.list_backups()

        if not backups:
            print("📦 Nenhum backup disponível")
            return

        print(f"📦 Backups disponíveis ({len(backups)}):\n")

        for backup in backups:
            created_date = datetime.fromisoformat(backup['created_at'])
            print(f"📁 {backup['filename']}")
            print(f"   Tamanho: {backup['size_mb']} MB")
            print(f"   Data: {created_date.strftime('%d/%m/%Y %H:%M:%S')}")
            print()

    except Exception as e:
        print(f"❌ Erro ao listar backups: {e}")
        sys.exit(1)


def restore_command(args):
    """Restaura um backup específico"""
    service = DatabaseBackupService()

    # Confirmar operação
    if not args.yes:
        print(f"⚠️  ATENÇÃO: Esta operação substituirá TODOS os dados atuais!")
        print(f"✅ Um backup automático será criado antes da restauração")
        print(f"📦 Backup a restaurar: {args.backup_name}")

        response = input("\nDeseja continuar? (sim/não): ")
        if response.lower() not in ['sim', 's', 'yes', 'y']:
            print("❌ Operação cancelada")
            sys.exit(0)

    try:
        result = service.restore_backup(args.backup_name)

        print(f"\n✅ Backup restaurado com sucesso!")
        print(f"📦 Backup original: {result['restored_from']}")

        if result["backup_created"]:
            print(f"📦 Backup do estado anterior: {result['backup_path']}")

        print(f"\n📊 Estatísticas do banco restaurado:")
        stats = result["stats"]
        print(f"   Tamanho: {stats['file_size_mb']} MB")
        print(f"   Total de registros: {stats['total_records']}")

    except FileNotFoundError as e:
        print(f"❌ {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Erro ao restaurar backup: {e}")
        sys.exit(1)


def stats_command(args):
    """Mostra estatísticas do banco atual"""
    service = DatabaseBackupService()

    try:
        stats = service.get_database_stats()

        if "error" in stats:
            print(f"❌ Erro: {stats['error']}")
            sys.exit(1)

        print("📊 Estatísticas do Banco de Dados\n")
        print(f"💾 Tamanho: {stats['file_size_mb']} MB")
        print(f"📝 Total de registros: {stats['total_records']}")

        print(f"\n📋 Registros por tabela:")
        for table, count in stats['tables'].items():
            print(f"   - {table}: {count}")

    except Exception as e:
        print(f"❌ Erro ao obter estatísticas: {e}")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description='Gerenciamento de backup do banco de dados',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Exemplos:
  # Exportar banco de dados
  python scripts/backup_cli.py export
  python scripts/backup_cli.py export --output meu_backup.db

  # Importar banco de dados
  python scripts/backup_cli.py import arquivo.db
  python scripts/backup_cli.py import arquivo.db --no-backup --yes

  # Listar backups
  python scripts/backup_cli.py list

  # Restaurar backup
  python scripts/backup_cli.py restore backup_20250118_120000.db

  # Ver estatísticas
  python scripts/backup_cli.py stats
        """
    )

    subparsers = parser.add_subparsers(dest='command', help='Comando a executar')
    subparsers.required = True

    # Export command
    export_parser = subparsers.add_parser('export', help='Exportar banco de dados')
    export_parser.add_argument(
        '--output', '-o',
        help='Nome do arquivo de saída (padrão: orcamento_backup_TIMESTAMP.db)'
    )
    export_parser.set_defaults(func=export_command)

    # Import command
    import_parser = subparsers.add_parser('import', help='Importar banco de dados')
    import_parser.add_argument('file', help='Arquivo .db para importar')
    import_parser.add_argument(
        '--no-backup',
        action='store_true',
        help='Não criar backup antes de importar'
    )
    import_parser.add_argument(
        '--yes', '-y',
        action='store_true',
        help='Confirmar automaticamente (sem prompt)'
    )
    import_parser.set_defaults(func=import_command)

    # List command
    list_parser = subparsers.add_parser('list', help='Listar backups disponíveis')
    list_parser.set_defaults(func=list_command)

    # Restore command
    restore_parser = subparsers.add_parser('restore', help='Restaurar um backup')
    restore_parser.add_argument('backup_name', help='Nome do arquivo de backup')
    restore_parser.add_argument(
        '--yes', '-y',
        action='store_true',
        help='Confirmar automaticamente (sem prompt)'
    )
    restore_parser.set_defaults(func=restore_command)

    # Stats command
    stats_parser = subparsers.add_parser('stats', help='Mostrar estatísticas do banco')
    stats_parser.set_defaults(func=stats_command)

    # Parse arguments
    args = parser.parse_args()

    # Execute command
    args.func(args)


if __name__ == "__main__":
    main()
