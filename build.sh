#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# build.sh — Build de produção do app para desktop
# ============================================================
#
# Uso:
#   ./build.sh              # Build para a plataforma atual
#   ./build.sh --mac        # Build para macOS (.dmg, .app)
#   ./build.sh --linux      # Build para Linux (.deb, .AppImage)
#   ./build.sh --windows    # Build para Windows (.msi, .exe)
#   ./build.sh --all        # Build para todas as plataformas
#   ./build.sh --debug      # Build sem otimizações (mais rápido)
#
# Cross-compilation:
#   Para buildar para outra plataforma, é necessário ter o
#   target Rust instalado e as ferramentas de cross-compilation.
#
#   macOS → Linux:   rustup target add x86_64-unknown-linux-gnu
#   macOS → Windows: rustup target add x86_64-pc-windows-msvc
#   Linux → Windows: rustup target add x86_64-pc-windows-gnu
#
#   Nota: Cross-compilation do Tauri tem limitações.
#   Para builds Windows/Linux a partir do macOS, recomenda-se
#   usar CI/CD (GitHub Actions) com runners nativos.
#
# ============================================================

cd "$(dirname "$0")"

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Detectar plataforma atual
detect_platform() {
    case "$(uname -s)" in
        Darwin*)  echo "mac" ;;
        Linux*)   echo "linux" ;;
        MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
        *)        echo "unknown" ;;
    esac
}

CURRENT_PLATFORM=$(detect_platform)
BUILD_TARGETS=()
DEBUG_MODE=false

# Processar argumentos
if [ $# -eq 0 ]; then
    BUILD_TARGETS+=("$CURRENT_PLATFORM")
else
    for arg in "$@"; do
        case "$arg" in
            --mac|--macos)    BUILD_TARGETS+=("mac") ;;
            --linux)          BUILD_TARGETS+=("linux") ;;
            --windows|--win)  BUILD_TARGETS+=("windows") ;;
            --all)            BUILD_TARGETS+=("mac" "linux" "windows") ;;
            --debug)          DEBUG_MODE=true ;;
            --help|-h)
                echo "Uso: ./build.sh [--mac] [--linux] [--windows] [--all] [--debug]"
                echo ""
                echo "Opções:"
                echo "  --mac       Build para macOS (.dmg, .app)"
                echo "  --linux     Build para Linux (.deb, .AppImage)"
                echo "  --windows   Build para Windows (.msi, .exe)"
                echo "  --all       Build para todas as plataformas"
                echo "  --debug     Build sem otimizações (mais rápido)"
                echo ""
                echo "Sem argumentos: build para a plataforma atual (${CURRENT_PLATFORM})"
                exit 0
                ;;
            *)
                echo -e "${RED}Argumento desconhecido: $arg${NC}"
                echo "Use --help para ver as opções."
                exit 1
                ;;
        esac
    done
fi

echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Calculadora Orçamentária — Build        ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""

# Verificar pré-requisitos
if ! command -v node &> /dev/null; then
    echo -e "${RED}Erro: Node.js não encontrado.${NC}"
    exit 1
fi

if ! command -v cargo &> /dev/null; then
    if [ -f "$HOME/.cargo/env" ]; then
        source "$HOME/.cargo/env"
    fi
fi
if ! command -v cargo &> /dev/null; then
    echo -e "${RED}Erro: Rust não encontrado.${NC}"
    exit 1
fi

echo -e "  Plataforma: ${CYAN}${CURRENT_PLATFORM}${NC}"
echo -e "  Node.js:    ${GREEN}$(node --version)${NC}"
echo -e "  Rust:       ${GREEN}$(rustc --version | cut -d' ' -f2)${NC}"
echo -e "  Targets:    ${YELLOW}${BUILD_TARGETS[*]}${NC}"
if $DEBUG_MODE; then
    echo -e "  Modo:       ${YELLOW}DEBUG (sem otimizações)${NC}"
else
    echo -e "  Modo:       ${GREEN}RELEASE (otimizado)${NC}"
fi
echo ""

# Instalar dependências npm se necessário
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Instalando dependências npm...${NC}"
    npm install
    echo ""
fi

