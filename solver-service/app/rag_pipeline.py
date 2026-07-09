import argparse
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import chromadb
import requests
from sentence_transformers import SentenceTransformer
from tqdm import tqdm

EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"
COLLECTION_NAME = "tech_logistics"
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"

_embedding_model: Optional[SentenceTransformer] = None

def get_embedding_model() -> SentenceTransformer:
    """Singleton para cargar el modelo de embeddings una sola vez."""
    global _embedding_model
    if _embedding_model is None:
        _embedding_model = SentenceTransformer(EMBEDDING_MODEL_NAME)
    return _embedding_model

def normalize_case(obj: Any, source_path: Path) -> Dict[str, Any]:
    """Extrae id, title, problem_type, solver_name, description, variables y results."""
    data = obj if isinstance(obj, dict) else {}

    # Soporte fallback
    source_name = source_path.stem if source_path else "caso"
    
    variables = data.get("variables", {})
    if isinstance(variables, list):
        variables = {str(item.get("name", i)): item.get("value") for i, item in enumerate(variables)}
        
    results = data.get("results", {})
    if isinstance(results, list):
        results = {str(i): item for i, item in enumerate(results)}

    return {
        "id": data.get("id", source_name),
        "title": data.get("title", source_name.replace("_", " ").title()),
        "problem_type": data.get("problem_type", "No especificado"),
        "solver_name": data.get("solver_name", "No especificado"),
        "description": data.get("description", "Sin descripción"),
        "variables": variables if isinstance(variables, dict) else {},
        "results": results if isinstance(results, dict) else {},
    }

def build_document_text(normalized: Dict[str, Any]) -> str:
    """Convierte el diccionario normalizado en una estructura Markdown legible."""
    title = normalized["title"]
    lines = [
        f"# {title}",
        "",
        f"**ID:** {normalized['id']}",
        f"**Tipo de Problema:** {normalized['problem_type']}",
        f"**Solver:** {normalized['solver_name']}",
        f"**Descripción:** {normalized['description']}",
        ""
    ]

    variables = normalized["variables"]
    if variables:
        lines.append("## Variables")
        for k, v in variables.items():
            lines.append(f"- {k}: {v}")
        lines.append("")

    results = normalized["results"]
    if results:
        lines.append("## Resultados")
        for k, v in results.items():
            if isinstance(v, dict):
                lines.append(f"- {k}:")
                for sub_k, sub_v in v.items():
                    lines.append(f"  - {sub_k}: {sub_v}")
            else:
                lines.append(f"- {k}: {v}")
        lines.append("")

    return "\n".join(lines).strip()

def chunk_text(text: str, max_chars: int = 1500, overlap: int = 300) -> List[str]:
    """Límite de 1500 caracteres y un solapamiento de 300."""
    if not text:
        return []
    
    chunks = []
    start = 0
    text_length = len(text)
    
    while start < text_length:
        end = min(start + max_chars, text_length)
        chunks.append(text[start:end])
        if end >= text_length:
            break
        start = end - overlap
        
    return chunks

def ingest_directory(path: str, client: chromadb.Client, persist_dir: Optional[str] = None) -> None:
    """Busca archivos .json y .md, procesa los textos, genera embeddings en lotes, y los guarda."""
    target_path = Path(path)
    collection = client.get_or_create_collection(name=COLLECTION_NAME)
    
    documents: List[str] = []
    metadatas: List[Dict[str, Any]] = []
    ids: List[str] = []

    files = []
    if target_path.is_file():
        files = [target_path]
    else:
        files.extend(target_path.rglob("*.json"))
        files.extend(target_path.rglob("*.md"))

    for file_path in tqdm(files, desc="Procesando archivos para ingesta"):
        if file_path.suffix.lower() == ".json":
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    content = json.load(f)
            except Exception:
                continue
                
            items = content if isinstance(content, list) else [content]
            
            for idx, item in enumerate(items):
                normalized = normalize_case(item, file_path)
                doc_text = build_document_text(normalized)
                chunks = chunk_text(doc_text)
                
                for chunk_idx, chunk in enumerate(chunks):
                    documents.append(chunk)
                    metadatas.append({"source": str(file_path), "id": normalized["id"]})
                    ids.append(f"{file_path.stem}_{idx}_{chunk_idx}")
                    
        elif file_path.suffix.lower() == ".md":
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    content = f.read()
            except Exception:
                continue
                
            normalized = normalize_case({"description": content}, file_path)
            doc_text = build_document_text(normalized)
            chunks = chunk_text(doc_text)
            
            for chunk_idx, chunk in enumerate(chunks):
                documents.append(chunk)
                metadatas.append({"source": str(file_path), "id": normalized["id"]})
                ids.append(f"{file_path.stem}_{chunk_idx}")

    if documents:
        print(f"Generando embeddings para {len(documents)} fragmentos...")
        model = get_embedding_model()
        embeddings = model.encode(documents, convert_to_numpy=True, normalize_embeddings=True)
        
        # Guardar en ChromaDB
        collection.add(
            ids=ids,
            documents=documents,
            metadatas=metadatas,
            embeddings=embeddings.tolist()
        )
        print("Ingesta completada correctamente.")
    else:
        print("No se encontraron documentos válidos para ingerir.")

