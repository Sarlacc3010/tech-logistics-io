from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
import numpy as np

from app.algorithms.steps import SolutionStep, StepTracker

router = APIRouter()

class InventoryProblemInput(BaseModel):
    calc_type: str  # "eoq", "abc", "eoq_discounts", "eoq_backorders", "epq", "reorder_point"
    parameters: Dict[str, Any]

class EOQOutput(BaseModel):
    eoq: float
    reorder_point: float
    safety_stock: float
    total_cost: float

class SKUBill(BaseModel):
    sku: str
    annual_value: float
    percentage: float
    cum_percentage: float
    abc_class: str

class ABCClassOutput(BaseModel):
    classification: List[SKUBill]

class InventorySolutionOutput(BaseModel):
    calc_type: str
    status: str
    result: Any
    steps: Optional[List[SolutionStep]] = None

@router.post("/solve", response_model=InventorySolutionOutput)
def solve_inventory(payload: InventoryProblemInput):
    try:
        ctype = payload.calc_type.lower()
        
        if ctype == "eoq":
            # EOQ parameters
            demand = payload.parameters.get("annual_demand", 0.0)      # D
            setup_cost = payload.parameters.get("setup_cost", 0.0)      # S
            holding_cost = payload.parameters.get("holding_cost", 0.0)  # H
            lead_time_days = payload.parameters.get("lead_time_days", 0.0)
            daily_demand = demand / 365.0
            
            # For safety stock calculations (using lead time demand standard deviation)
            service_level_z = payload.parameters.get("service_level_z", 1.65) # 95% service level default
            demand_std_dev = payload.parameters.get("demand_std_dev", 0.0) # daily demand standard deviation
            
            if holding_cost <= 0:
                raise HTTPException(status_code=400, detail="holding_cost must be greater than 0")
                
            # EOQ = sqrt((2 * D * S) / H)
            eoq = np.sqrt((2 * demand * setup_cost) / holding_cost)
            
            # Safety Stock = Z * std_dev * sqrt(lead_time_days)
            safety_stock = service_level_z * demand_std_dev * np.sqrt(lead_time_days)
            
            # Reorder Point (ROP) = (daily_demand * lead_time_days) + safety_stock
            reorder_point = (daily_demand * lead_time_days) + safety_stock
            
            # Total cost = (D/Q)*S + (Q/2)*H
            total_cost = (demand / eoq) * setup_cost + (eoq / 2.0) * holding_cost

            tracker = StepTracker()
            tracker.add(
                "Cantidad económica de pedido (EOQ)",
                f"Q* = sqrt(2·D·S / H) = sqrt(2·{demand:g}·{setup_cost:g} / {holding_cost:g}) = {eoq:.4g} unidades.",
                {"formula": "Q* = sqrt(2DS/H)", "D": demand, "S": setup_cost, "H": holding_cost, "result": round(float(eoq), 4)},
            )
            tracker.add(
                "Stock de seguridad y punto de reorden",
                f"SS = Z·σ·sqrt(L) = {service_level_z:g}·{demand_std_dev:g}·sqrt({lead_time_days:g}) = {safety_stock:.4g}. "
                f"ROP = demanda_diaria·L + SS = {daily_demand:.4g}·{lead_time_days:g} + {safety_stock:.4g} = {reorder_point:.4g}.",
                {"safety_stock": round(float(safety_stock), 4), "reorder_point": round(float(reorder_point), 4)},
            )
            tracker.add(
                "Costo total anual",
                f"CT = (D/Q*)·S + (Q*/2)·H = ({demand:g}/{eoq:.4g})·{setup_cost:g} + ({eoq:.4g}/2)·{holding_cost:g} = {total_cost:.4g}.",
                {"total_cost": round(float(total_cost), 4)},
            )

            return InventorySolutionOutput(
                calc_type=payload.calc_type,
                status="Optimal",
                result={
                    "eoq": float(eoq),
                    "reorder_point": float(reorder_point),
                    "safety_stock": float(safety_stock),
                    "total_cost": float(total_cost)
                },
                steps=tracker.steps
            )
            
        elif ctype == "abc":
            # ABC parameters
            skus_data = payload.parameters.get("skus", []) # list of {"sku": "X", "unit_cost": 10, "annual_usage": 100}
            
            items = []
            total_annual_value = 0.0
            
            for s in skus_data:
                name = s.get("sku")
                cost = s.get("unit_cost", 0.0)
                usage = s.get("annual_usage", 0.0)
                val = cost * usage
                total_annual_value += val
                items.append({
                    "sku": name,
                    "annual_value": val
                })
                
            if total_annual_value <= 0:
                raise HTTPException(status_code=400, detail="Total annual value must be greater than 0")
                
            # Sort items by annual value descending
            items.sort(key=lambda x: x["annual_value"], reverse=True)
            
            # Calculate percentages
            cum_val = 0.0
            classification = []
            for item in items:
                val = item["annual_value"]
                pct = (val / total_annual_value) * 100.0
                cum_val += val
                cum_pct = (cum_val / total_annual_value) * 100.0
                
                # Classify: A (top 70-80%), B (next 15-20%), C (remaining 5-10%)
                if cum_pct <= 75.0:
                    abc_class = "A"
                elif cum_pct <= 95.0:
                    abc_class = "B"
                else:
                    abc_class = "C"
                    
                classification.append(SKUBill(
                    sku=item["sku"],
                    annual_value=float(val),
                    percentage=float(pct),
                    cum_percentage=float(cum_pct),
                    abc_class=abc_class
                ))
                
            return InventorySolutionOutput(
                calc_type=payload.calc_type,
                status="Optimal",
                result={"classification": classification}
            )

        elif ctype == "eoq_discounts":
            demand = payload.parameters.get("annual_demand", 0.0)
            setup_cost = payload.parameters.get("setup_cost", 0.0)
            holding_cost_rate = payload.parameters.get("holding_cost_rate", 0.0)  # fracción anual del precio, ej. 0.2
            price_breaks = payload.parameters.get("price_breaks", [])  # [{"min_qty":0,"unit_price":10}, ...] ordenado ascendente por min_qty

            if holding_cost_rate <= 0 or not price_breaks:
                raise HTTPException(status_code=400, detail="holding_cost_rate y price_breaks son requeridos")

            sorted_breaks = sorted(price_breaks, key=lambda b: b["min_qty"])
            tracker = StepTracker()
            candidates = []

            for idx, brk in enumerate(sorted_breaks):
                price = brk["unit_price"]
                holding_cost = holding_cost_rate * price
                eoq_i = float(np.sqrt((2 * demand * setup_cost) / holding_cost))
                lower = brk["min_qty"]
                upper = sorted_breaks[idx + 1]["min_qty"] if idx + 1 < len(sorted_breaks) else float("inf")

                feasible_qty = eoq_i if lower <= eoq_i < upper else (lower if eoq_i < lower else upper)
                total_cost = (demand / feasible_qty) * setup_cost + (feasible_qty / 2.0) * holding_cost + demand * price

                tracker.add(
                    f"Nivel de precio {idx + 1}: ${price:g}/unidad (rango >= {lower:g})",
                    f"Q_EOQ = sqrt(2·{demand:g}·{setup_cost:g} / ({holding_cost_rate:g}·{price:g})) = {eoq_i:.4g}. "
                    + ("Cae dentro del rango del descuento, se usa directamente. " if lower <= eoq_i < upper
                       else f"Cae fuera del rango [{lower:g}, {upper if upper != float('inf') else '∞'}), se ajusta a la cantidad factible más cercana ({feasible_qty:.4g}). ")
                    + f"Costo total = {total_cost:.4g}.",
                    {"unit_price": price, "eoq_unrestricted": round(eoq_i, 4), "feasible_qty": round(feasible_qty, 4), "total_cost": round(total_cost, 4)},
                )
                candidates.append({"unit_price": price, "order_qty": feasible_qty, "total_cost": total_cost})

            best = min(candidates, key=lambda c: c["total_cost"])
            tracker.add(
                "Mejor alternativa",
                f"Se compara el costo total de cada nivel de precio; el mínimo se obtiene pidiendo "
                f"{best['order_qty']:.4g} unidades al precio ${best['unit_price']:g}, con costo total {best['total_cost']:.4g}.",
                {"best": best},
            )

            return InventorySolutionOutput(
                calc_type=payload.calc_type, status="Optimal",
                result={"candidates": candidates, "best_option": best}, steps=tracker.steps,
            )

        elif ctype == "eoq_backorders":
            demand = payload.parameters.get("annual_demand", 0.0)
            setup_cost = payload.parameters.get("setup_cost", 0.0)
            holding_cost = payload.parameters.get("holding_cost", 0.0)
            backorder_cost = payload.parameters.get("backorder_cost", 0.0)

            if holding_cost <= 0 or backorder_cost <= 0:
                raise HTTPException(status_code=400, detail="holding_cost y backorder_cost deben ser mayores a 0")

            eoq = float(np.sqrt((2 * demand * setup_cost / holding_cost) * ((holding_cost + backorder_cost) / backorder_cost)))
            max_shortage = eoq * holding_cost / (holding_cost + backorder_cost)
            max_inventory = eoq - max_shortage
            total_cost = float(np.sqrt(2 * demand * setup_cost * holding_cost * backorder_cost / (holding_cost + backorder_cost)))

            tracker = StepTracker()
            tracker.add(
                "Cantidad óptima con faltantes permitidos",
                f"Q* = sqrt((2DS/H)·((H+B)/B)) = sqrt((2·{demand:g}·{setup_cost:g}/{holding_cost:g})·"
                f"(({holding_cost:g}+{backorder_cost:g})/{backorder_cost:g})) = {eoq:.4g} unidades.",
                {"formula": "Q* = sqrt((2DS/H)((H+B)/B))", "result": round(eoq, 4)},
            )
            tracker.add(
                "Nivel máximo de faltante e inventario máximo",
                f"S* = Q*·H/(H+B) = {eoq:.4g}·{holding_cost:g}/({holding_cost:g}+{backorder_cost:g}) = {max_shortage:.4g}. "
                f"Inventario máximo Im = Q*-S* = {max_inventory:.4g}.",
                {"max_shortage": round(max_shortage, 4), "max_inventory": round(max_inventory, 4)},
            )
            tracker.add(
                "Costo total anual",
                f"CT = sqrt(2·D·S·H·B/(H+B)) = {total_cost:.4g}.",
                {"total_cost": round(total_cost, 4)},
            )

            return InventorySolutionOutput(
                calc_type=payload.calc_type, status="Optimal",
                result={
                    "eoq": eoq, "max_shortage": max_shortage, "max_inventory": max_inventory,
                    "total_cost": total_cost,
                },
                steps=tracker.steps,
            )

        elif ctype == "epq":
            demand = payload.parameters.get("annual_demand", 0.0)
            setup_cost = payload.parameters.get("setup_cost", 0.0)
            holding_cost = payload.parameters.get("holding_cost", 0.0)
            production_rate = payload.parameters.get("production_rate", 0.0)

            if holding_cost <= 0 or production_rate <= demand:
                raise HTTPException(status_code=400, detail="holding_cost debe ser > 0 y production_rate debe ser mayor a annual_demand")

            factor = 1.0 - (demand / production_rate)
            eoq = float(np.sqrt((2 * demand * setup_cost) / (holding_cost * factor)))
            max_inventory = eoq * factor
            total_cost = float(np.sqrt(2 * demand * setup_cost * holding_cost * factor))
            run_time_days = (eoq / production_rate) * 365.0
            cycle_time_days = (eoq / demand) * 365.0

            tracker = StepTracker()
            tracker.add(
                "Lote económico de producción (EPQ)",
                f"Q* = sqrt(2·D·S / (H·(1-D/P))) = sqrt(2·{demand:g}·{setup_cost:g} / "
                f"({holding_cost:g}·(1-{demand:g}/{production_rate:g}))) = {eoq:.4g} unidades.",
                {"formula": "Q* = sqrt(2DS / (H(1-D/P)))", "result": round(eoq, 4)},
            )
            tracker.add(
                "Inventario máximo y tiempos de ciclo",
                f"Imax = Q*·(1-D/P) = {eoq:.4g}·{factor:.4g} = {max_inventory:.4g}. "
                f"Duración de la corrida de producción = {run_time_days:.4g} días; ciclo total = {cycle_time_days:.4g} días.",
                {"max_inventory": round(max_inventory, 4), "run_time_days": round(run_time_days, 4), "cycle_time_days": round(cycle_time_days, 4)},
            )
            tracker.add(
                "Costo total anual",
                f"CT = sqrt(2·D·S·H·(1-D/P)) = {total_cost:.4g}.",
                {"total_cost": round(total_cost, 4)},
            )

            return InventorySolutionOutput(
                calc_type=payload.calc_type, status="Optimal",
                result={
                    "eoq": eoq, "max_inventory": max_inventory, "total_cost": total_cost,
                    "run_time_days": run_time_days, "cycle_time_days": cycle_time_days,
                },
                steps=tracker.steps,
            )

        elif ctype == "reorder_point":
            daily_demand = payload.parameters.get("daily_demand", 0.0)
            lead_time_days = payload.parameters.get("lead_time_days", 0.0)
            service_level_z = payload.parameters.get("service_level_z", 0.0)
            demand_std_dev = payload.parameters.get("demand_std_dev", 0.0)

            safety_stock = service_level_z * demand_std_dev * float(np.sqrt(lead_time_days))
            reorder_point = daily_demand * lead_time_days + safety_stock

            tracker = StepTracker()
            tracker.add(
                "Stock de seguridad",
                f"SS = Z·σ_d·sqrt(L) = {service_level_z:g}·{demand_std_dev:g}·sqrt({lead_time_days:g}) = {safety_stock:.4g}.",
                {"safety_stock": round(safety_stock, 4)},
            )
            tracker.add(
                "Punto de reorden",
                f"ROP = d̄·L + SS = {daily_demand:g}·{lead_time_days:g} + {safety_stock:.4g} = {reorder_point:.4g}.",
                {"reorder_point": round(reorder_point, 4)},
            )

            return InventorySolutionOutput(
                calc_type=payload.calc_type, status="Optimal",
                result={"safety_stock": safety_stock, "reorder_point": reorder_point},
                steps=tracker.steps,
            )

        else:
            raise HTTPException(status_code=400, detail=f"Unsupported Inventory calculation type: {payload.calc_type}")
            
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
