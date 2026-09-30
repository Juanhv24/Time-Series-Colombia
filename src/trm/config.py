"""Rutas, fuentes de datos y parámetros compartidos por los notebooks, el paquete y el tablero."""

from pathlib import Path

import pandas as pd

# Raíz del repositorio. Solo existe como tal cuando el paquete se usa desde el proyecto
# (uv sync o pip install -e .); instalado desde GitHub, por ejemplo en Colab, no hay raíz.
RAIZ = Path(__file__).resolve().parents[2]
EN_REPOSITORIO = (RAIZ / "pyproject.toml").exists()

DATA_RAW = RAIZ / "data" / "raw"
ARCHIVO_TRM = DATA_RAW / "Tasa de cambio del peso colombiano.csv"
URL_TRM = (
    "https://raw.githubusercontent.com/Juanhv24/Time-Series-Colombia/"
    "main/data/raw/Tasa%20de%20cambio%20del%20peso%20colombiano.csv"
)

FIGURAS = RAIZ / "reports" / "figures"
SITIO_DATA = RAIZ / "docs" / "data"

# Colombia mantuvo un régimen de banda cambiaria hasta esta fecha; desde entonces la tasa flota libremente.
FIN_BANDA_CAMBIARIA = pd.Timestamp("1999-09-25")

# Modelo final: ARIMA(0,1,1) con constante para la media y GARCH(1,1) con innovaciones t para la varianza
ORDEN_MEDIA = (0, 1, 1)

# Evaluación y simulación del pronóstico
HORIZONTE = 12            # meses del pronóstico estático y del pronóstico final
VENTANA_UN_PASO = 120     # pronósticos a un paso en la evaluación
NIVEL = 0.95
N_SIMULACIONES = 5000
SEMILLA = 2026
