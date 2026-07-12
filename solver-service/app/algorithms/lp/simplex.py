import numpy as np
from typing import Any, Dict, List, Optional

from app.algorithms.steps import StepTracker

EPS = 1e-6
BIG_M = 1e5
MAX_ITERATIONS = 200


def _snapshot(tableau: np.ndarray, basis: List[int], all_var_names: List[str]) -> Dict[str, Any]:
    return {
        "columns": all_var_names + ["RHS"],
        "rows": [
            {"basic_var": all_var_names[basis[i]], "values": [round(float(v), 6) for v in tableau[i]]}
            for i in range(len(basis))
        ],
        "objective_row": [round(float(v), 6) for v in tableau[-1]],
    }


def _pivot(tableau: np.ndarray, basis: List[int], pivot_row: int, pivot_col: int) -> None:
    tableau[pivot_row] = tableau[pivot_row] / tableau[pivot_row, pivot_col]
    for r in range(tableau.shape[0]):
        if r != pivot_row and abs(tableau[r, pivot_col]) > EPS:
            tableau[r] = tableau[r] - tableau[r, pivot_col] * tableau[pivot_row]
    basis[pivot_row] = pivot_col


def _canonicalize(tableau: np.ndarray, basis: List[int]) -> None:
    """Anula en la fila objetivo las columnas que ya son básicas, restando la fila de
    restricción correspondiente. Necesario cuando la fila objetivo inicial (Fase 1 o Gran M)
    tiene coeficientes distintos de cero en columnas artificiales que arrancan en la base."""
    for row, col in enumerate(basis):
        coef = tableau[-1, col]
        if abs(coef) > EPS:
            tableau[-1] -= coef * tableau[row]


def _run_simplex_phase(
    tableau: np.ndarray,
    basis: List[int],
    all_var_names: List[str],
    tracker: StepTracker,
    phase_label: str,
    allowed_cols: Optional[List[int]] = None,
) -> str:
    n_cols = tableau.shape[1] - 1
    candidate_cols = allowed_cols if allowed_cols is not None else list(range(n_cols))

    for _ in range(MAX_ITERATIONS):
        obj_row = tableau[-1, :-1]
        candidates = [c for c in candidate_cols if obj_row[c] < -EPS]
        if not candidates:
            tracker.add(
                f"{phase_label}: óptimo alcanzado",
                "No quedan coeficientes negativos en la fila objetivo entre las columnas "
                "candidatas, por lo que ninguna variable no básica mejora la solución al entrar.",
                _snapshot(tableau, basis, all_var_names),
            )
            return "optimal"

        entering = min(candidates, key=lambda c: obj_row[c])

        ratios = [
            (tableau[r, -1] / tableau[r, entering], r)
            for r in range(tableau.shape[0] - 1)
            if tableau[r, entering] > EPS
        ]

        if not ratios:
            tracker.add(
                f"{phase_label}: problema no acotado",
                f"La variable {all_var_names[entering]} puede crecer indefinidamente sin violar "
                "ninguna restricción (su columna no tiene coeficientes positivos).",
                _snapshot(tableau, basis, all_var_names),
            )
            return "unbounded"

        _, leaving = min(ratios, key=lambda x: x[0])
        entering_var, leaving_var = all_var_names[entering], all_var_names[basis[leaving]]

        tracker.add(
            f"{phase_label}: entra {entering_var}, sale {leaving_var}",
            f"{entering_var} entra a la base por tener el coeficiente más negativo en la fila "
            f"objetivo ({obj_row[entering]:.4g}). {leaving_var} sale por la razón mínima "
            "RHS/coeficiente en la prueba de la razón.",
            _snapshot(tableau, basis, all_var_names),
        )
        _pivot(tableau, basis, leaving, entering)

    raise RuntimeError("Simplex no convergió dentro del número máximo de iteraciones")


