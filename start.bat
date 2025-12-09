@echo off
setlocal enabledelayedexpansion

echo ========================================
echo   Tempo API Proxy - Windows Startup
echo ========================================
echo.

:: Check Deno installation
where deno >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Deno is not installed or not in PATH.
    echo.
    echo Please install Deno:
    echo   1. Using PowerShell:
    echo      irm https://deno.land/install.ps1 ^| iex
    echo.
    echo   2. Using Chocolatey:
    echo      choco install deno
    echo.
    echo   3. Using Scoop:
    echo      scoop install deno
    echo.
    echo For more info: https://deno.land/manual/getting_started/installation
    pause
    exit /b 1
)

echo [OK] Deno found: 
deno --version | findstr /r "deno"
echo.

:: Check environment variables
if "%TEMPO_CLIENT_TOKEN%"=="" (
    echo [MISSING] TEMPO_CLIENT_TOKEN is not set.
    set /p TEMPO_CLIENT_TOKEN="Enter your Tempo Client Token: "
    if "!TEMPO_CLIENT_TOKEN!"=="" (
        echo [ERROR] TEMPO_CLIENT_TOKEN is required.
        pause
        exit /b 1
    )
)
echo [OK] TEMPO_CLIENT_TOKEN is set.

if "%TEMPO_CANVAS_ID%"=="" (
    echo [MISSING] TEMPO_CANVAS_ID is not set.
    set /p TEMPO_CANVAS_ID="Enter your Tempo Canvas ID: "
    if "!TEMPO_CANVAS_ID!"=="" (
        echo [ERROR] TEMPO_CANVAS_ID is required.
        pause
        exit /b 1
    )
)
echo [OK] TEMPO_CANVAS_ID is set.

:: Optional environment variables
if "%PORT%"=="" (
    set PORT=3000
)
echo [INFO] PORT: %PORT%

if not "%PROXY_API_KEY%"=="" (
    echo [INFO] API Key authentication is enabled.
) else (
    echo [INFO] API Key authentication is disabled.
)

if "%RATE_LIMIT_ENABLED%"=="true" (
    echo [INFO] Rate limiting is enabled.
) else (
    echo [INFO] Rate limiting is disabled.
)

echo.
echo ========================================
echo   Starting Tempo API Proxy...
echo ========================================
echo.
echo Proxy will be available at: http://localhost:%PORT%
echo Press Ctrl+C to stop the server.
echo.

:: Start the proxy
deno run --allow-net --allow-env main.ts

pause
