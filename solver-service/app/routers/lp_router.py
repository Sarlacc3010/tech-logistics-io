from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
import pulp
import numpy as np
import copy
import re

from app.algorithms.steps import SolutionStep
from app.algorithms.lp.simplex import solve_standard_simplex, solve_two_phase, solve_big_m

router = APIRouter()

class VariableInput(BaseModel):
    name: str
    lowBound: Optional[float] = 0.0
    upBound: Optional[float] = None
    isInteger: bool = False
    objCoef: float

class ConstraintInput(BaseModel):
    name: str
    coefficients: Dict[str, float]
    operator: str  # "<=", ">=", "="
    rhs: float

class LPProblemInput(BaseModel):
    objective: str  # "maximize" or "minimize"
    variables: List[VariableInput]
    constraints: List[ConstraintInput]
    method: Optional[str] = "auto"  # "auto", "simplex", "dosfases", "granm", "none"

class VariableOutput(BaseModel):
    name: str
    value: float
    reduced_cost: Optional[float] = None

class ConstraintOutput(BaseModel):
    name: str
    slack: float
    shadow_price: float
    rhsLow: Optional[float] = None
    rhsHigh: Optional[float] = None

class LPSolutionOutput(BaseModel):
    status: str
    objective_value: Optional[float] = None
    variables: List[VariableOutput]
    constraints: List[ConstraintOutput]
    method_used: Optional[str] = None
    steps: Optional[List[SolutionStep]] = None
    steps_note: Optional[str] = None

def _pulp_safe_name(name: str, prefix: str) -> str:
    """PuLP reemplaza internamente espacios/caracteres inválidos en nombres de variables y
    restricciones (ej. 'pruebas de calidad' -> 'pruebas_de_calidad'). Si luego se busca por el
    nombre original en prob.constraints[...], truena con KeyError. Saneamos nosotros mismos el
    nombre que le pasamos a PuLP, y mantenemos nuestros propios dicts indexados por el nombre
    original tal como lo mandó el usuario/LLM."""
    safe = re.sub(r'[^A-Za-z0-9_]', '_', name)
    if not safe or safe[0].isdigit():
        safe = f"{prefix}_{safe}"
    return safe


def solve_lp_helper(
    objective_str: str,
    variables: List[VariableInput],
    constraints: List[ConstraintInput]
) -> tuple:
    # Determine objective type
    sense = pulp.LpMaximize if objective_str.lower() == "maximize" else pulp.LpMinimize
    prob = pulp.LpProblem("TechLogistics_LP", sense)

    # Create variables
    pulp_vars = {}
    for v in variables:
        cat = pulp.LpInteger if v.isInteger else pulp.LpContinuous
        pulp_vars[v.name] = pulp.LpVariable(
            _pulp_safe_name(v.name, "var"),
            lowBound=v.lowBound,
            upBound=v.upBound,
            cat=cat
        )

    # Objective function
    prob += pulp.lpSum([v.objCoef * pulp_vars[v.name] for v in variables])

    # Constraints
    pulp_constrs = {}
    for c in constraints:
        expr = pulp.lpSum([coef * pulp_vars[var_name] for var_name, coef in c.coefficients.items() if var_name in pulp_vars])
        if c.operator == "<=":
            constr_obj = (expr <= c.rhs)
        elif c.operator == ">=":
            constr_obj = (expr >= c.rhs)
        elif c.operator == "=":
            constr_obj = (expr == c.rhs)
        else:
            raise ValueError(f"Invalid operator: {c.operator}")

        safe_cname = _pulp_safe_name(c.name, "c")
        prob += constr_obj, safe_cname
        pulp_constrs[c.name] = prob.constraints[safe_cname]
        
    # Solve the problem
    # Using default solver (CBC) and quiet mode
    solver = pulp.PULP_CBC_CMD(msg=False)
    status = prob.solve(solver)
    
    status_str = pulp.LpStatus[status]
    return prob, pulp_vars, pulp_constrs, status_str

