"""
Main FastAPI application
Sistema de Gerenciamento Orçamentário para Condomínios
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime
import logging
import time
import traceback
import sys
import os
from pathlib import Path

from app.database import init_db, get_db
from app.api import budget_router, analysis_router, parameters_router, auth_router, users_router
from app.api.items import router as items_router
from app.api.backup import router as backup_router

# Detectar modo debug e access log
DEBUG_MODE = os.getenv("DEBUG", "false").lower() in ("true", "1", "yes")
ACCESS_LOG_MODE = os.getenv("ACCESS_LOG", "false").lower() in ("true", "1", "yes")

# Ler versão da aplicação
def get_app_version():
    """Obtém a versão da aplicação"""
    # Tentar ler de variável de ambiente primeiro (Docker)
    version = os.getenv("APP_VERSION")
    if version:
        return version
    
    # Tentar ler do arquivo VERSION
    version_file = Path(__file__).parent / "VERSION"
    if version_file.exists():
        return version_file.read_text().strip()
    
    # Fallback para versão de desenvolvimento
    return "dev"

APP_VERSION = get_app_version()

# Print direto para stdout para garantir que aparece
if DEBUG_MODE or ACCESS_LOG_MODE:
    print(f"\n{'='*80}")
    print(f"🔧 Configuração de Logging")
    print(f"{'='*80}")
    if DEBUG_MODE:
        print(f"Modo: DEBUG (logs verbosos)")
    elif ACCESS_LOG_MODE:
        print(f"Modo: ACCESS LOG (logs de acesso simplificados)")
    else:
        print(f"Modo: NORMAL")
    print(f"{'='*80}\n")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan event handler - initialize database on startup
    """
    import os
    from pathlib import Path
    from alembic.config import Config
    from alembic import command

    # Verificar se o arquivo de banco de dados existe
    db_path = Path("data/condominio_orcamento.db")

    if not db_path.exists():
        print("🔍 Banco de dados não encontrado. Inicializando...")
        # Criar diretório se não existir
        db_path.parent.mkdir(parents=True, exist_ok=True)
        # Inicializar banco de dados
        init_db()
        print("✓ Banco de dados inicializado com sucesso")
    else:
        print("✓ Banco de dados já existe")

    # Aplicar migrations automaticamente
    try:
        print("🔄 Verificando migrations...")
        alembic_cfg = Config("alembic.ini")
        command.upgrade(alembic_cfg, "head")
        print("✓ Migrations aplicadas com sucesso")
    except Exception as e:
        print(f"⚠️  Aviso: Erro ao aplicar migrations: {e}")
        # Não falhar o startup se migrations falharem
        pass

    yield
    # Cleanup (if needed) would go here


# Initialize FastAPI app
app = FastAPI(
    title="Sistema de Gerenciamento Orçamentário",
    description="Sistema completo para gestão e análise de orçamentos condominiais",
    version=APP_VERSION.lstrip('v'),  # Remove 'v' do início se existir
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan
)

# Configure logging
log_level = logging.DEBUG if DEBUG_MODE else logging.INFO

# Remover handlers existentes para evitar duplicação
for handler in logging.root.handlers[:]:
    logging.root.removeHandler(handler)

# Configurar logging básico
logging.basicConfig(
    level=log_level,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    force=True,
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)
logger.setLevel(log_level)

# Configurar nível de log para uvicorn também
logging.getLogger("uvicorn").setLevel(log_level)
logging.getLogger("uvicorn.access").setLevel(log_level)
logging.getLogger("uvicorn.error").setLevel(log_level)

# Log do modo de operação
if DEBUG_MODE:
    print("🐛 MODO DEBUG ATIVADO - Logs detalhados habilitados\n")
    logger.debug("🐛 Logger configurado em modo DEBUG")
elif ACCESS_LOG_MODE:
    print("📝 MODO ACCESS LOG ATIVADO - Logs de acesso simplificados\n")
    logger.info("📝 Logger configurado para access log")
