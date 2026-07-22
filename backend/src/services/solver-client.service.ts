/**
 * Cliente HTTP hacia el Solver Service (Python/FastAPI). Un método por
 * módulo, cada uno hace un POST simple al endpoint /solve correspondiente y
 * propaga el detalle del error de FastAPI si algo falla, para que el
 * controlador que lo llamó pueda mostrar un mensaje útil.
 */
import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const SOLVER_SERVICE_URL = process.env.SOLVER_SERVICE_URL || 'http://localhost:8000/api/v1';

export class SolverClientService {
  public static async solveLP(problemData: any): Promise<any> {
    try {
      const response = await axios.post(`${SOLVER_SERVICE_URL}/lp/solve`, problemData);
      return response.data;
    } catch (error: any) {
      const detail = error.response?.data?.detail || error.message;
      throw new Error(`Solver Service (LP) failed: ${detail}`);
    }
  }

  public static async solveTransport(problemData: any): Promise<any> {
    try {
      const response = await axios.post(`${SOLVER_SERVICE_URL}/transport/solve`, problemData);
      return response.data;
    } catch (error: any) {
      const detail = error.response?.data?.detail || error.message;
      throw new Error(`Solver Service (Transport) failed: ${detail}`);
    }
  }

  public static async solveNetworks(problemData: any): Promise<any> {
    try {
      const response = await axios.post(`${SOLVER_SERVICE_URL}/networks/solve`, problemData);
      return response.data;
    } catch (error: any) {
      const detail = error.response?.data?.detail || error.message;
      throw new Error(`Solver Service (Networks) failed: ${detail}`);
    }
  }

  public static async solveDynamic(problemData: any): Promise<any> {
    try {
      const response = await axios.post(`${SOLVER_SERVICE_URL}/dynamic/solve`, problemData);
      return response.data;
    } catch (error: any) {
      const detail = error.response?.data?.detail || error.message;
      throw new Error(`Solver Service (Dynamic) failed: ${detail}`);
    }
  }

  public static async solveInventories(problemData: any): Promise<any> {
    try {
      const response = await axios.post(`${SOLVER_SERVICE_URL}/inventories/solve`, problemData);
      return response.data;
    } catch (error: any) {
      const detail = error.response?.data?.detail || error.message;
      throw new Error(`Solver Service (Inventories) failed: ${detail}`);
    }
  }
}