@router.post("/solve", response_model=LPSolutionOutput)
def solve_lp(payload: LPProblemInput):
    try:
        prob, pulp_vars, pulp_constrs, status_str = solve_lp_helper(
            payload.objective, payload.variables, payload.constraints
        )
        
        if status_str != "Optimal":
            # Return variables with 0 and status if not optimal
            return LPSolutionOutput(
                status=status_str,
                objective_value=None,
                variables=[VariableOutput(name=v.name, value=0.0, reduced_cost=0.0) for v in payload.variables],
                constraints=[ConstraintOutput(name=c.name, slack=0.0, shadow_price=0.0) for c in payload.constraints]
            )
            
        obj_val = pulp.value(prob.objective)
        
        # Build variable results
        var_results = []
        for v in payload.variables:
            pv = pulp_vars[v.name]
            val = pv.varValue if pv.varValue is not None else 0.0
            # Reduced cost (dj) is available in continuous optimization
            rc = pv.dj if pv.dj is not None else 0.0
            var_results.append(VariableOutput(name=v.name, value=val, reduced_cost=rc))
            
        # Build constraint results and compute sensitivity ranges
        constr_results = []
        for c in payload.constraints:
            pc = pulp_constrs[c.name]
            slack = pc.slack if pc.slack is not None else 0.0
            shadow_price = pc.pi if pc.pi is not None else 0.0
            
            # Simple sensitivity analysis:
            # If constraint is non-binding (shadow_price == 0), the RHS can go down by the slack, and up to infinity.
            # If binding (shadow_price != 0), we find ranges by perturbing RHS and resolving.
            rhs_low = None
            rhs_high = None
            
            if abs(shadow_price) < 1e-6:
                # Non-binding constraint
                if c.operator == "<=":
                    rhs_low = c.rhs - slack
                    rhs_high = float("inf")
                elif c.operator == ">=":
                    rhs_low = float("-inf")
                    rhs_high = c.rhs + slack
            else:
                # Binding constraint: perform numeric ranging by resolving with perturbed RHS
                # We perturb RHS by steps to find where shadow price changes or problem becomes infeasible
                original_rhs = c.rhs
                
                # Allowable Decrease (rhsLow)
                step = max(abs(original_rhs) * 0.05, 0.5)
                current_rhs = original_rhs
                for _ in range(20):
                    current_rhs -= step
                    # Resolve LP with new RHS
                    # Modify constraints directly in pulp
                    pc.changeRHS(current_rhs)
                    # Resolve
                    temp_prob = copy.deepcopy(prob)
                    solver = pulp.PULP_CBC_CMD(msg=False)
                    temp_status = temp_prob.solve(solver)
                    # If status changes or shadow price of this constraint changes significantly, stop
                    if pulp.LpStatus[temp_status] != "Optimal":
                        rhs_low = current_rhs + step
                        break
                    temp_pc = temp_prob.constraints[_pulp_safe_name(c.name, "c")]
                    if abs(temp_pc.pi - shadow_price) > 1e-4:
                        rhs_low = current_rhs
                        break
                if rhs_low is None:
                    rhs_low = original_rhs - 100.0  # fallback
                    
                # Allowable Increase (rhsHigh)
                current_rhs = original_rhs
                for _ in range(20):
                    current_rhs += step
                    pc.changeRHS(current_rhs)
                    temp_prob = copy.deepcopy(prob)
                    solver = pulp.PULP_CBC_CMD(msg=False)
                    temp_status = temp_prob.solve(solver)
                    if pulp.LpStatus[temp_status] != "Optimal":
                        rhs_high = current_rhs - step
                        break
                    temp_pc = temp_prob.constraints[_pulp_safe_name(c.name, "c")]
                    if abs(temp_pc.pi - shadow_price) > 1e-4:
                        rhs_high = current_rhs
                        break
                if rhs_high is None:
                    rhs_high = original_rhs + 100.0  # fallback
                
                # Restore original RHS
                pc.changeRHS(original_rhs)
            
            # Format infinity for JSON compatibility (replace float('inf') with None or large/string value if needed, 
            # but standard is to return null or string, or a large number. Let's use string 'inf' or large numbers)
            constr_results.append(ConstraintOutput(
                name=c.name,
                slack=slack,
                shadow_price=shadow_price,
                rhsLow=rhs_low if (rhs_low is not None and not np.isinf(rhs_low)) else None,
                rhsHigh=rhs_high if (rhs_high is not None and not np.isinf(rhs_high)) else None
            ))
            
        method_used, steps, steps_note = _build_steps(payload)

        return LPSolutionOutput(
            status=status_str,
            objective_value=obj_val,
            variables=var_results,
            constraints=constr_results,
            method_used=method_used,
            steps=steps,
            steps_note=steps_note
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _build_steps(payload: LPProblemInput):
    """Corre el motor Simplex tabular propio para exponer el detalle paso a paso pedido por
    la rúbrica (Simplex / Dos Fases / Gran M). Solo soporta variables continuas con cota
    inferior 0 y sin cota superior; para PLE o variables acotadas se usa únicamente CBC
    (arriba) y aquí se explica por qué no hay pasos."""
    if payload.method == "none":
        return None, None, None

    unsupported = any(
        v.isInteger or v.upBound is not None or (v.lowBound not in (0.0, None))
        for v in payload.variables
    )
    if unsupported:
        return None, None, (
            "El tableau paso a paso no está disponible para este modelo: el motor Simplex "
            "educativo solo soporta variables continuas con cota inferior 0 y sin cota superior "
            "(no variables enteras/binarias ni acotadas). El resultado numérico de arriba sí es "
            "exacto, calculado con CBC."
        )

    try:
        var_names = [v.name for v in payload.variables]
        obj_coeffs = [v.objCoef for v in payload.variables]
        constraints_dicts = [
            {"name": c.name, "coefficients": c.coefficients, "operator": c.operator, "rhs": c.rhs}
            for c in payload.constraints
        ]
        requested = (payload.method or "auto").lower()
        has_ge_or_eq = any(c.operator != "<=" for c in payload.constraints)

        if requested == "simplex" or (requested == "auto" and not has_ge_or_eq):
            result = solve_standard_simplex(payload.objective, var_names, obj_coeffs, constraints_dicts)
        elif requested == "granm":
            result = solve_big_m(payload.objective, var_names, obj_coeffs, constraints_dicts)
        else:  # "dosfases" o "auto" con restricciones >= / =
            result = solve_two_phase(payload.objective, var_names, obj_coeffs, constraints_dicts)

        return result["method"], result["steps"], None
    except Exception as step_err:
        return None, None, f"No se pudo generar el detalle paso a paso: {step_err}"
