"""
Script para criar pacote completo para distribuição Windows
Execute após build_windows.py
"""
import os
import shutil
import zipfile
from datetime import datetime

print("=" * 60)
print("  Criando Pacote para Distribuição Windows")
print("=" * 60)
print()

# Verificar se o executável existe (com ou sem extensão .exe)
exe_path = None
if os.path.exists('dist/OrcamentoFlores.exe'):
    exe_path = 'dist/OrcamentoFlores.exe'
elif os.path.exists('dist/OrcamentoFlores'):
    exe_path = 'dist/OrcamentoFlores'
else:
    print("❌ Executável não encontrado!")
    print("Execute 'python build_windows.py' primeiro.")
    exit(1)

# Criar pasta de pacote
package_dir = 'OrcamentoFlores_Windows'
if os.path.exists(package_dir):
    shutil.rmtree(package_dir)
os.makedirs(package_dir)

print("📦 Copiando arquivos...")

# Copiar executável (sempre salvar como .exe para Windows)
shutil.copy(exe_path, f'{package_dir}/OrcamentoFlores.exe')
print("   ✓ OrcamentoFlores.exe")

# Copiar arquivos .bat
shutil.copy('start_windows.bat', f'{package_dir}/start_windows.bat')
print("   ✓ start_windows.bat")

# Copiar README
shutil.copy('README_WINDOWS.txt', f'{package_dir}/README_WINDOWS.txt')
print("   ✓ README_WINDOWS.txt")

# Copiar pasta data
if os.path.exists('data'):
    shutil.copytree('data', f'{package_dir}/data')
    print("   ✓ data/")

# Copiar pastas app (templates e static)
if os.path.exists('app/templates'):
    os.makedirs(f'{package_dir}/app', exist_ok=True)
    shutil.copytree('app/templates', f'{package_dir}/app/templates')
    print("   ✓ app/templates/")

if os.path.exists('app/static'):
    shutil.copytree('app/static', f'{package_dir}/app/static')
    print("   ✓ app/static/")

print()
print("📦 Criando arquivo ZIP...")

# Criar nome do arquivo com data
date_str = datetime.now().strftime("%Y%m%d")
zip_name = f'OrcamentoFlores_Windows_{date_str}.zip'

# Criar ZIP
with zipfile.ZipFile(zip_name, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk(package_dir):
        for file in files:
            file_path = os.path.join(root, file)
            arcname = os.path.relpath(file_path, os.path.dirname(package_dir))
            zipf.write(file_path, arcname)
            print(f"   + {arcname}")

print()
print("=" * 60)
print("✅ Pacote criado com sucesso!")
print("=" * 60)
print()
print(f"📁 Arquivo: {zip_name}")
print(f"📦 Pasta: {package_dir}/")
print()
print("📋 Instruções para distribuição:")
print(f"   1. Envie o arquivo '{zip_name}' para o usuário")
print("   2. Instrua o usuário a:")
print("      - Extrair o ZIP")
print("      - Abrir a pasta extraída")
print("      - Clicar duas vezes em 'start_windows.bat'")
print("      - Abrir o navegador em http://localhost:8000")
print()
print("=" * 60)

