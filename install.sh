#!/usr/bin/env bash
# ============================================================================
# BeeHaven Office — Installer
# Visualize Claude Code as a busy bee office
#
# Usage:
#   curl -fsSL https://beehaven.sh/install | bash
#   curl -fsSL https://beehaven.sh/install | bash -s -- --no-color
#
# Flags:
#   --no-color          Disable colored output
#   --skip-node-check   Skip Node.js version check
#   --skip-setup        Skip hook configuration after install
#   --use-bun           Force bun as package manager
#   --use-npm           Force npm as package manager
#   --npx               Print npx usage instead of installing globally
#   --version <ver>     Install a specific version (e.g. 0.1.0)
#   --help, -h          Show this help
# ============================================================================

set -euo pipefail

PACKAGE_NAME="@clearly/beehaven"
MIN_NODE_VERSION=20

# Defaults
NO_COLOR="${NO_COLOR:-}"
SKIP_NODE=""
SKIP_SETUP=""
FORCE_BUN=""
FORCE_NPM=""
NPX_MODE=""
PKG_VERSION=""
PLATFORM=""
ARCH=""
PKG_MGR=""
CLAUDE_FOUND=0
TEMP_DIR=""

# ── Argument Parsing ─────────────────────────────────────────────────────────

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --no-color)          NO_COLOR=1 ;;
      --skip-node-check)   SKIP_NODE=1 ;;
      --skip-setup)        SKIP_SETUP=1 ;;
      --use-bun)           FORCE_BUN=1 ;;
      --use-npm)           FORCE_NPM=1 ;;
      --npx)               NPX_MODE=1 ;;
      --version)           shift; PKG_VERSION="${1:-}" ;;
      --help|-h)           print_help; exit 0 ;;
      *)                   error "Unknown flag: $1. Run with --help for usage." ;;
    esac
    shift
  done
}

print_help() {
  cat <<'HELP'

  BeeHaven Office — Installer

  Usage:
    curl -fsSL https://beehaven.sh/install | bash
    bash install.sh [flags]

  Flags:
    --no-color          Disable colored output
    --skip-node-check   Skip Node.js version check
    --skip-setup        Skip hook configuration after install
    --use-bun           Force bun as package manager
    --use-npm           Force npm as package manager
    --npx               Print npx usage instead of installing globally
    --version <ver>     Install a specific version
    --help, -h          Show this help

  Environment:
    NO_COLOR=1          Disable colored output (https://no-color.org)

HELP
}

# ── Color & Output ───────────────────────────────────────────────────────────

setup_colors() {
  RED='' GREEN='' YELLOW='' BLUE='' BOLD='' DIM='' RESET=''

  if [[ -t 1 ]] && [[ -z "${NO_COLOR:-}" ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[0;33m'
    BLUE='\033[0;34m'
    BOLD='\033[1m'
    DIM='\033[2m'
    RESET='\033[0m'
  fi
}

info()    { printf "${DIM}  %s${RESET}\n" "$*"; }
success() { printf "${GREEN}  %s${RESET}\n" "$*"; }
warn()    { printf "${YELLOW}  %s${RESET}\n" "$*" >&2; }
error()   { printf "${RED}  Error: %s${RESET}\n" "$*" >&2; exit 1; }
step()    { printf "\n${BOLD}${BLUE}  [%s]${RESET} %s\n" "$1" "$2"; }

# ── Banner ───────────────────────────────────────────────────────────────────

print_banner() {
  echo ""
  printf "${BOLD}"
  echo '      //\'
  echo '     {  }  BeeHaven Office'
  echo '      \\/'
  printf "${RESET}"
  printf "${DIM}"
  echo '     Visualize Claude Code as a busy bee office'
  echo '     https://github.com/clearly-sh/beehaven'
  printf "${RESET}"
  echo ""
}

# ── Platform Detection ───────────────────────────────────────────────────────

detect_platform() {
  step "platform" "Detecting environment..."

  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Darwin) PLATFORM="macos" ;;
    Linux)  PLATFORM="linux" ;;
    *)      error "Unsupported OS: $os. BeeHaven supports macOS and Linux." ;;
  esac

  case "$arch" in
    x86_64|amd64)  ARCH="x64" ;;
    arm64|aarch64) ARCH="arm64" ;;
    *)             error "Unsupported architecture: $arch" ;;
  esac

  info "Platform: $PLATFORM ($ARCH)"
}

