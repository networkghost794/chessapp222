"""
Stockfish Native WebSocket Bridge
Connects your native desktop Stockfish to the BotBoard web analysis board with 0% server compute.

Requirements:
  pip install websockets

Usage:
  python stockfish_bridge.py
"""

import asyncio
import subprocess
import websockets

# Update this path to your native Stockfish executable on your PC
STOCKFISH_PATH = r"C:\path\to\stockfish.exe"  # or "/usr/local/bin/stockfish"
PORT = 8080


async def handle_client(websocket):
    print(f"[Bridge] Web client connected from {websocket.remote_address}")
    engine = subprocess.Popen(
        [STOCKFISH_PATH],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )

    async def read_engine():
        loop = asyncio.get_running_loop()
        while True:
            line = await loop.run_in_executor(None, engine.stdout.readline)
            if not line:
                break
            await websocket.send(line.strip())

    async def read_websocket():
        async for message in websocket:
            if engine.stdin:
                engine.stdin.write(message.strip() + "\n")
                engine.stdin.flush()

    try:
        await asyncio.gather(read_engine(), read_websocket())
    except Exception as exc:
        print(f"[Bridge] Connection closed: {exc}")
    finally:
        engine.terminate()


async def main():
    print(f"[Bridge] Starting local Stockfish bridge on ws://localhost:{PORT}")
    async with websockets.serve(handle_client, "localhost", PORT):
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
