# syntax=docker/dockerfile:1
FROM python:3.10-slim

# Install system dependencies, including CBC solver for PuLP
RUN apt-get update && apt-get install -y \
    coinor-cbc \
    glpk-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

# sentence-transformers (usado por el RAG de PDFs) depende de torch, y pip
# instala por defecto la build con soporte CUDA (varios GB) aunque aca solo
# se hace inferencia en CPU. Instalando primero la build CPU-only desde el
# indice oficial de PyTorch, sentence-transformers reutiliza esa version en
# vez de bajar la de GPU — recorta el build de varios minutos a segundos.
# El --mount=type=cache reutiliza los paquetes ya descargados entre builds
# sucesivos en la misma maquina (ej. tras cada "git pull").
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install torch --index-url https://download.pytorch.org/whl/cpu
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
