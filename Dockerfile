FROM python:3.11-slim

# Install ffmpeg (needed for audio conversion)
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and install Python dependencies
COPY pyproject.toml .
RUN pip install --no-cache-dir fastapi uvicorn numpy scipy python-multipart

# Copy application code
COPY app/ ./app/

# HF Spaces uses port 7860
EXPOSE 7860

CMD ["uvicorn", "app.server:app", "--host", "0.0.0.0", "--port", "7860"]
