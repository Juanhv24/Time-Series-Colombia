"""Modelo final de la TRM mensual: ARIMA(0,1,1) con constante para la media y GARCH(1,1)-t para la varianza.

La estimación se realiza en dos etapas, primero la media y luego el GARCH sobre sus residuos,
ya que la librería arch no admite términos de media móvil en la ecuación de la media.
"""

from dataclasses import dataclass

import numpy as np
import pandas as pd
from arch import arch_model
from statsmodels.tsa.statespace.sarimax import SARIMAX

from trm import config


def ajustar_media(X: pd.Series, orden=config.ORDEN_MEDIA, constante: bool = True):
    """ARIMA sobre el log-nivel X_t = 100·log(TRM mensual); con d = 1 la constante es la deriva mensual."""
    return SARIMAX(X, order=orden, trend="c" if constante else "n").fit(disp=False)


def ajustar_garch(residuos: pd.Series, distribucion: str = "t"):
    """GARCH(1,1) de media cero sobre los residuos del ARIMA."""
    return arch_model(residuos, mean="Zero", vol="GARCH", p=1, q=1, dist=distribucion).fit(disp="off")


def residuos_media(media) -> pd.Series:
    """Residuos del ARIMA sin la primera observación, que corresponde a la inicialización del nivel."""
    return media.resid.iloc[1:]


def simular_log_nivel(media, garch, x_ultimo: float, e_ultimo: float, pasos: int,
                      n_sim: int = config.N_SIMULACIONES, semilla: int = config.SEMILLA) -> np.ndarray:
    """Trayectorias simuladas de X_t con la media del ARIMA(0,1,1) y choques del GARCH(1,1)-t.

    Devuelve una matriz de forma (n_sim, pasos). Los choques t de Student se estandarizan a
    varianza unitaria y se generan con semilla fija, de modo que la simulación es reproducible.
    """
    c, theta = media.params["intercept"], media.params["ma.L1"]
    nu = garch.params["nu"]
    generador = np.random.default_rng(semilla)

    def choques(tamano):
        return generador.standard_t(nu, tamano) * np.sqrt((nu - 2) / nu)

    sim = garch.forecast(horizon=pasos, method="simulation", simulations=n_sim, reindex=False, rng=choques)
    e = sim.simulations.residuals[-1]                                  # (n_sim, pasos)
    e_previo = np.column_stack([np.full(n_sim, e_ultimo), e[:, :-1]])
    return x_ultimo + np.cumsum(c + e + theta * e_previo, axis=1)


@dataclass
class ModeloTRM:
    """Media y varianza estimadas sobre el log-nivel X de la TRM mensual."""

    X: pd.Series
    media: object
    garch: object

    @property
    def residuos(self) -> pd.Series:
        return residuos_media(self.media)

    def trayectorias(self, pasos: int = config.HORIZONTE, n_sim: int = config.N_SIMULACIONES,
                     semilla: int = config.SEMILLA) -> np.ndarray:
        """Trayectorias simuladas del log-nivel para los meses siguientes al último observado."""
        return simular_log_nivel(self.media, self.garch, self.X.iloc[-1], self.residuos.iloc[-1],
                                 pasos, n_sim, semilla)

    def pronostico(self, pasos: int = config.HORIZONTE, nivel: float = config.NIVEL,
                   n_sim: int = config.N_SIMULACIONES, semilla: int = config.SEMILLA) -> pd.DataFrame:
        """Pronóstico puntual e intervalos en COP/USD, con varianza constante y con GARCH(1,1)-t.

        El pronóstico puntual es el mismo en ambos casos; la diferencia está en los intervalos.
        Los del GARCH se obtienen como percentiles de las trayectorias simuladas.
        """
        f = self.media.get_forecast(steps=pasos)
        ic = f.conf_int(alpha=1 - nivel)
        tray = self.trayectorias(pasos, n_sim, semilla)
        cola = (1 - nivel) / 2 * 100
        return pd.DataFrame({
            "pronostico": np.exp(f.predicted_mean / 100),
            "inf_constante": np.exp(ic.iloc[:, 0] / 100),
            "sup_constante": np.exp(ic.iloc[:, 1] / 100),
            "inf_garch": np.exp(np.percentile(tray, cola, axis=0) / 100),
            "sup_garch": np.exp(np.percentile(tray, 100 - cola, axis=0) / 100),
        }, index=f.predicted_mean.index)


def ajustar_modelo(X: pd.Series) -> ModeloTRM:
    """Estima el modelo final en dos etapas sobre el log-nivel X."""
    media = ajustar_media(X)
    garch = ajustar_garch(residuos_media(media))
    return ModeloTRM(X=X, media=media, garch=garch)


def probabilidad_superar(trayectorias: np.ndarray, umbral: float) -> np.ndarray:
    """Proporción de trayectorias simuladas en que la TRM mensual supera el umbral, por horizonte."""
    return (np.exp(trayectorias / 100) > umbral).mean(axis=0)