def _normalize_constraints(var_names: List[str], constraints: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    normalized = []
    for c in constraints:
        coeffs = [c["coefficients"].get(v, 0.0) for v in var_names]
        op, rhs = c["operator"], c["rhs"]
        if rhs < 0:
            coeffs = [-x for x in coeffs]
            rhs = -rhs
            op = {"<=": ">=", ">=": "<=", "=": "="}[op]
        normalized.append({"coefficients": coeffs, "operator": op, "rhs": rhs, "name": c.get("name")})
    return normalized


def _extract_solution(
    tableau: np.ndarray,
    basis: List[int],
    all_var_names: List[str],
    var_names: List[str],
    sense: float,
    status: str,
    tracker: StepTracker,
    method_label: str,
    artificial_cols: Optional[List[int]] = None,
) -> Dict[str, Any]:
    values = {v: 0.0 for v in var_names}
    for row, col in enumerate(basis):
        var = all_var_names[col]
        if var in values:
            values[var] = float(tableau[row, -1])

    if artificial_cols:
        for row, col in enumerate(basis):
            if col in artificial_cols and tableau[row, -1] > EPS:
                return {
                    "method": method_label, "status": "Infeasible", "objective_value": None,
                    "variables": values, "steps": [s.model_dump() for s in tracker.steps],
                }

    if status != "optimal":
        return {
            "method": method_label,
            "status": "Unbounded" if status == "unbounded" else "Infeasible",
            "objective_value": None,
            "variables": values,
            "steps": [s.model_dump() for s in tracker.steps],
        }

    return {
        "method": method_label,
        "status": "Optimal",
        "objective_value": sense * float(tableau[-1, -1]),
        "variables": values,
        "steps": [s.model_dump() for s in tracker.steps],
    }


def solve_standard_simplex(
    objective: str, var_names: List[str], obj_coeffs: List[float], constraints: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """Simplex tabular clásico. Solo admite restricciones <= (todas obtienen holgura básica
    inicial). Para >= o = usar Dos Fases o Gran M."""
    tracker = StepTracker()
    sense = 1.0 if objective.lower() == "maximize" else -1.0
    norm = _normalize_constraints(var_names, constraints)
    if any(c["operator"] != "<=" for c in norm):
        raise ValueError("El método Simplex estándar solo admite restricciones '<='. Use Dos Fases o Gran M.")

    m, n = len(norm), len(var_names)
    slack_names = [f"s{i + 1}" for i in range(m)]
    all_var_names = list(var_names) + slack_names

    tableau = np.zeros((m + 1, n + m + 1))
    basis = []
    for i, c in enumerate(norm):
        tableau[i, :n] = c["coefficients"]
        tableau[i, n + i] = 1.0
        tableau[i, -1] = c["rhs"]
        basis.append(n + i)

    eff_c = [sense * coef for coef in obj_coeffs]
    tableau[-1, :n] = [-x for x in eff_c]

    tracker.add(
        "Tableau inicial",
        f"Se agregó una variable de holgura por cada restricción (todas son '<='), formando la "
        f"base inicial factible {', '.join(slack_names)}.",
        _snapshot(tableau, basis, all_var_names),
    )

    status = _run_simplex_phase(tableau, basis, all_var_names, tracker, "Simplex")
    return _extract_solution(tableau, basis, all_var_names, var_names, sense, status, tracker, "Simplex")


def _build_artificial_tableau(var_names: List[str], norm: List[Dict[str, Any]]):
    """Construye el tableau con holguras/excedentes/artificiales según el operador de cada
    restricción. Devuelve (tableau, basis, all_var_names, artificial_cols)."""
    m, n = len(norm), len(var_names)
    slack_count = surplus_count = artificial_count = 0
    extra_names: List[str] = []
    row_info = []
    col_cursor = n

    for c in norm:
        info: Dict[str, int] = {}
        if c["operator"] == "<=":
            slack_count += 1
            extra_names.append(f"s{slack_count}")
            info["basic_col"] = col_cursor
            col_cursor += 1
        elif c["operator"] == ">=":
            surplus_count += 1
            extra_names.append(f"e{surplus_count}")
            info["surplus_col"] = col_cursor
            col_cursor += 1
            artificial_count += 1
            extra_names.append(f"a{artificial_count}")
            info["basic_col"] = col_cursor
            col_cursor += 1
        else:
            artificial_count += 1
            extra_names.append(f"a{artificial_count}")
            info["basic_col"] = col_cursor
            col_cursor += 1
        row_info.append(info)

    all_var_names = list(var_names) + extra_names
    tableau = np.zeros((m + 1, col_cursor + 1))
    basis = []
    artificial_cols = []

    for i, (c, info) in enumerate(zip(norm, row_info)):
        tableau[i, :n] = c["coefficients"]
        if "surplus_col" in info:
            tableau[i, info["surplus_col"]] = -1.0
        tableau[i, info["basic_col"]] = 1.0
        tableau[i, -1] = c["rhs"]
        basis.append(info["basic_col"])

    artificial_cols = [info["basic_col"] for c, info in zip(norm, row_info) if c["operator"] != "<="]
    return tableau, basis, all_var_names, artificial_cols


def solve_two_phase(
    objective: str, var_names: List[str], obj_coeffs: List[float], constraints: List[Dict[str, Any]]
) -> Dict[str, Any]:
    tracker = StepTracker()
    sense = 1.0 if objective.lower() == "maximize" else -1.0
    norm = _normalize_constraints(var_names, constraints)
    n = len(var_names)

    tableau, basis, all_var_names, artificial_cols = _build_artificial_tableau(var_names, norm)

    if not artificial_cols:
        tracker.add(
            "Sin variables artificiales necesarias",
            "Todas las restricciones son '<=' con RHS no negativo, por lo que Dos Fases se "
            "reduce directamente a Fase 2 (Simplex estándar).",
            _snapshot(tableau, basis, all_var_names),
        )
    else:
        tableau[-1, :] = 0.0
        for col in artificial_cols:
            tableau[-1, col] = 1.0
        _canonicalize(tableau, basis)

        tracker.add(
            "Fase 1: tableau inicial",
            f"Se agregaron variables artificiales ({', '.join(all_var_names[c] for c in artificial_cols)}) "
            "en las restricciones '>=' y '='. La Fase 1 minimiza su suma para encontrar una base "
            "factible del problema original.",
            _snapshot(tableau, basis, all_var_names),
        )

        status1 = _run_simplex_phase(tableau, basis, all_var_names, tracker, "Fase 1")
        phase1_obj = -float(tableau[-1, -1])
        if status1 != "optimal" or phase1_obj > EPS:
            tracker.add(
                "Problema infactible",
                f"La suma mínima de variables artificiales es {phase1_obj:.4g} > 0, por lo que el "
                "problema original no tiene ninguna solución que cumpla todas las restricciones.",
                None,
            )
            return _extract_solution(
                tableau, basis, all_var_names, var_names, sense, "infeasible", tracker, "Dos Fases", artificial_cols
            )

        for row, col in enumerate(basis):
            if col in artificial_cols:
                non_artificial = [c for c in range(len(all_var_names)) if c not in artificial_cols and abs(tableau[row, c]) > EPS]
                if non_artificial:
                    _pivot(tableau, basis, row, non_artificial[0])

        tracker.add(
            "Fase 1 completa: base factible encontrada",
            "La suma de variables artificiales llegó a 0. Se descartan las columnas artificiales "
            "y se pasa a la Fase 2 con la función objetivo original.",
            _snapshot(tableau, basis, all_var_names),
        )

    eff_c = [sense * coef for coef in obj_coeffs]
    tableau[-1, :] = 0.0
    tableau[-1, :n] = [-x for x in eff_c]
    _canonicalize(tableau, basis)

    tracker.add(
        "Fase 2: tableau inicial",
        "Se restaura la función objetivo original sobre la base factible hallada en la Fase 1.",
        _snapshot(tableau, basis, all_var_names),
    )

    allowed_cols = [c for c in range(len(all_var_names)) if c not in artificial_cols]
    status2 = _run_simplex_phase(tableau, basis, all_var_names, tracker, "Fase 2", allowed_cols)
    return _extract_solution(
        tableau, basis, all_var_names, var_names, sense, status2, tracker, "Dos Fases", artificial_cols
    )


def solve_big_m(
    objective: str, var_names: List[str], obj_coeffs: List[float], constraints: List[Dict[str, Any]]
) -> Dict[str, Any]:
    tracker = StepTracker()
    sense = 1.0 if objective.lower() == "maximize" else -1.0
    norm = _normalize_constraints(var_names, constraints)
    n = len(var_names)

    tableau, basis, all_var_names, artificial_cols = _build_artificial_tableau(var_names, norm)

    eff_c = [sense * coef for coef in obj_coeffs]
    tableau[-1, :n] = [-x for x in eff_c]
    for col in artificial_cols:
        tableau[-1, col] = BIG_M
    _canonicalize(tableau, basis)

    if artificial_cols:
        tracker.add(
            "Tableau inicial con penalización M",
            f"Se agregaron variables artificiales ({', '.join(all_var_names[c] for c in artificial_cols)}) "
            f"penalizadas con M = {BIG_M:g} en la fila objetivo, para forzar que salgan de la base "
            "apenas exista una alternativa factible.",
            _snapshot(tableau, basis, all_var_names),
        )
    else:
        tracker.add(
            "Tableau inicial",
            "Todas las restricciones son '<=' con RHS no negativo; no se necesitan variables "
            "artificiales, por lo que Gran M coincide con el Simplex estándar.",
            _snapshot(tableau, basis, all_var_names),
        )

    status = _run_simplex_phase(tableau, basis, all_var_names, tracker, "Gran M")
    return _extract_solution(
        tableau, basis, all_var_names, var_names, sense, status, tracker, "Gran M", artificial_cols
    )
