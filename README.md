# Calculadora Orçamentária

Sistema desktop para criação, ajuste e calibragem de orçamentos de condomínios residenciais. Permite gerenciar múltiplos cenários orçamentários, simular reajustes, comparar propostas, calcular taxas de manutenção por m² e gerar relatórios em PDF.

Funciona 100% offline, com banco de dados local. Opcionalmente, permite que outros usuários na mesma rede acessem via browser.

## Funcionalidades

- **Cenários orçamentários** — crie, copie do ano anterior e gerencie múltiplas propostas
- **Categorias hierárquicas** — organize despesas e receitas em árvore com subcategorias
- **Itens e valores** — orçado, realizado, ajuste percentual hierárquico, estimado
- **Simulação** — crie cenários alternativos com diferentes ajustes e margens de risco
- **Comparação** — compare dois cenários lado a lado com gráficos
- **Análise de viabilidade** — verifique se receitas cobrem despesas, simule taxas de manutenção por lote
- **Resumo visual** — gráficos de rosca, gauge, barras e tabelas com totais
- **PDF** — gere relatórios profissionais em A4 paisagem com sumário executivo
- **Backup** — exporte e importe dados em formato JSON aberto
- **Acesso via rede** — ative um servidor HTTP embutido para que outros acessem pelo browser

## Pré-requisitos

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) (instale com `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
- Dependências do sistema para Tauri v2:
  - **macOS:** `xcode-select --install`
  - **Linux:** `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libayatana-appindicator3-dev librsvg2-dev`
  - **Windows:** [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) + [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)

## Desenvolvimento

```bash
# Instalar dependências
npm install

# Iniciar em modo desenvolvimento (hot-reload)
./run.sh
```

O app abre uma janela nativa. O frontend também fica disponível em `http://localhost:1420` durante o desenvolvimento.

## Build de Produção

```bash
# Build para a plataforma atual
./build.sh

# Build por plataforma
./build.sh --mac        # macOS → .dmg, .app
./build.sh --linux      # Linux → .deb, .AppImage
./build.sh --windows    # Windows → .msi, .exe

# Build rápido sem otimizações
./build.sh --debug
```

Os artefatos são gerados em `src-tauri/target/release/bundle/`.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Runtime | Tauri v2 |
| Frontend | React 19 + TypeScript + Vite |
| UI | Shadcn/UI + Tailwind CSS v4 |
| Gráficos | Recharts |
| Backend | Rust |
| Banco de dados | SQLite (rusqlite) |
| PDF | printpdf |
| Servidor de rede | axum |

## Estrutura do Projeto

```
├── src/                    # Frontend React
│   ├── pages/              # 9 páginas da aplicação
│   ├── components/         # Componentes UI e layout
│   ├── lib/                # API wrapper e utilitários
│   └── types/              # TypeScript interfaces
├── src-tauri/              # Backend Rust
│   ├── src/commands/       # Tauri Commands (IPC)
│   ├── src/models/         # Structs de dados
│   ├── src/db/             # Schema e acesso ao SQLite
│   └── src/server.rs       # Servidor HTTP para acesso via rede
├── run.sh                  # Script de desenvolvimento
├── build.sh                # Script de build de produção
└── PRD.md                  # Documento de requisitos completo
```
