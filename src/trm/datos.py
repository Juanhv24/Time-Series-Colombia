"""Carga de la TRM diaria y construcción de la serie mensual que se modela."""

import numpy as np
import pandas as pd

from trm import config


def cargar_trm(ruta=None) -> pd.Series:
    """TRM diaria en COP/USD indexada por fecha.

    Lee el archivo del repositorio y, si no está disponible (por ejemplo en Colab), lo descarga de GitHub.
    """
    if ruta is None:
        ruta = config.ARCHIVO_TRM if config.ARCHIVO_TRM.exists() else config.URL_TRM
    df = pd.read_csv(ruta)
    df.columns = ["fecha", "trm"]
    df["fecha"] = pd.to_datetime(df["fecha"], format="%Y/%m/%d")
    return df.sort_values("fecha").set_index("fecha")["trm"]


def log_retorno(serie: pd.Series) -> pd.Series:
    """Primera diferencia del logaritmo, en porcentaje."""
    return (np.log(serie).diff() * 100).dropna()


def cobertura_mensual(trm: pd.Series) -> pd.DataFrame:
    """Días con dato frente a días calendario de cada mes."""
    dias = trm.resample("MS").size()
    return pd.DataFrame({
        "días con dato": dias,
        "días del mes": dias.index.days_in_month,
        "completo": dias == dias.index.days_in_month,
    })


def serie_mensual(trm: pd.Series, solo_completos: bool = True) -> pd.Series:
    """Promedio mensual de la TRM.

    Por defecto excluye los meses incompletos de los extremos de la serie, ya que un promedio
    construido con pocos días no es comparable con el de un mes completo.
    """
    mensual = trm.resample("MS").mean()
    if solo_completos:
        mensual = mensual[cobertura_mensual(trm)["completo"]]
    mensual.index.freq = "MS"
    mensual.name = "trm_mensual"
    return mensual


def log_nivel(mensual: pd.Series) -> pd.Series:
    """Serie X_t = 100·log(TRM mensual), sobre la cual se estima el ARIMA."""
    X = 100 * np.log(mensual)
    if isinstance(mensual.index, pd.DatetimeIndex):
        X.index.freq = mensual.index.freq
    X.name = "log_nivel"
    return X


def a_pesos(x):
    """Convierte valores de X_t (100·log) a pesos por dólar."""
    return np.exp(x / 100)