# ── Claude Code Check ────────────────────────────────────────────────────────

check_claude_code() {
  if command -v claude >/dev/null 2>&1; then
    local ver
    ver="$(claude --version 2>/dev/null || echo 'unknown')"
    success "Claude Code found: $ver"
    CLAUDE_FOUND=1
  else
    warn "Claude Code not found — install it from https://claude.ai/code"
    warn "BeeHaven will install but needs Claude Code to visualize."
    CLAUDE_FOUND=0
  fi
}

# ── Node.js Check ────────────────────────────────────────────────────────────

check_node() {
  if [[ "${SKIP_NODE:-}" == "1" ]]; then
    info "Skipping Node.js check (--skip-node-check)"
    return
  fi

  step "node" "Checking Node.js..."

  if command -v node >/dev/null 2>&1; then
    local node_version major
    node_version="$(node --version)"
    major="${node_version#v}"
    major="${major%%.*}"

    if [[ "$major" -ge "$MIN_NODE_VERSION" ]]; then
      success "Node.js $node_version (>= $MIN_NODE_VERSION required)"
    else
      warn "Node.js $node_version found, but >= $MIN_NODE_VERSION is required"
      offer_node_install
    fi
  else
    warn "Node.js not found"
    offer_node_install
  fi
}

offer_node_install() {
  # Non-interactive: can't prompt
  if [[ ! -t 0 ]]; then
    error "Node.js $MIN_NODE_VERSION+ is required. Install it first: https://nodejs.org"
  fi

  echo ""
  printf "  ${BOLD}Node.js $MIN_NODE_VERSION+ is required. How would you like to install it?${RESET}\n"
  echo ""

  local has_brew=0 has_nvm=0 opt=1

  if command -v brew >/dev/null 2>&1; then
    has_brew=1
    printf "  ${GREEN}${opt})${RESET} Homebrew: brew install node@22\n"
    opt=$((opt + 1))
  fi

  if [[ -d "${NVM_DIR:-$HOME/.nvm}" ]] || command -v nvm >/dev/null 2>&1; then
    has_nvm=1
    printf "  ${GREEN}${opt})${RESET} nvm: nvm install 22\n"
    opt=$((opt + 1))
  fi

  printf "  ${GREEN}${opt})${RESET} Install nvm, then Node.js 22\n"
  printf "  ${DIM}0) Skip — I'll install Node.js myself${RESET}\n"
  echo ""

  local choice
  read -rp "  Choice [1]: " choice
  choice="${choice:-1}"

  case "$choice" in
    0) warn "Skipping Node.js install. BeeHaven may fail to start." ; return ;;
  esac

  # Map choice back to action
  local action_idx=1
  if [[ "$has_brew" == "1" ]] && [[ "$choice" == "$action_idx" ]]; then
    install_node_brew; return
  fi
  [[ "$has_brew" == "1" ]] && action_idx=$((action_idx + 1))

  if [[ "$has_nvm" == "1" ]] && [[ "$choice" == "$action_idx" ]]; then
    install_node_nvm; return
  fi
  [[ "$has_nvm" == "1" ]] && action_idx=$((action_idx + 1))

  if [[ "$choice" == "$action_idx" ]]; then
    install_node_nvm_fresh; return
  fi

  warn "Invalid choice. Skipping Node.js install."
}

