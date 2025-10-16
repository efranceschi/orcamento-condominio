# 📦 Sistema de Orçamento Flores - Pacote Windows

## ✅ Arquivos Criados com Sucesso!

### Arquivo para Distribuição
- **`OrcamentoFlores_Windows_20251013.zip`** (65 MB)
  - Este é o arquivo que você deve enviar para o usuário Windows

### Conteúdo do Pacote
```
OrcamentoFlores_Windows/
├── OrcamentoFlores.exe          (68 MB - Executável principal)
├── start_windows.bat            (Script de inicialização)
├── README_WINDOWS.txt           (Instruções para o usuário)
├── app/
│   ├── templates/               (HTML templates)
│   └── static/                  (CSS e JavaScript)
└── data/
    └── condominio_orcamento.db  (Banco de dados)
```

---

## 📋 Como Distribuir

### 1. Envie o Arquivo ZIP
- Envie o arquivo **`OrcamentoFlores_Windows_20251013.zip`** para o usuário
- Pode usar: email, Google Drive, Dropbox, WeTransfer, etc.

### 2. Instrua o Usuário

**PASSO 1: Extrair**
- Clique com botão direito no arquivo ZIP
- Escolha "Extrair aqui" ou "Extrair para OrcamentoFlores_Windows"

**PASSO 2: Executar**
- Abra a pasta extraída
- Clique duas vezes em: **`start_windows.bat`**
- Uma janela preta aparecerá (não feche!)

**PASSO 3: Acessar**
- Abra o navegador (Chrome, Edge, Firefox)
- Digite: **`http://localhost:8000`**
- Pronto! O sistema está rodando

**PASSO 4: Encerrar**
- Para fechar o sistema, feche a janela preta

---

## ⚠️ Solução de Problemas

### Problema: Windows Defender bloqueia o executável
**Solução:**
1. Clique em "Mais informações"
2. Clique em "Executar assim mesmo"
3. Ou: Clique com botão direito → "Executar como administrador"

### Problema: "Porta 8000 já está em uso"
**Solução:**
- Reinicie o computador
- Ou: Feche outros programas que possam estar usando a porta

### Problema: Antivírus bloqueia
**Solução:**
- Adicione o arquivo na lista de exceções do antivírus
- Ou: Desative temporariamente o antivírus para a primeira execução

---

## 🔄 Como Atualizar

### Para criar uma nova versão:

```bash
# 1. Ative o ambiente virtual
source venv/bin/activate  # macOS/Linux
# ou
venv\Scripts\activate     # Windows

# 2. Execute o build
python build_windows.py

# 3. Crie o pacote
python create_package.py

# 4. Distribua o novo ZIP gerado
```

---

## 📊 Informações Técnicas

### Tamanho dos Arquivos
- **Executável:** ~68 MB
- **Pacote ZIP:** ~65 MB (compactado)
- **Pasta extraída:** ~66 MB

### Requisitos do Sistema
- Windows 10 ou superior
- 4 GB de RAM (mínimo)
- 500 MB de espaço em disco
- Navegador web moderno

### Tecnologias Incluídas
- Python 3.13 (embedded)
- FastAPI + Uvicorn
- SQLAlchemy + SQLite
- Pandas + NumPy
- Openpyxl
- Jinja2

### O que está incluído no executável?
- ✅ Interpretador Python
- ✅ Todas as bibliotecas necessárias
- ✅ Servidor web (Uvicorn)
- ✅ Banco de dados SQLite
- ✅ Templates HTML
- ✅ Arquivos estáticos (CSS/JS)

**O usuário NÃO precisa:**
- ❌ Instalar Python
- ❌ Instalar bibliotecas
- ❌ Configurar ambiente virtual
- ❌ Executar comandos no terminal

---

## 📱 Acesso na Rede Local

Para acessar de outros computadores na mesma rede:

### 1. Descobrir o IP do servidor
```bash
ipconfig  # Windows
ifconfig  # macOS/Linux
```

### 2. Modificar o main.py
```python
# Trocar:
uvicorn.run(app, host="localhost", port=8000)

# Por:
uvicorn.run(app, host="0.0.0.0", port=8000)
```

### 3. Acessar de outros dispositivos
```
http://IP_DO_SERVIDOR:8000
# Exemplo: http://192.168.1.100:8000
```

### 4. Recompilar
```bash
python build_windows.py
python create_package.py
```

---

## 🔐 Segurança

### Dados do Usuário
- Todos os dados ficam no arquivo: `data/condominio_orcamento.db`
- Para fazer backup: copie este arquivo
- Para restaurar: substitua o arquivo

### Firewall do Windows
- O Windows pode pedir permissão para executar
- Clique em "Permitir acesso"

---

## 📞 Suporte

**Desenvolvedor:** Eduardo Franceschi
**Email:** eduardo.franceschi@email.com

**Arquivos de Suporte:**
- `build_windows.py` - Script de build
- `create_package.py` - Script de empacotamento
- `start_windows.bat` - Inicializador Windows
- `README_WINDOWS.txt` - Instruções para usuário final

---

## 🎯 Checklist de Distribuição

- [x] Executável criado com PyInstaller
- [x] Pacote ZIP completo gerado
- [x] README incluído para usuário final
- [x] Script .bat de inicialização
- [x] Templates e static files incluídos
- [x] Banco de dados incluído
- [ ] Testado em máquina Windows
- [ ] Documentação de usuário criada
- [ ] Vídeo tutorial gravado (opcional)

---

**Data de Build:** 13/10/2025
**Versão:** 1.0
**Plataforma:** Windows 10/11
**Arquitetura:** Executável universalmente compatível

