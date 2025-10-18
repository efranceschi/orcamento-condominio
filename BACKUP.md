# Guia de Backup e Restauração

Este documento descreve como fazer backup e restaurar o banco de dados SQLite do sistema de orçamentos.

## Visão Geral

O sistema oferece três formas de gerenciar backups:

1. **Interface Web** - Interface gráfica amigável (recomendado para usuários)
2. **API REST** - Endpoints HTTP para integração
3. **Script CLI** - Linha de comando para automação

## 1. Interface Web

### Acessar

Navegue para: `http://localhost:8000/backup`

### Funcionalidades

#### Exportar Banco de Dados
1. Clique em "Exportar Banco de Dados"
2. O arquivo `.db` será baixado automaticamente
3. Nome do arquivo: `orcamento_backup_YYYYMMDD_HHMMSS.db`

#### Importar Banco de Dados
1. Clique em "Selecione o arquivo .db"
2. Escolha o arquivo `.db` que deseja importar
3. Marque/desmarque "Criar backup automático"
4. Clique em "Importar Banco de Dados"
5. Confirme a operação

**⚠️ ATENÇÃO**: Importar um banco substitui TODOS os dados atuais!

#### Gerenciar Backups
- Visualize todos os backups automáticos criados
- Restaure um backup específico
- Exclua backups antigos

## 2. Script CLI

### Localização

```bash
scripts/backup_cli.py
```

### Comandos Disponíveis

#### Exportar Banco de Dados

```bash
# Exportar com nome automático
python scripts/backup_cli.py export

# Exportar com nome específico
python scripts/backup_cli.py export --output meu_backup.db
```

**Saída**:
```
✅ Banco de dados exportado com sucesso!
📁 Arquivo: orcamento_backup_20250118_143022.db
📊 Tamanho: 2.45 MB
```

#### Importar Banco de Dados

```bash
# Importar com backup automático (padrão)
python scripts/backup_cli.py import arquivo.db

# Importar sem criar backup
python scripts/backup_cli.py import arquivo.db --no-backup

# Importar sem confirmação (útil para scripts)
python scripts/backup_cli.py import arquivo.db --yes
```

**Saída**:
```
⚠️  ATENÇÃO: Esta operação substituirá TODOS os dados atuais!
✅ Um backup automático será criado antes da importação

Deseja continuar? (sim/não): sim

✅ Banco de dados importado com sucesso!
📦 Backup criado: data/backups/backup_before_import_20250118_143100.db

📊 Estatísticas do banco importado:
   Tamanho: 2.45 MB
   Total de registros: 1523

📋 Registros por tabela:
   - budget_scenario: 3
   - budget_category: 45
   - budget_item: 234
   - budget_value: 1234
   - user: 7
```

#### Listar Backups Disponíveis

```bash
python scripts/backup_cli.py list
```

**Saída**:
```
📦 Backups disponíveis (5):

📁 backup_before_import_20250118_143100.db
   Tamanho: 2.45 MB
   Data: 18/10/2025 14:31:00

📁 backup_before_import_20250117_091500.db
   Tamanho: 2.31 MB
   Data: 17/10/2025 09:15:00
```

#### Restaurar Backup

```bash
# Restaurar com confirmação
python scripts/backup_cli.py restore backup_before_import_20250118_143100.db

# Restaurar sem confirmação
python scripts/backup_cli.py restore backup_before_import_20250118_143100.db --yes
```

#### Ver Estatísticas

```bash
python scripts/backup_cli.py stats
```

**Saída**:
```
📊 Estatísticas do Banco de Dados

💾 Tamanho: 2.45 MB
📝 Total de registros: 1523

📋 Registros por tabela:
   - budget_scenario: 3
   - budget_category: 45
   - budget_item: 234
   - budget_value: 1234
   - user: 7
```

## 3. API REST

### Endpoints Disponíveis

#### GET `/api/backup/export`
Exporta o banco de dados completo.

**Resposta**: Arquivo `.db` para download

**Exemplo com curl**:
```bash
curl -o backup.db http://localhost:8000/api/backup/export
```

#### POST `/api/backup/import`
Importa um banco de dados.

**Parâmetros**:
- `file` (form-data): Arquivo `.db`
- `create_backup` (query): `true`/`false` (padrão: `true`)

**Exemplo com curl**:
```bash
curl -X POST \
  -F "file=@backup.db" \
  "http://localhost:8000/api/backup/import?create_backup=true"
```

**Resposta**:
```json
{
  "success": true,
  "message": "Banco de dados importado com sucesso",
  "details": {
    "backup_created": true,
    "backup_path": "data/backups/backup_before_import_20250118_143100.db",
    "imported_at": "2025-10-18T14:31:00.123456",
    "integrity_check": "OK",
    "stats": {
      "file_size_mb": 2.45,
      "total_records": 1523,
      "tables": {
        "budget_scenario": 3,
        "budget_category": 45,
        "budget_item": 234,
        "budget_value": 1234,
        "user": 7
      }
    }
  }
}
```

#### GET `/api/backup/stats`
Obtém estatísticas do banco atual.

**Resposta**:
```json
{
  "file_size_mb": 2.45,
  "total_records": 1523,
  "tables": {
    "budget_scenario": 3,
    "budget_category": 45,
    "budget_item": 234,
    "budget_value": 1234,
    "user": 7
  }
}
```

