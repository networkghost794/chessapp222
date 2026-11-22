@echo off
title BotBoard Native Stockfish Bridge
color 0A
echo ====================================================
echo        BotBoard 1-Click Desktop Stockfish Bridge
echo ====================================================
echo.
echo Searching for your local Stockfish engine...

set "SF_PATH="
if exist "stockfish-windows-x86-64-universal.exe" set "SF_PATH=stockfish-windows-x86-64-universal.exe"
if "%SF_PATH%"=="" if exist "stockfish.exe" set "SF_PATH=stockfish.exe"
if "%SF_PATH%"=="" (
    for %%F in (stockfish*.exe) do (
        set "SF_PATH=%%F"
        goto :found
    )
)
if "%SF_PATH%"=="" if exist "%LOCALAPPDATA%\LucasChess\Engines\Stockfish\stockfish.exe" set "SF_PATH=%LOCALAPPDATA%\LucasChess\Engines\Stockfish\stockfish.exe"
if "%SF_PATH%"=="" if exist "C:\LucasChessR\Engines\Stockfish\stockfish.exe" set "SF_PATH=C:\LucasChessR\Engines\Stockfish\stockfish.exe"

:found
if "%SF_PATH%"=="" (
    echo [!] Could not automatically find Stockfish in this folder.
    echo Please place BotBoard-Bridge.bat in the same folder as your Stockfish .exe and double-click it.
    pause
    exit /b
)

echo [*] Found Stockfish: %SF_PATH%
echo [*] Starting bridge on ws://127.0.0.1:8765 ...
echo [*] Return to BotBoard and click "Connect" in Engine Settings!
echo.
python -c "import websockets" 2>nul || (
    echo Installing lightweight WebSocket helper once...
    pip install websockets >nul 2>&1
)
python -c "
import asyncio, subprocess, websockets
engine = subprocess.Popen([r'%SF_PATH%'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
async def handler(ws):
    async def to_engine():
        async for msg in ws:
            engine.stdin.write(msg.strip() + '\n')
            engine.stdin.flush()
    async def from_engine():
        loop = asyncio.get_running_loop()
        while True:
            line = await loop.run_in_executor(None, engine.stdout.readline)
            if not line:
                break
            await ws.send(line.strip())
    await asyncio.gather(to_engine(), from_engine())
async def main():
    async with websockets.serve(handler, '127.0.0.1', 8765):
        await asyncio.Future()
asyncio.run(main())
"
pause
