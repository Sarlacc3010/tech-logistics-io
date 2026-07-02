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

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(lp_router.router, prefix="/api/v1/lp", tags=["Linear & Integer Programming"])
app.include_router(transport_router.router, prefix="/api/v1/transport", tags=["Transportation Model"])
app.include_router(networks_router.router, prefix="/api/v1/networks", tags=["Network Models"])
app.include_router(dynamic_router.router, prefix="/api/v1/dynamic", tags=["Dynamic Programming"])
app.include_router(inventories_router.router, prefix="/api/v1/inventories", tags=["Inventory Management"])

@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": "Tech-Logistics Solver Engine",
        "documentation": "/docs"
    }
