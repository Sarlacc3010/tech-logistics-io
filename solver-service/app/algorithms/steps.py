"""Esquema compartido para registrar el detalle "paso a paso" de cualquier
algoritmo del solver (Simplex, MODI, Dijkstra, Kruskal, Edmonds-Karp,
Programación Dinámica, fórmulas de Inventarios...).

Cada algoritmo, en vez de devolver solo el resultado final, va llamando a
`StepTracker.add(...)` en cada iteración/decisión relevante. Al final se
adjunta la lista de `SolutionStep` a la respuesta del endpoint, y el frontend
la muestra en un acordeón expandible ("Detalle paso a paso") para que el
estudiante (o el tutor socrático) pueda seguir el procedimiento igual que se
enseña en clase, no solo ver el número final.
"""

from pydantic import BaseModel
from typing import Any, List, Optional


class SolutionStep(BaseModel):
    """Un paso intermedio de un algoritmo, pensado para que el tutor socrático
    pueda mostrarlo y explicarlo en la UI en vez de solo el resultado final."""

    step_number: int  # orden del paso, 1-indexado (lo asigna StepTracker automáticamente)
    title: str  # encabezado corto del paso, ej. "MODI: óptimo alcanzado"
    description: str  # explicación en texto de qué se hizo y por qué en este paso
    data: Optional[Any] = None  # snapshot serializable en JSON (tableau, tabla, grafo residual, etc.)


class StepTracker:
    """Acumula SolutionStep en orden, para que cada algoritmo no maneje el contador a mano.

    Uso típico dentro de un algoritmo:
        tracker = StepTracker()
        tracker.add("Título del paso", "Explicación...", {"algo": "dato para mostrar"})
        ...
        return {"steps": tracker.steps, ...}
    """

    def __init__(self):
        self._steps: List[SolutionStep] = []

    def add(self, title: str, description: str, data: Any = None) -> None:
        """Crea un nuevo SolutionStep con el siguiente número de paso y lo agrega a la lista."""
        self._steps.append(SolutionStep(
            step_number=len(self._steps) + 1,
            title=title,
            description=description,
            data=data,
        ))

    @property
    def steps(self) -> List[SolutionStep]:
        """Lista de pasos acumulados hasta ahora, en el orden en que se agregaron."""
        return self._steps
