"""Estilo común de las figuras y exportación a reports/figures."""

import matplotlib.pyplot as plt
import seaborn as sns

from trm import config

# Colores usados de forma consistente en los tres notebooks
AZUL = "#1F77B4"
ROJO = "#D62728"
VERDE = "#2CA02C"
MORADO = "#7F3FBF"
GRIS = "#7F7F7F"


def estilo() -> None:
    sns.set_style("whitegrid")
    plt.rcParams["figure.figsize"] = (12, 5)
    plt.rcParams["axes.titleweight"] = "bold"


def guardar(fig, nombre: str) -> None:
    """Guarda la figura en reports/figures cuando el notebook se ejecuta dentro del repositorio."""
    if config.EN_REPOSITORIO:
        config.FIGURAS.mkdir(parents=True, exist_ok=True)
        fig.savefig(config.FIGURAS / nombre, dpi=150, bbox_inches="tight")
