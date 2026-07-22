"""Punto de entrada del Solver Service (FastAPI). Registra los 5 routers, uno
por módulo de Investigación Operativa, todos bajo el prefijo /api/v1. No
importa rag_pipeline.py: ese archivo es un script CLI aparte, no forma parte
de esta API (el RAG de PDFs que sí usa la app corre en el backend Node.js,
ver backend/src/services/rag.service.ts)."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import lp_router, transport_router, networks_router, dynamic_router, inventories_router

app = FastAPI(
    title="Tech-Logistics Solver Engine",
    description="Python microservice containing the mathematical solver engines for operations research (LP, PLE, Transport, Networks, Dynamic Programming, Inventories).",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Habilita CORS para cualquier origen: este servicio no lo llama el navegador
# directamente, solo el backend Node.js, pero se deja abierto para simplificar
# pruebas locales (ej. Swagger UI en /docs) desde cualquier host.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Cada router expone su propio POST /solve; el prefijo determina el módulo.
app.include_router(lp_router.router, prefix="/api/v1/lp", tags=["Linear & Integer Programming"])
app.include_router(transport_router.router, prefix="/api/v1/transport", tags=["Transportation Model"])
app.include_router(networks_router.router, prefix="/api/v1/networks", tags=["Network Models"])
app.include_router(dynamic_router.router, prefix="/api/v1/dynamic", tags=["Dynamic Programming"])
app.include_router(inventories_router.router, prefix="/api/v1/inventories", tags=["Inventory Management"])

@app.get("/")
def read_root():
    """Health check simple: confirma que el servicio está en línea."""
    return {
        "status": "online",
        "service": "Tech-Logistics Solver Engine",
        "documentation": "/docs"
    }