else:
    print("✓ Aplicação iniciada em modo normal\n")
    logger.info("✓ Logger configurado em modo INFO")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Exception handlers
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """
    Handler para HTTPException - loga detalhes do erro
    """
    logger.warning(
        f"❌ HTTP Exception: {exc.status_code} - {exc.detail}\n"
        f"   Path: {request.method} {request.url.path}\n"
        f"   Client: {request.client.host if request.client else 'unknown'}"
    )
    
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """
    Handler para erros de validação - loga detalhes
    """
    logger.error(
        f"❌ Validation Error:\n"
        f"   Path: {request.method} {request.url.path}\n"
        f"   Errors: {exc.errors()}"
    )
    
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()}
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """
    Handler para exceções não tratadas - loga stack trace completo
    """
    # Capturar stack trace completo
    exc_type, exc_value, exc_traceback = sys.exc_info()
    tb_lines = traceback.format_exception(exc_type, exc_value, exc_traceback)
    tb_text = ''.join(tb_lines)
    
    logger.error(
        f"💥 ERRO NÃO TRATADO:\n"
        f"   Path: {request.method} {request.url.path}\n"
        f"   Exception: {type(exc).__name__}: {str(exc)}\n"
        f"   Stack Trace:\n{tb_text}"
    )
    
    return JSONResponse(
        status_code=500,
        content={"detail": "Erro interno do servidor"}
    )


# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """
    Middleware para registrar todas as requisições HTTP
    """
    start_time = time.time()
    
    # Log da requisição com mais detalhes
    auth_header = request.headers.get("authorization", "None")
    has_token = "Bearer" in auth_header if auth_header != "None" else False
    
    # Em modo debug, mostrar informações detalhadas da requisição
    if DEBUG_MODE:
        # Montar URL completa com query params
        full_url = str(request.url)
        query_params = dict(request.query_params) if request.query_params else {}
        client_info = f"{request.client.host}:{request.client.port}" if request.client else "unknown"
        user_agent = request.headers.get("user-agent", "unknown")
        
        log_msg = (
            f"\n{'='*80}\n"
            f"📥 REQUISIÇÃO RECEBIDA\n"
            f"   Método: {request.method}\n"
            f"   URL: {full_url}\n"
            f"   Path: {request.url.path}\n"
            f"   Query Params: {query_params or 'Nenhum'}\n"
            f"   Cliente: {client_info}\n"
            f"   User-Agent: {user_agent}\n"
            f"   Autenticado: {'Sim' if has_token else 'Não'}\n"
            f"{'='*80}"
        )
        
        # Usar tanto logger quanto print para garantir que aparece
        logger.debug(log_msg)
        print(log_msg, flush=True)
    elif ACCESS_LOG_MODE:
        # Modo access log: logs simples e limpos
        log_msg = f"→ {request.method} {request.url.path} [Auth: {'Yes' if has_token else 'No'}]"
        logger.info(log_msg)
        print(log_msg, flush=True)
    
    try:
        # Processar requisição
        response = await call_next(request)
        
        # Calcular tempo de processamento
        process_time = (time.time() - start_time) * 1000
        
        # Log da resposta (com cor baseada no status)
        status_icon = "✓" if response.status_code < 400 else "✗"
        log_level = logging.INFO if response.status_code < 400 else logging.WARNING
        
        # Log da resposta baseado no modo
        if DEBUG_MODE:
            # Modo debug: informações detalhadas da resposta
            status_desc = ""
            if response.status_code < 300:
                status_desc = "Sucesso"
            elif response.status_code < 400:
                status_desc = "Redirecionamento"
            elif response.status_code < 500:
                status_desc = "Erro do Cliente"
            else:
                status_desc = "Erro do Servidor"
            
            log_msg = (
                f"\n{'='*80}\n"
                f"📤 RESPOSTA ENVIADA\n"
                f"   Método: {request.method}\n"
                f"   URL: {request.url.path}\n"
                f"   Status HTTP: {response.status_code} ({status_desc})\n"
                f"   Tempo de Processamento: {process_time:.2f}ms\n"
                f"   {status_icon} {'Requisição bem-sucedida' if response.status_code < 400 else 'Requisição com erro'}\n"
                f"{'='*80}\n"
            )
            
            # Usar tanto logger quanto print para garantir que aparece
            logger.debug(log_msg)
            print(log_msg, flush=True)
        elif ACCESS_LOG_MODE:
            # Modo access log: logs simples e limpos
            log_msg = (
                f"{status_icon} {request.method} {request.url.path} "
                f"- Status: {response.status_code} "
                f"- Tempo: {process_time:.2f}ms"
            )
            logger.log(log_level, log_msg)
            print(log_msg, flush=True)
        
        # Adicionar header com tempo de processamento
        response.headers["X-Process-Time"] = f"{process_time:.2f}ms"
        
        return response
        
    except Exception as exc:
        # Log de exceção no middleware
        process_time = (time.time() - start_time) * 1000
        logger.error(
            f"💥 Exception no middleware:\n"
            f"   Path: {request.method} {request.url.path}\n"
            f"   Tempo até erro: {process_time:.2f}ms\n"
            f"   Exception: {type(exc).__name__}: {str(exc)}"
        )
        raise

# Mount static files and templates
app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

# Adicionar versão ao contexto global dos templates
templates.env.globals['APP_VERSION'] = APP_VERSION

# Include API routers
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(budget_router)
app.include_router(analysis_router)
app.include_router(items_router)
app.include_router(parameters_router)
app.include_router(backup_router)


@app.get("/health")
async def health_check(db: Session = Depends(get_db)):
    """
    Endpoint de health check para monitoramento da aplicação
    
    Verifica:
    - Status geral da aplicação
    - Conectividade com o banco de dados
    
    Retorna:
    - 200 OK: Aplicação saudável
    - 503 Service Unavailable: Aplicação com problemas
    """
    health_status = {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "1.0.0",
        "checks": {
            "database": "unknown"
        }
    }
    
    # Verificar conexão com banco de dados
    try:
        # Tentar executar uma query simples
        db.execute(text("SELECT 1"))
        health_status["checks"]["database"] = "healthy"
    except Exception as e:
        health_status["status"] = "unhealthy"
        health_status["checks"]["database"] = f"unhealthy: {str(e)}"
        return JSONResponse(
            status_code=503,
            content=health_status
        )
    
    return JSONResponse(
        status_code=200,
        content=health_status
    )


@app.get("/")
async def home():
    """
    Redireciona para página de orçamentos
    """
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/scenarios", status_code=302)


@app.get("/scenarios", response_class=HTMLResponse)
async def scenarios_page(request: Request):
    """
    Página de gerenciamento de cenários
    """
    return templates.TemplateResponse("scenarios.html", {"request": request})


# Rotas removidas: Simulações, Comparações e Análise de Risco
# (funcionalidades descontinuadas)


@app.get("/edit-scenario", response_class=HTMLResponse)
async def edit_scenario_page(request: Request):
    """
    Página de edição de cenário (itens e valores)
    """
    return templates.TemplateResponse("edit_scenario.html", {"request": request})


@app.get("/parameters", response_class=HTMLResponse)
async def parameters_page(request: Request):
    """
    Página de parâmetros do sistema
    """
    return templates.TemplateResponse("parameters.html", {"request": request})


@app.get("/categories", response_class=HTMLResponse)
async def categories_page(request: Request):
    """
    Página de gerenciamento de categorias
    """
    return templates.TemplateResponse("categories.html", {"request": request})


@app.get("/scenarios/{scenario_id}/details", response_class=HTMLResponse)
async def scenario_details_page(request: Request, scenario_id: int):
    """
    Página de relatório completo do orçamento
    """
    return templates.TemplateResponse("scenario_details.html", {
        "request": request,
        "scenario_id": scenario_id
    })


@app.get("/scenarios/{scenario_id}/summary", response_class=HTMLResponse)
async def scenario_summary_page(request: Request, scenario_id: int):
    """
    Página de relatório resumido do orçamento
    """
    return templates.TemplateResponse("scenario_summary.html", {
        "request": request,
        "scenario_id": scenario_id
    })


@app.get("/scenarios/{scenario_id}/analysis", response_class=HTMLResponse)
async def scenario_analysis_page(request: Request, scenario_id: int):
    """
    Página de análise do orçamento
    """
    return templates.TemplateResponse("analysis.html", {
        "request": request,
        "scenario_id": scenario_id
    })


@app.get("/scenarios/{scenario_id}/edit-interactive", response_class=HTMLResponse)
async def edit_budget_interactive_page(request: Request, scenario_id: int):
    """
    Página de edição interativa de valores do orçamento
    """
    return templates.TemplateResponse("edit_budget_interactive.html", {
        "request": request,
        "scenario_id": scenario_id
    })


@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    """
    Página de login
    """
    return templates.TemplateResponse("login.html", {"request": request})


@app.get("/users", response_class=HTMLResponse)
async def users_management_page(request: Request):
    """
    Página de gerenciamento de usuários (apenas admin)
    """
    return templates.TemplateResponse("users.html", {"request": request})


@app.get("/backup", response_class=HTMLResponse)
async def backup_page(request: Request):
    """
    Página de backup e restauração do banco de dados
    """
    return templates.TemplateResponse("backup.html", {"request": request})


if __name__ == "__main__":
    import uvicorn
    
    # Configurar nível de log do uvicorn baseado no modo debug
    uvicorn_log_level = "debug" if DEBUG_MODE else "info"
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level=uvicorn_log_level,
        access_log=True  # Garantir que access log está habilitado
    )

