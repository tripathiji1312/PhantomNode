from fastapi import FastAPI, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import os
import sys
import shutil
import logging
import tempfile
import subprocess

# Add the app directory to PYTHONPATH so local imports work
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import conversion
import audio_work

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="PhantomNode API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/tx")
async def transmit_file(file: UploadFile = File(...)):
    """
    Accept a text file → encode to binary → generate FSK audio WAV.
    Returns the WAV file for the browser to play through speakers.
    """
    try:
        os.makedirs('tests', exist_ok=True)
        filepath = f"tests/{file.filename}"
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Encode to binary (with Hamming ECC)
        logging.info("Encoding %s to binary...", file.filename)
        binary_content = conversion.toBinary(filepath, save=True)

        # Generate audio WAV
        logging.info("Generating acoustic waveform...")
        wav_path = audio_work.generateAudio(binary_content, filename="api_out")

        logging.info("Transmission WAV ready: %s", wav_path)
        return FileResponse(
            wav_path,
            media_type="audio/wav",
            filename="phantomnode_transmission.wav"
        )
    except Exception as e:
        logging.error("TX error: %s", e)
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )


@app.post("/rx")
async def receive_audio(file: UploadFile = File(...)):
    """
    Accept a WAV file recorded from the browser's microphone.
    Decode the FSK audio back into the original text content.
    Returns the decoded text.
    """
    try:
        # Save uploaded audio (could be WebM, Ogg, etc. from browser MediaRecorder)
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
            shutil.copyfileobj(file.file, tmp)
            raw_path = tmp.name

        # Convert to WAV (44100Hz mono) using ffmpeg
        wav_path = raw_path.replace(".webm", ".wav")
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", raw_path, "-ar", "44100", "-ac", "1", "-f", "wav", wav_path],
            capture_output=True, text=True
        )
        os.unlink(raw_path)  # Remove the original

        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg conversion failed: {result.stderr[:200]}")

        logging.info("Converted audio to WAV: %s", wav_path)

        # Decode audio → binary string
        output_bin = audio_work.readAudioFromFile(wav_path)

        # Save binary for conversion
        os.makedirs('tests_output', exist_ok=True)
        bin_path = 'tests_output/binary_content.txt'
        with open(bin_path, 'w') as f:
            f.write(output_bin)

        # Decode binary → original text
        decoded_data = conversion.toString(bin_path)
        decoded_text = decoded_data.decode('utf-8', errors='ignore')

        logging.info("Decoded payload: %s", decoded_text[:100])

        # Clean up
        os.unlink(wav_path)

        return {
            "success": True,
            "decoded_text": decoded_text,
            "filename": "decoded_payload.txt"
        }
    except Exception as e:
        logging.error("RX error: %s", e)
        # Clean up on error
        for p in ['raw_path', 'wav_path']:
            if p in locals():
                try:
                    os.unlink(locals()[p])
                except OSError:
                    pass
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
