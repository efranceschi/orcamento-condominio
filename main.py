"""
Main FastAPI application
Sistema de Gerenciamento Orçamentário para Condomínios
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime

from app.database import init_db, get_db
from app.api import budget_router, analysis_router, parameters_router, auth_router, users_router
from app.api.items import router as items_router
from app.api.backup import router as backup_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan event handler - initialize database on startup
    """
    import os
    from pathlib import Path

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

    yield
    # Cleanup (if needed) would go here


# Initialize FastAPI app
app = FastAPI(
    title="Sistema de Gerenciamento Orçamentário",
    description="Sistema completo para gestão e análise de orçamentos condominiais",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files and templates
app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

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
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

