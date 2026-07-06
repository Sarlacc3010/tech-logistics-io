import numpy as np

def balance_transport_problem(supply: list[float], demand: list[float], costs: list[list[float]]):
    """
    Equilibra el problema de transporte si la suma de la oferta no es igual a la suma de la demanda.
    Agrega una fila o columna ficticia con costos 0 según sea necesario.
    """
    supply = np.array(supply, dtype=float)
    demand = np.array(demand, dtype=float)
    costs = np.array(costs, dtype=float)
    
    total_supply = np.sum(supply)
    total_demand = np.sum(demand)
    
    origins = [f"O{i+1}" for i in range(len(supply))]
    destinations = [f"D{j+1}" for j in range(len(demand))]
    
    diff = abs(total_supply - total_demand)
    
    if total_supply > total_demand:
        # Fictitious destination (column)
        demand = np.append(demand, diff)
        fictitious_col = np.zeros((costs.shape[0], 1))
        costs = np.hstack((costs, fictitious_col))
        destinations.append("D_Ficticio")
    elif total_demand > total_supply:
        # Fictitious origin (row)
        supply = np.append(supply, diff)
        fictitious_row = np.zeros((1, costs.shape[1]))
        costs = np.vstack((costs, fictitious_row))
        origins.append("O_Ficticio")
        
    return supply, demand, costs, origins, destinations
