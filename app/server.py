from fastapi import FastAPI, UploadFile, File, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import asyncio
import os
import shutil
import base64
import logging
import sys
import os

# Add the app directory to PYTHONPATH so local imports work
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import conversion
import audio_work

app = FastAPI(title="PhantomNode API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

active_connections = []

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        active_connections.remove(websocket)

async def broadcast(message: dict):
    for connection in active_connections:
        await connection.send_json(message)

@app.post("/tx")
async def transmit_file(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    # Save the uploaded file
    os.makedirs('tests', exist_ok=True)
    filepath = f"tests/{file.filename}"
    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Process audio generation in background
    def generate_and_play():
        try:
            asyncio.run(broadcast({"type": "status", "message": f"Encoding {file.filename} to binary..."}))
            binary_content = conversion.toBinary(filepath, save=True)
            
            asyncio.run(broadcast({"type": "status", "message": "Generating acoustic waveform..."}))
            audio_work.generateAudio(binary_content, filename="api_out")
            
            asyncio.run(broadcast({"type": "status", "message": "Broadcast complete."}))
        except Exception as e:
            logging.error(f"Error transmitting: {e}")
            asyncio.run(broadcast({"type": "status", "message": f"Error during TX: {str(e)}"}))
            
    background_tasks.add_task(generate_and_play)
    return {"message": "Transmission started"}

import threading

rx_stop_event = None

@app.post("/rx/start")
async def start_listening(background_tasks: BackgroundTasks):
    global rx_stop_event
    if rx_stop_event is not None and not rx_stop_event.is_set():
        return {"message": "Already listening"}
    
    rx_stop_event = threading.Event()

    def listen_and_decode(stop_event):
        try:
            asyncio.run(broadcast({"type": "status", "message": "Activating microphone monitoring..."}))
            output_bin = audio_work.readAudio("api_in", external_stop_event=stop_event)
            
            os.makedirs('tests_output', exist_ok=True)
            out_bin_path = f'tests_output/binary_content.txt'
            with open(out_bin_path, 'w') as f:
                f.write(output_bin)
                
            decoded_data = conversion.toString(out_bin_path)
            
            asyncio.run(broadcast({
                "type": "file_received",
                "filename": "decoded_payload.txt",
                "content": decoded_data.decode('utf-8', errors='ignore')
            }))
        except Exception as e:
            logging.error(f"Error receiving: {e}")
            asyncio.run(broadcast({"type": "status", "message": f"Error during RX: {str(e)}"}))

    background_tasks.add_task(listen_and_decode, rx_stop_event)
    return {"message": "Listening started"}

@app.post("/rx/stop")
async def stop_listening():
    global rx_stop_event
    if rx_stop_event is not None:
        rx_stop_event.set()
        rx_stop_event = None
    return {"message": "Listening stopped"}

if __name__ == "__main__":
    uvicorn.run("app.server:app", host="0.0.0.0", port=8000, reload=True)
