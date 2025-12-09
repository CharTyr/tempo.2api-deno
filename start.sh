#!/bin/bash

echo "========================================"
echo "  Tempo API Proxy - Linux/Mac Startup"
echo "========================================"
echo ""

# Check Deno installation
if ! command -v deno &> /dev/null; then
    echo "[ERROR] Deno is not installed or not in PATH."
    echo ""
    echo "Please install Deno:"
    echo "  1. Using curl (recommended):"
    echo "     curl -fsSL https://deno.land/install.sh | sh"
    echo ""
    echo "  2. Using Homebrew (macOS):"
    echo "     brew install deno"
    echo ""
    echo "  3. Using nix:"
    echo "     nix-shell -p deno"
    echo ""
    echo "For more info: https://deno.land/manual/getting_started/installation"
    exit 1
fi

echo "[OK] Deno found:"
deno --version | head -1
echo ""

# Check required environment variables
if [ -z "$TEMPO_CLIENT_TOKEN" ]; then
    echo "[MISSING] TEMPO_CLIENT_TOKEN is not set."
    read -p "Enter your Tempo Client Token: " TEMPO_CLIENT_TOKEN
    if [ -z "$TEMPO_CLIENT_TOKEN" ]; then
        echo "[ERROR] TEMPO_CLIENT_TOKEN is required."
        exit 1
    fi
    export TEMPO_CLIENT_TOKEN
fi
echo "[OK] TEMPO_CLIENT_TOKEN is set."

if [ -z "$TEMPO_CANVAS_ID" ]; then
    echo "[MISSING] TEMPO_CANVAS_ID is not set."
    read -p "Enter your Tempo Canvas ID: " TEMPO_CANVAS_ID
    if [ -z "$TEMPO_CANVAS_ID" ]; then
        echo "[ERROR] TEMPO_CANVAS_ID is required."
        exit 1
    fi
    export TEMPO_CANVAS_ID
fi
echo "[OK] TEMPO_CANVAS_ID is set."

# Optional environment variables
if [ -z "$PORT" ]; then
    export PORT=3000
fi
echo "[INFO] PORT: $PORT"

if [ -n "$PROXY_API_KEY" ]; then
    echo "[INFO] API Key authentication is enabled."
else
    echo "[INFO] API Key authentication is disabled."
fi

if [ "$RATE_LIMIT_ENABLED" = "true" ]; then
    echo "[INFO] Rate limiting is enabled."
else
    echo "[INFO] Rate limiting is disabled."
fi

echo ""
echo "========================================"
echo "  Starting Tempo API Proxy..."
echo "========================================"
echo ""
echo "Proxy will be available at: http://localhost:$PORT"
echo "Press Ctrl+C to stop the server."
echo ""

# Change to script directory
cd "$(dirname "$0")"

# Start the proxy
exec deno run --allow-net --allow-env main.ts