#### GET `/api/backup/list`
Lista todos os backups disponíveis.

**Resposta**:
```json
{
  "backups": [
    {
      "filename": "backup_before_import_20250118_143100.db",
      "path": "data/backups/backup_before_import_20250118_143100.db",
      "size_mb": 2.45,
      "created_at": "2025-10-18T14:31:00.123456"
    }
  ],
  "count": 1
}
```

#### POST `/api/backup/restore/{backup_filename}`
Restaura um backup específico.

**Exemplo**:
```bash
curl -X POST http://localhost:8000/api/backup/restore/backup_before_import_20250118_143100.db
```

#### DELETE `/api/backup/delete/{backup_filename}`
Deleta um backup específico.

**Exemplo**:
```bash
curl -X DELETE http://localhost:8000/api/backup/delete/backup_before_import_20250118_143100.db
```

## Casos de Uso Comuns

### 1. Backup Regular (Automação)

Criar um script de backup diário:

```bash
#!/bin/bash
# backup_daily.sh

# Criar diretório de backups
mkdir -p ~/backups/orcamento

# Data atual
DATE=$(date +%Y%m%d)

# Exportar banco
python scripts/backup_cli.py export --output ~/backups/orcamento/backup_${DATE}.db

# Manter apenas últimos 7 backups
cd ~/backups/orcamento
ls -t backup_*.db | tail -n +8 | xargs rm -f

echo "Backup concluído: backup_${DATE}.db"
```

Adicionar ao crontab para executar diariamente às 2h da manhã:
```bash
0 2 * * * /path/to/backup_daily.sh
```

### 2. Transferir Dados Entre Instalações

**No servidor de origem**:
```bash
python scripts/backup_cli.py export --output dados_producao.db
```

**Copiar arquivo para servidor de destino**:
```bash
scp dados_producao.db usuario@servidor-destino:/tmp/
```

**No servidor de destino**:
```bash
python scripts/backup_cli.py import /tmp/dados_producao.db
```

### 3. Compartilhar Dados com Outro Usuário

1. Exportar o banco via interface web
2. Enviar arquivo `.db` para o usuário (email, drive, etc.)
3. Usuário importa via interface web ou CLI

### 4. Testar Mudanças com Segurança

Antes de fazer alterações significativas:

```bash
# Criar backup manual
python scripts/backup_cli.py export --output antes_alteracoes.db

# Fazer alterações no sistema...

# Se algo der errado, restaurar:
python scripts/backup_cli.py import antes_alteracoes.db --yes
```

## Localização dos Arquivos

### Banco de Dados Principal
```
data/condominio_orcamento.db
```

### Backups Automáticos
```
data/backups/
├── backup_before_import_20250118_143100.db
├── backup_before_import_20250117_091500.db
└── ...
```

## Segurança e Boas Práticas

### ✅ Recomendações

1. **Backup Regular**: Configure backups automáticos diários
2. **Armazenamento Externo**: Mantenha cópias em local separado
3. **Testar Restauração**: Periodicamente teste restaurar um backup
4. **Versionamento**: Mantenha múltiplas versões de backup
5. **Documentar**: Anote quando fez backups importantes

### ⚠️ Avisos

1. **Importação Destrutiva**: Importar substitui TODOS os dados
2. **Verificação**: Sempre verifique estatísticas após importar
3. **Backup Automático**: Mantenha a opção habilitada ao importar
4. **Integridade**: O sistema valida a integridade do banco após importação
5. **Permissões**: Certifique-se que tem permissão de escrita em `data/`

## Troubleshooting

### Erro: "Arquivo inválido. Deve ser um arquivo SQLite válido"

**Causa**: O arquivo não é um banco SQLite válido

**Solução**:
- Verifique se o arquivo não está corrompido
- Certifique-se que é um arquivo `.db` exportado do sistema

### Erro: "Falha na verificação de integridade"

**Causa**: O banco importado está corrompido

**Solução**:
- O sistema automaticamente restaura o backup anterior
- Tente exportar novamente do sistema de origem

### Erro: "Permission denied"

**Causa**: Sem permissão para escrever no diretório `data/`

**Solução**:
```bash
# Linux/Mac
chmod 755 data/
chmod 755 data/backups/

# Docker
docker-compose exec app chown -R www-data:www-data /app/data
```

### Backups não aparecem na lista

**Causa**: Arquivos não estão em `data/backups/`

**Solução**:
```bash
# Criar diretório se não existir
mkdir -p data/backups/

# Mover backups para o local correto
mv *.db data/backups/
```

## Formato do Arquivo

O arquivo de backup é um banco SQLite completo contendo:

- **Tabelas**: Todas as tabelas do sistema
- **Dados**: Todos os registros
- **Índices**: Estruturas de indexação
- **Schema**: Definições de tabelas e constraints

**Tamanho típico**: 1-5 MB (varia com quantidade de dados)

**Compatibilidade**: SQLite 3.x

## Documentação da API

Para documentação completa da API REST, acesse:
```
http://localhost:8000/api/docs
```

Procure pela tag "Backup" para ver todos os endpoints disponíveis com exemplos interativos.
