from pydantic import BaseModel
from typing import Any, List, Optional


class SolutionStep(BaseModel):
    """Un paso intermedio de un algoritmo, pensado para que el tutor socrático
    pueda mostrarlo y explicarlo en la UI en vez de solo el resultado final."""
    step_number: int
    title: str
    description: str
    data: Optional[Any] = None  # snapshot serializable en JSON (tableau, tabla, grafo residual, etc.)


class StepTracker:
    """Acumula SolutionStep en orden, para que cada algoritmo no maneje el contador a mano."""

    def __init__(self):
        self._steps: List[SolutionStep] = []

    def add(self, title: str, description: str, data: Any = None) -> None:
        self._steps.append(SolutionStep(
            step_number=len(self._steps) + 1,
            title=title,
            description=description,
            data=data,
        ))

    @property
    def steps(self) -> List[SolutionStep]:
        return self._steps
