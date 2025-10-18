# Guia de Deployment com Docker

## Visão Geral

Este projeto está configurado para ser executado em container Docker com Nginx como proxy reverso e Supervisor para gerenciar os processos.

## Arquitetura

- **FastAPI/Uvicorn**: Aplicação backend na porta 8000 (interna)
- **Nginx**: Proxy reverso na porta 80 (exposta)
- **Supervisor**: Gerenciador de processos para Uvicorn e Nginx
- **SQLite**: Banco de dados persistido em volume Docker

## Comandos Rápidos

### Build e Start
```bash
# Build da imagem
docker-compose build

# Iniciar aplicação
docker-compose up -d

# Ver logs
docker-compose logs -f

# Parar aplicação
docker-compose down
```

### Acessar a Aplicação
- **Interface Web**: http://localhost:8080
- **API Docs**: http://localhost:8080/api/docs
- **Health Check**: http://localhost:8080/health

## Estrutura de Arquivos

```
.
├── Dockerfile                  # Imagem Docker simplificada
├── docker-compose.yml          # Orquestração de serviços
└── docker/
    ├── entrypoint.sh          # Script de inicialização
    ├── nginx.conf             # Configuração do Nginx
    └── supervisord.conf       # Configuração do Supervisor
```

## Persistência de Dados

O banco de dados é persistido em um volume Docker gerenciado:

```yaml
volumes:
  orcamento-data:/app/data
```

Para fazer backup do banco:
```bash
# Listar volumes
docker volume ls

# Inspecionar volume
docker volume inspect orcamento_orcamento-data

# Backup
docker run --rm -v orcamento_orcamento-data:/data -v $(pwd):/backup ubuntu tar czf /backup/backup.tar.gz /data
```

## Logs

Os logs são salvos em:
- `/var/log/uvicorn/` - Logs da aplicação FastAPI
- `/var/log/nginx/` - Logs do Nginx
- `/var/log/supervisor/` - Logs do Supervisor

Para acessar logs localmente, eles também são mapeados para:
```
./logs/uvicorn/
./logs/nginx/
./logs/supervisor/
```

## Resolução de Problemas

### Container não inicia
```bash
# Ver logs detalhados
docker-compose logs

# Verificar status dos serviços
docker-compose ps
```

### Problema com banco de dados
```bash
# Remover volume e recriar
docker-compose down -v
docker-compose up -d
```

### Entrar no container para debug
```bash
docker-compose exec app /bin/bash
```

## Inicialização Automática do Banco

O banco de dados é inicializado automaticamente quando a aplicação inicia pela primeira vez:

1. O FastAPI verifica se o arquivo `data/condominio_orcamento.db` existe
2. Se não existir, cria as tabelas automaticamente
3. Migrations adicionais são executadas pelo `entrypoint.sh`

## Configurações Importantes

### Variáveis de Ambiente (docker-compose.yml)
```yaml
environment:
  - PYTHONUNBUFFERED=1
  - DATABASE_URL=sqlite:///./data/condominio_orcamento.db
```

### Health Check
O container possui health check configurado que verifica:
- Se o Nginx está respondendo
- Se a aplicação FastAPI está saudável
- Conectividade com o banco de dados

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

## Melhores Práticas Implementadas

1. **Single-stage build**: Dockerfile simplificado sem multi-stage desnecessário
2. **Processo único de supervisão**: Supervisor gerencia Nginx e Uvicorn
3. **Logs estruturados**: Rotação automática de logs configurada
4. **Health checks**: Monitoramento automático da saúde do container
5. **Volumes gerenciados**: Dados persistidos com volumes Docker
6. **Entrypoint script**: Inicialização limpa e migrations automáticas
7. **Security headers**: Headers de segurança configurados no Nginx
8. **Graceful shutdown**: Timeouts configurados para desligamento adequado

## Alterações da Versão Anterior

### Problemas Corrigidos
- ✅ Corrigido erro "exit status 127" do uvicorn
- ✅ Removido uso incorreto de `/root/.local/bin/uvicorn`
- ✅ Simplificado multi-stage build desnecessário
- ✅ Removido usuário `www-data` conflitante
- ✅ Melhorada gestão de permissões

### Melhorias
- ✅ Dockerfile mais simples e manutenível
- ✅ Script de entrypoint único e claro
- ✅ Inicialização automática do banco via FastAPI
- ✅ Melhor estrutura de logs
- ✅ Documentação completa