install_node_brew() {
  step "brew" "Installing Node.js 22 via Homebrew..."
  brew install node@22
  # Link if not already
  brew link --overwrite node@22 2>/dev/null || true
  success "Node.js $(node --version) installed via Homebrew"
}

install_node_nvm() {
  step "nvm" "Installing Node.js 22 via nvm..."
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck source=/dev/null
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  nvm install 22
  nvm use 22
  success "Node.js $(node --version) installed via nvm"
}

install_node_nvm_fresh() {
  step "nvm" "Installing nvm..."
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck source=/dev/null
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

  step "node" "Installing Node.js 22 via nvm..."
  nvm install 22
  nvm use 22
  success "Node.js $(node --version) installed via nvm"
}

# ── python3 Check ────────────────────────────────────────────────────────────

check_python3() {
  if ! command -v python3 >/dev/null 2>&1; then
    warn "python3 not found — BeeHaven hooks use it for event timestamps."
    warn "Events may not be captured. Install python3 for full functionality."
  fi
}

# ── Package Manager Selection ────────────────────────────────────────────────

select_package_manager() {
  step "package" "Selecting package manager..."

  if [[ "${FORCE_NPM:-}" == "1" ]]; then
    PKG_MGR="npm"
  elif [[ "${FORCE_BUN:-}" == "1" ]]; then
    if command -v bun >/dev/null 2>&1; then
      PKG_MGR="bun"
    else
      error "bun not found. Install it from https://bun.sh"
    fi
  elif command -v bun >/dev/null 2>&1; then
    PKG_MGR="bun"
    info "Using bun (detected). Pass --use-npm to force npm."
  elif command -v npm >/dev/null 2>&1; then
    PKG_MGR="npm"
  else
    error "No package manager found. Install Node.js first: https://nodejs.org"
  fi

  success "Package manager: $PKG_MGR"
}

# ── Install Package ──────────────────────────────────────────────────────────

install_beehaven() {
  # npx mode: just print instructions
  if [[ "${NPX_MODE:-}" == "1" ]]; then
    echo ""
    printf "  ${BOLD}Run BeeHaven without global install:${RESET}\n"
    echo ""
    printf "    ${GREEN}npx ${PACKAGE_NAME}${RESET}\n"
    echo ""
    printf "  ${BOLD}With options:${RESET}\n"
    printf "    npx ${PACKAGE_NAME} --port 4000\n"
    printf "    npx ${PACKAGE_NAME} setup\n"
    printf "    npx ${PACKAGE_NAME} login\n"
    echo ""
    info "Note: hooks configured via npx may break if npm clears its cache."
    info "For persistent hooks, install globally: npm install -g ${PACKAGE_NAME}"
    echo ""
    exit 0
  fi

  local pkg="${PACKAGE_NAME}"
  if [[ -n "${PKG_VERSION:-}" ]]; then
    pkg="${PACKAGE_NAME}@${PKG_VERSION}"
  fi

  step "install" "Installing ${pkg} globally..."

  TEMP_DIR="$(mktemp -d)"
  local err_log="${TEMP_DIR}/install-err.log"

  if ! $PKG_MGR install -g "$pkg" 2>"$err_log"; then
    local err
    err="$(cat "$err_log")"

    if echo "$err" | grep -qi "permission\|EACCES"; then
      echo ""
      warn "Permission denied during global install."
      echo ""
      printf "  ${BOLD}Options:${RESET}\n"
      echo "  1. Fix npm permissions: https://docs.npmjs.com/resolving-eacces-permissions-errors"
      echo "  2. Use npx instead:    curl -fsSL https://beehaven.sh/install | bash -s -- --npx"

      if [[ "$PLATFORM" == "macos" ]] && command -v brew >/dev/null 2>&1; then
        echo "  3. Use Homebrew Node:   brew install node@22 (fixes permissions)"
      fi
      echo ""
      exit 1
    fi

    error "Installation failed: $err"
  fi

  # Verify the binary landed in PATH
  if ! command -v beehaven >/dev/null 2>&1; then
    warn "beehaven command not found in PATH after install."

    case "$PKG_MGR" in
      npm)
        local npm_prefix
        npm_prefix="$(npm prefix -g 2>/dev/null || echo '/usr/local')"
        warn "Try: export PATH=\"${npm_prefix}/bin:\$PATH\""
        ;;
      bun)
        warn "Try: export PATH=\"\$HOME/.bun/bin:\$PATH\""
        ;;
    esac
    return
  fi

  local installed_version
  installed_version="$(beehaven --version 2>/dev/null || echo 'unknown')"
  success "BeeHaven v${installed_version} installed"
}

