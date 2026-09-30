"""Pruebas estadísticas y métricas que se repiten a lo largo del proyecto."""

import warnings

import numpy as np
import pandas as pd
from scipy import stats
from statsmodels.tsa.stattools import acf, adfuller, kpss, pacf


def banda(n: int) -> float:
    """Umbral de significancia ±1.96/√n de la ACF y la PACF bajo la hipótesis nula de ruido blanco."""
    return 1.96 / np.sqrt(n)


def estacionariedad(serie: pd.Series, nombre: str, alfa: float = 0.05) -> dict:
    """ADF y KPSS aplicadas de forma conjunta, ya que sus hipótesis nulas son opuestas.

    La serie se clasifica como estacionaria solo si ADF rechaza la raíz unitaria y KPSS no rechaza
    la estacionariedad.
    """
    serie = serie.dropna()
    adf_est, adf_p = adfuller(serie, autolag="AIC")[:2]
    with warnings.catch_warnings():
        # KPSS interpola su p-valor en una tabla acotada entre 0.01 y 0.10
        warnings.simplefilter("ignore")
        kpss_est, kpss_p = kpss(serie, regression="c", nlags="auto")[:2]
    kpss_txt = "< 0.01" if kpss_p <= 0.01 else ("> 0.10" if kpss_p >= 0.10 else f"{kpss_p:.4f}")
    estacionaria = adf_p < alfa and kpss_p >= alfa
    return {
        "Serie": nombre,
        "ADF estadístico": round(adf_est, 4),
        "ADF p-valor": f"{adf_p:.4f}",
        "KPSS estadístico": round(kpss_est, 4),
        "KPSS p-valor": kpss_txt,
        "Conclusión": "estacionaria" if estacionaria else "no estacionaria",
    }


def tabla_autocorrelacion(serie: pd.Series, rezagos) -> pd.DataFrame:
    """ACF y PACF en los rezagos indicados, con su comparación frente al umbral de significancia."""
    rezagos = list(range(1, rezagos + 1)) if isinstance(rezagos, int) else list(rezagos)
    maximo = max(rezagos)
    a, p = acf(serie, nlags=maximo), pacf(serie, nlags=maximo)
    umbral = banda(len(serie))
    tabla = pd.DataFrame({
        "rezago": rezagos,
        "ACF": [round(a[k], 4) for k in rezagos],
        "PACF": [round(p[k], 4) for k in rezagos],
    })
    tabla["ACF signif."] = np.where(tabla["ACF"].abs() > umbral, "Sí", "No")
    tabla["PACF signif."] = np.where(tabla["PACF"].abs() > umbral, "Sí", "No")
    return tabla


def razon_verosimilitud(restringido, general, contraste: str) -> dict:
    """Prueba de razón de verosimilitud entre dos modelos anidados (Wilks, 1938)."""
    lr = 2 * (general.llf - restringido.llf)
    gl = len(general.params) - len(restringido.params)
    return {"Contraste": contraste, "LR": round(lr, 3), "gl": gl, "p-valor": round(stats.chi2.sf(lr, gl), 4)}


def diebold_mariano(e1, e2, perdida=np.abs) -> tuple[float, float]:
    """Prueba de Diebold y Mariano (1995) para pronósticos a un paso; H0: igual precisión.

    Un estadístico positivo indica que el primer pronóstico tiene mayor pérdida que el segundo.
    """
    d = perdida(np.asarray(e1)) - perdida(np.asarray(e2))
    estadistico = d.mean() / np.sqrt(d.var(ddof=1) / len(d))
    return float(estadistico), float(2 * stats.norm.sf(abs(estadistico)))


def metricas(real, pronostico) -> dict:
    """MAE, RMSE y MAPE sobre la TRM en pesos por dólar (Hyndman & Koehler, 2006)."""
    real, pronostico = np.asarray(real, dtype=float), np.asarray(pronostico, dtype=float)
    error = real - pronostico
    return {
        "MAE": float(np.mean(np.abs(error))),
        "RMSE": float(np.sqrt(np.mean(error ** 2))),
        "MAPE (%)": float(np.mean(np.abs(error) / np.abs(real)) * 100),
    }