# Função de build para uma plataforma
build_for_target() {
    local target="$1"
    local rust_target=""
    local extra_args=""

    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  Buildando para: ${target}${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    case "$target" in
        mac)
            if [ "$CURRENT_PLATFORM" != "mac" ]; then
                echo -e "${YELLOW}⚠  Cross-compilation para macOS não é suportada.${NC}"
                echo -e "${YELLOW}   Use um Mac ou CI/CD com runner macOS.${NC}"
                return 1
            fi
            # macOS nativo — sem target especial
            ;;
        linux)
            if [ "$CURRENT_PLATFORM" != "linux" ]; then
                rust_target="x86_64-unknown-linux-gnu"
                echo -e "${YELLOW}⚠  Cross-compilation para Linux.${NC}"
                echo -e "${YELLOW}   Verificando target ${rust_target}...${NC}"
                if ! rustup target list --installed | grep -q "$rust_target"; then
                    echo -e "${YELLOW}   Instalando target...${NC}"
                    rustup target add "$rust_target"
                fi
                extra_args="--target $rust_target"
            fi
            ;;
        windows)
            if [ "$CURRENT_PLATFORM" == "linux" ]; then
                rust_target="x86_64-pc-windows-gnu"
            elif [ "$CURRENT_PLATFORM" == "mac" ]; then
                rust_target="x86_64-pc-windows-msvc"
            fi
            if [ -n "$rust_target" ]; then
                echo -e "${YELLOW}⚠  Cross-compilation para Windows.${NC}"
                echo -e "${YELLOW}   Verificando target ${rust_target}...${NC}"
                if ! rustup target list --installed | grep -q "$rust_target"; then
                    echo -e "${YELLOW}   Instalando target...${NC}"
                    rustup target add "$rust_target"
                fi
                extra_args="--target $rust_target"
            fi
            ;;
        *)
            echo -e "${RED}Plataforma desconhecida: $target${NC}"
            return 1
            ;;
    esac

    # Montar comando de build
    local cmd="npm run tauri build"
    if $DEBUG_MODE; then
        cmd="$cmd -- --debug"
    fi
    if [ -n "$extra_args" ]; then
        if $DEBUG_MODE; then
            cmd="$cmd $extra_args"
        else
            cmd="$cmd -- $extra_args"
        fi
    fi

    echo -e "  Executando: ${YELLOW}${cmd}${NC}"
    echo ""

    local start_time
    start_time=$(date +%s)

    if eval "$cmd"; then
        local end_time
        end_time=$(date +%s)
        local duration=$((end_time - start_time))

        echo ""
        echo -e "${GREEN}✓ Build para ${target} concluído em ${duration}s${NC}"

        # Listar artefatos gerados
        echo ""
        echo -e "${GREEN}Artefatos:${NC}"
        local bundle_dir="src-tauri/target"
        if [ -n "$rust_target" ]; then
            bundle_dir="$bundle_dir/$rust_target"
        fi
        if $DEBUG_MODE; then
            bundle_dir="$bundle_dir/debug/bundle"
        else
            bundle_dir="$bundle_dir/release/bundle"
        fi

        if [ -d "$bundle_dir" ]; then
            find "$bundle_dir" -maxdepth 2 -type f \( \
                -name "*.dmg" -o -name "*.app" -o \
                -name "*.deb" -o -name "*.AppImage" -o -name "*.rpm" -o \
                -name "*.msi" -o -name "*.exe" -o \
                -name "*.nsis" \
            \) 2>/dev/null | while read -r file; do
                local size
                size=$(du -h "$file" | cut -f1)
                echo -e "  ${CYAN}${file}${NC} (${size})"
            done
        fi
    else
        echo ""
        echo -e "${RED}✗ Build para ${target} falhou${NC}"
        return 1
    fi
}

# Executar builds
FAILED=()
for target in "${BUILD_TARGETS[@]}"; do
    if ! build_for_target "$target"; then
        FAILED+=("$target")
    fi
    echo ""
done

# Resumo final
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Resumo do Build                         ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""

for target in "${BUILD_TARGETS[@]}"; do
    if [[ " ${FAILED[*]:-} " == *" $target "* ]]; then
        echo -e "  ${RED}✗ ${target} — FALHOU${NC}"
    else
        echo -e "  ${GREEN}✓ ${target} — OK${NC}"
    fi
done

echo ""

if [ ${#FAILED[@]} -gt 0 ]; then
    echo -e "${YELLOW}Nota: Cross-compilation do Tauri tem limitações.${NC}"
    echo -e "${YELLOW}Para builds multi-plataforma, use CI/CD:${NC}"
    echo -e "${YELLOW}  https://v2.tauri.app/distribute/ci-cd/${NC}"
    exit 1
else
    echo -e "${GREEN}Todos os builds concluídos com sucesso!${NC}"
fi
