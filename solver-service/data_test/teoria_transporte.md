# Métodos Iniciales del Modelo de Transporte

En Investigación de Operaciones, el problema de transporte busca minimizar el costo total de envío de bienes desde varios orígenes (fábricas, almacenes) hacia varios destinos (tiendas, clientes). 
Antes de llegar a la solución matemática óptima exacta, existen algoritmos heurísticos que nos dan una "solución inicial". A continuación se presentan las características de los tres principales métodos para que sepas cuándo recomendar cada uno:

## 1. Método de la Esquina Noroeste
- **¿Qué hace?** Comienza a asignar envíos desde la esquina superior izquierda (Noroeste) de la matriz de costos y va bajando o moviéndose a la derecha conforme se agotan las ofertas o demandas.
- **Ventaja:** Es el método más rápido, fácil e intuitivo de calcular manualmente. Requiere muy poco esfuerzo computacional.
- **Desventaja (Riesgo):** Ignora por completo los costos de envío. Al no considerar qué ruta es más barata, suele generar la **peor solución inicial** y la más lejana a la solución óptima real.
- **Recomendación:** Recomienda la Esquina Noroeste **solo cuando el cliente o estudiante tenga prisa por encontrar cualquier solución factible inicial**, y no le importe en absoluto ahorrar dinero o minimizar costos.

## 2. Método de Costo Mínimo
- **¿Qué hace?** Busca iterativamente la celda con el menor costo de envío en toda la matriz y le asigna la mayor cantidad de unidades posible, hasta agotar oferta o demanda.
- **Ventaja:** Es una mejora sustancial respecto a la Esquina Noroeste porque sí toma en cuenta los costos directos.
- **Desventaja (Riesgo):** Toma decisiones "cortoplacistas" o golosas (greedy). Al elegir siempre lo más barato al inicio, a veces obliga a asignar las últimas unidades a las celdas más costosas al final del proceso.
- **Recomendación:** Recomienda el Costo Mínimo cuando se busque un **equilibrio entre rapidez de cálculo y un ahorro decente** en comparación con el Noroeste.

## 3. Método de Aproximación de Vogel (VAM)
- **¿Qué hace?** Calcula "penalizaciones" para cada fila y columna. Una penalización es la diferencia entre los dos costos más bajos de esa fila o columna. Representa el "costo de oportunidad" o "multa" que pagaríamos si no escogemos la mejor ruta. Asigna unidades donde la penalización (multa) sea mayor.
- **Ventaja:** Es, de lejos, el **mejor método manual**. Su solución inicial suele ser idéntica o estar al 95% de la solución óptima exacta (Símplex). Al considerar el costo de oportunidad, toma decisiones estratégicas a largo plazo.
- **Desventaja (Riesgo):** Es el más lento y tedioso de calcular a mano porque requiere recalcular penalizaciones en cada iteración.
- **Recomendación:** **Recomienda siempre el Método de Vogel** cuando el objetivo principal de negocio sea **minimizar costos y lograr la mayor eficiencia posible**. Es la mejor opción para gerentes y tomadores de decisiones que buscan acercarse a la solución óptima sin ejecutar métodos avanzados.
