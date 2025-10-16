"""
Script para criar executável Windows do Sistema de Orçamento Flores
Execute: python build_windows.py
"""
import os
import sys
import shutil

print("=" * 60)
print("  Sistema de Orçamento Flores - Build Windows")
print("=" * 60)
print()

# Verificar se PyInstaller está instalado
try:
    import PyInstaller.__main__
except ImportError:
    print("❌ PyInstaller não encontrado!")
    print("Instalando PyInstaller...")
    os.system(f"{sys.executable} -m pip install pyinstaller")
    import PyInstaller.__main__

# Limpar builds anteriores
print("🧹 Limpando builds anteriores...")
if os.path.exists('dist'):
    shutil.rmtree('dist')
    print("   - Removido: dist/")
if os.path.exists('build'):
    shutil.rmtree('build')
    print("   - Removido: build/")
if os.path.exists('OrcamentoFlores.spec'):
    os.remove('OrcamentoFlores.spec')
    print("   - Removido: OrcamentoFlores.spec")

print()
print("📦 Criando executável...")
print("   Isso pode demorar alguns minutos...")
print()

# Configurar PyInstaller
PyInstaller.__main__.run([
    'main.py',
    '--name=OrcamentoFlores',
    '--onefile',
    '--console',  # Manter console para ver logs
    '--add-data=app/templates:app/templates',
    '--add-data=app/static:app/static',
    '--add-data=data:data',
    '--hidden-import=uvicorn.logging',
    '--hidden-import=uvicorn.loops',
    '--hidden-import=uvicorn.loops.auto',
    '--hidden-import=uvicorn.protocols',
    '--hidden-import=uvicorn.protocols.http',
    '--hidden-import=uvicorn.protocols.http.auto',
    '--hidden-import=uvicorn.protocols.websockets',
    '--hidden-import=uvicorn.protocols.websockets.auto',
    '--hidden-import=uvicorn.lifespan',
    '--hidden-import=uvicorn.lifespan.on',
    '--collect-all=fastapi',
    '--collect-all=starlette',
    '--collect-all=pydantic',
    '--collect-all=sqlalchemy',
    '--collect-all=pandas',
    '--collect-all=openpyxl',
    '--collect-all=jinja2',
    '--collect-all=numpy',
    '--noconfirm',
])

print()
print("=" * 60)
print("✅ Executável criado com sucesso!")
print("=" * 60)
print()
print("📁 Localização: dist/OrcamentoFlores.exe")
print()
print("📋 Próximos passos:")
print("   1. Copie a pasta 'dist' para o Windows")
print("   2. Execute 'start_windows.bat' dentro da pasta 'dist'")
print("   3. Abra o navegador em: http://localhost:8000")
print()
print("💡 Dica: Execute 'create_package.py' para criar um pacote completo")
print("=" * 60)

