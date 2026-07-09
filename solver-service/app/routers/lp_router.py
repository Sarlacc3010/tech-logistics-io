from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
import pulp
import numpy as np
import copy
import io
import base64
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

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
    algorithm: Optional[str] = "auto"

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
    graph_image: Optional[str] = None
    algorithm: Optional[str] = None

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
            v.name,
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
        
        prob += constr_obj, c.name
        pulp_constrs[c.name] = prob.constraints[c.name]
        
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
                    temp_pc = temp_prob.constraints[c.name]
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
                    temp_pc = temp_prob.constraints[c.name]
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
            
        graph_base64 = None
        if payload.algorithm == "graphical" and len(payload.variables) == 2:
            try:
                v1, v2 = payload.variables[0], payload.variables[1]
                fig, ax = plt.subplots(figsize=(8, 6))
                
                max_x = max([v1.upBound or 0, 10])
                for c in payload.constraints:
                    c1 = c.coefficients.get(v1.name, 0)
                    if c1 > 0:
                        max_x = max(max_x, c.rhs / c1)
                        
                x = np.linspace(0, max_x * 1.5, 400)
                y_lower = np.zeros_like(x)
                y_upper = np.full_like(x, np.inf)
                if v2.upBound is not None:
                    y_upper = np.minimum(y_upper, v2.upBound)
                    
                for c in payload.constraints:
                    c1 = c.coefficients.get(v1.name, 0)
                    c2 = c.coefficients.get(v2.name, 0)
                    rhs = c.rhs
                    if c2 == 0:
                        if c1 > 0:
                            ax.axvline(x=rhs/c1, color='gray', linestyle='--')
                        continue
                        
                    y_line = (rhs - c1*x) / c2
                    ax.plot(x, y_line, label=f'{c.name}')
                    
                    if c.operator == '<=':
                        if c2 > 0:
                            y_upper = np.minimum(y_upper, y_line)
                        else:
                            y_lower = np.maximum(y_lower, y_line)
                    elif c.operator == '>=':
                        if c2 > 0:
                            y_lower = np.maximum(y_lower, y_line)
                        else:
                            y_upper = np.minimum(y_upper, y_line)
                            
                y_upper_plot = np.maximum(y_upper, y_lower)
                y_upper_plot[np.isinf(y_upper_plot)] = max_x * 1.5
                ax.fill_between(x, y_lower, y_upper_plot, where=(y_upper_plot >= y_lower), alpha=0.3, color='green', label='Región Factible')
                
                x_opt = pulp_vars[v1.name].varValue
                y_opt = pulp_vars[v2.name].varValue
                if x_opt is not None and y_opt is not None:
                    ax.plot(x_opt, y_opt, 'ro', markersize=8, label=f'Óptimo: ({x_opt:.1f}, {y_opt:.1f})')
                    c1_obj = v1.objCoef
                    c2_obj = v2.objCoef
                    if c2_obj != 0 and obj_val is not None:
                        y_obj = (obj_val - c1_obj * x) / c2_obj
                        ax.plot(x, y_obj, 'r--', label=f'Función Obj.')
                        
                ax.set_xlim(0, max_x * 1.2)
                ax.set_ylim(0, max_x * 1.2)
                ax.set_xlabel(v1.name)
                ax.set_ylabel(v2.name)
                ax.set_title("Método Gráfico")
                ax.legend(loc='upper right', fontsize='small')
                ax.grid(True, alpha=0.3)
                
                buf = io.BytesIO()
                plt.savefig(buf, format='png', bbox_inches='tight', dpi=100)
                buf.seek(0)
                graph_base64 = "data:image/png;base64," + base64.b64encode(buf.read()).decode('utf-8')
                plt.close(fig)
            except Exception as plot_err:
                print(f"Plotting error: {plot_err}")

        return LPSolutionOutput(
            status=status_str,
            objective_value=obj_val,
            variables=var_results,
            constraints=constr_results,
            graph_image=graph_base64,
            algorithm=payload.algorithm
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
