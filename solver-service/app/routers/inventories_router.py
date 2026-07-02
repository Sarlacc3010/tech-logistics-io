from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
import numpy as np

router = APIRouter()

class InventoryProblemInput(BaseModel):
    calc_type: str  # "eoq" or "abc"
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
            
            return InventorySolutionOutput(
                calc_type=payload.calc_type,
                status="Optimal",
                result={
                    "eoq": float(eoq),
                    "reorder_point": float(reorder_point),
                    "safety_stock": float(safety_stock),
                    "total_cost": float(total_cost)
                }
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
            
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported Inventory calculation type: {payload.calc_type}")
            
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