# ── Run Post-Install Setup ───────────────────────────────────────────────────

run_setup() {
  if [[ "${SKIP_SETUP:-}" == "1" ]]; then
    info "Skipping hook setup (--skip-setup)"
    return
  fi

  step "setup" "Configuring Claude Code hooks..."

  if command -v beehaven >/dev/null 2>&1; then
    beehaven setup
    success "Hooks configured in ~/.claude/settings.json"
  else
    warn "beehaven not in PATH — skipping hook setup"
    warn "Run 'beehaven setup' manually after fixing your PATH"
  fi
}

# ── Verify Installation ──────────────────────────────────────────────────────

verify_install() {
  step "verify" "Verifying installation..."

  if ! command -v beehaven >/dev/null 2>&1; then
    warn "beehaven binary not in PATH — see PATH suggestions above"
    return
  fi

  success "beehaven binary: $(which beehaven)"

  # Check hooks
  if [[ -f "$HOME/.claude/settings.json" ]]; then
    if grep -q "beehaven" "$HOME/.claude/settings.json" 2>/dev/null; then
      success "Claude Code hooks: configured"
    else
      warn "Hooks not found in ~/.claude/settings.json"
    fi
  fi
}

# ── Success Message ──────────────────────────────────────────────────────────

print_success() {
  echo ""
  printf "  ${GREEN}${BOLD}BeeHaven Office installed successfully!${RESET}\n"
  echo ""
  printf "  ${BOLD}Quick start:${RESET}\n"
  printf "    ${GREEN}beehaven${RESET}           Start the office\n"
  printf "    ${DIM}Then open Claude Code in any project${RESET}\n"
  echo ""
  printf "  ${BOLD}Commands:${RESET}\n"
  printf "    beehaven              Start the animated office\n"
  printf "    beehaven --port 4000  Start on custom port\n"
  printf "    beehaven login        Link your Clearly account\n"
  printf "    beehaven link         Link folder for asset sync\n"
  printf "    beehaven setup        Re-configure hooks\n"
  echo ""

  if [[ "$CLAUDE_FOUND" == "0" ]]; then
    printf "  ${YELLOW}${BOLD}Next step:${RESET} Install Claude Code\n"
    printf "  ${DIM}https://claude.ai/code${RESET}\n"
  else
    printf "  ${BOLD}Next step:${RESET} Run ${GREEN}beehaven${RESET} and start a Claude Code session!\n"
  fi

  echo ""
  printf "  ${DIM}Docs:   https://github.com/clearly-sh/beehaven${RESET}\n"
  printf "  ${DIM}Issues: https://github.com/clearly-sh/beehaven/issues${RESET}\n"
  echo ""
}

# ── Cleanup ──────────────────────────────────────────────────────────────────

cleanup() {
  [[ -n "${TEMP_DIR:-}" ]] && [[ -d "${TEMP_DIR}" ]] && rm -rf "$TEMP_DIR"
}

# ── Main ─────────────────────────────────────────────────────────────────────

main() {
  trap cleanup EXIT

  parse_args "$@"
  setup_colors
  print_banner
  detect_platform
  check_claude_code
  check_node
  check_python3
  select_package_manager
  install_beehaven
  run_setup
  verify_install
  print_success
}

main "$@"
