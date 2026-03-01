@echo off
echo ========================================
echo   INSTALACAO CORRIGIDA - VENDAS APP
echo ========================================
echo.

echo [1/5] Limpando cache do npm...
call npm cache clean --force
echo.

echo [2/5] Limpando node_modules...
if exist node_modules (
    rmdir /s /q node_modules
    echo node_modules removido.
) else (
    echo node_modules nao encontrado.
)
echo.

echo [3/5] Limpando package-lock.json...
if exist package-lock.json (
    del package-lock.json
    echo package-lock.json removido.
) else (
    echo package-lock.json nao encontrado.
)
echo.

echo [4/5] Instalando dependencias com versoes corrigidas...
echo Vite 5.4.10 (compativel com @builder.io/vite-plugin-jsx-loc)
echo.
call npm install --legacy-peer-deps
echo.

if %ERRORLEVEL% EQU 0 (
    echo [5/5] INSTALACAO CONCLUIDA COM SUCESSO!
    echo.
    echo Agora execute:
    echo pnpm run dev:windows
    echo.
    echo Depois acesse:
    echo http://localhost:3000/login
    echo admin/admin123
) else (
    echo [ERRO] Falha na instalacao!
    echo Tente executar manualmente:
    echo npm install --legacy-peer-deps
)

echo.
pause