def retrieve(query: str, client: chromadb.Client, top_k: int = 6) -> List[Dict[str, Any]]:
    """Hace búsquedas semánticas en ChromaDB."""
    collection = client.get_or_create_collection(name=COLLECTION_NAME)
    model = get_embedding_model()
    
    query_embedding = model.encode([query], convert_to_numpy=True, normalize_embeddings=True)[0]
    
    results = collection.query(
        query_embeddings=[query_embedding.tolist()],
        n_results=top_k
    )
    
    retrieved = []
    if results["documents"] and results["documents"][0]:
        for doc, meta in zip(results["documents"][0], results["metadatas"][0]):
            retrieved.append({"document": doc, "metadata": meta})
            
    return retrieved

def build_prompt(query: str, retrieved_docs: List[Dict[str, Any]], translation_dict: Dict[str, Any], solver_result_json: Dict[str, Any]) -> str:
    """Instruye estrictamente al asistente con el formato deseado."""
    context_str = ""
    for i, doc in enumerate(retrieved_docs, 1):
        context_str += f"\n[Documento {i}]\n{doc['document']}\n"
        
    prompt = f"""
Eres un experto analista logístico. Tu tarea es explicar los resultados del modelo de optimización.

REGLAS ESTRICTAS:
1. Habla en lenguaje de negocio de logística. No uses variables algebraicas como x1, x2.
2. Cuando veas 'Shadow Price', tradúcelo al cliente como 'Valor de conseguir más recursos' y muestra el impacto monetario.
3. Cuando veas 'Slack', tradúcelo como 'Recursos o capacidad sobrante'.

INFORMACIÓN DEL PROBLEMA ACTUAL:
Resultados del Solver (JSON):
{json.dumps(solver_result_json, indent=2, ensure_ascii=False)}

Diccionario de Traducción de Variables:
{json.dumps(translation_dict, indent=2, ensure_ascii=False)}

CONTEXTO DE CASOS DE USO (Base de conocimiento RAG):
{context_str}

PREGUNTA DEL USUARIO:
{query}

Respuesta:
"""
    return prompt.strip()

def query_gemini_llm(prompt: str) -> str:
    """Hace un POST request directo con requests a la API de Google Gemini."""
    if not GEMINI_API_KEY:
        return "Error: GEMINI_API_KEY no está configurada en las variables de entorno."

    payload = {
        "contents": [{
            "parts": [{"text": prompt}]
        }]
    }
    try:
        response = requests.post(GEMINI_API_URL, json=payload, headers={"Content-Type": "application/json"}, timeout=120)
        response.raise_for_status()
        data = response.json()
        return data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "Sin respuesta del modelo.")
    except Exception as e:
        return f"Error al conectar con Gemini: {str(e)}"

def main():
    parser = argparse.ArgumentParser(description="Sistema RAG local para logística usando ChromaDB y Gemini")
    parser.add_argument("--ingest", type=str, help="Ruta al directorio de archivos .json/.md para ingesta")
    parser.add_argument("--persist_dir", type=str, default="./chroma_db", help="Directorio para persistir ChromaDB")
    parser.add_argument("--query", type=str, help="Pregunta del usuario para el sistema RAG")
    args = parser.parse_args()

    # Inicializar cliente de ChromaDB con sintaxis moderna (PersistentClient)
    client = chromadb.PersistentClient(path=args.persist_dir)

    if args.ingest:
        print(f"Iniciando ingesta desde: {args.ingest}")
        ingest_directory(args.ingest, client)

    if args.query:
        print(f"Buscando información para la consulta: '{args.query}'...")
        docs = retrieve(args.query, client, top_k=6)
        
        # Para el ejemplo CLI, usaremos diccionarios simulados de solver y traducción
        dummy_solver_result = {"status": "optimal", "objective": 15000}
        dummy_translation_dict = {"x1": "Cantidad a enviar desde Almacén A"}
        
        print("Construyendo prompt y consultando a Gemini...")
        prompt = build_prompt(args.query, docs, dummy_translation_dict, dummy_solver_result)
        
        response = query_gemini_llm(prompt)
        
        print("\n" + "="*50)
        print("RESPUESTA DEL ASISTENTE LOGÍSTICO:")
        print("="*50)
        print(response)
        print("="*50)

if __name__ == "__main__":
    main()
