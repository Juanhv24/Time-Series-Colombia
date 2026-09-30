"""Evaluación del pronóstico frente a la caminata aleatoria."""

import numpy as np
import pandas as pd
from arch import arch_model
from scipy import stats
from statsmodels.tsa.stattools import acf

from trm import config
from trm.modelo import ajustar_garch, ajustar_media, ajustar_modelo, residuos_media
from trm.pruebas import banda


def pronostico_estatico(X: pd.Series, h: int = config.HORIZONTE, nivel: float = config.NIVEL):
    """Reserva los últimos h meses, estima el modelo con los anteriores y pronostica todo el tramo de una vez.

    Devuelve una tabla en COP/USD con la TRM real, la caminata aleatoria (último valor observado),
    el pronóstico del ARIMA y los intervalos con varianza constante y con GARCH(1,1)-t, junto con
    el modelo estimado sobre el entrenamiento.
    """
    X_train, X_test = X.iloc[:-h], X.iloc[-h:]
    modelo = ajustar_modelo(X_train)
    tabla = modelo.pronostico(pasos=h, nivel=nivel)
    tabla.insert(0, "real", np.exp(X_test / 100).values)
    tabla.insert(1, "caminata", np.exp(X_train.iloc[-1] / 100))
    return tabla, modelo


def pronostico_un_paso(X: pd.Series, H: int = config.VENTANA_UN_PASO):
    """Pronósticos a un paso sobre los últimos H meses con parámetros fijos.

    Los parámetros se estiman con los datos anteriores a la ventana y se mantienen fijos, de modo que
    cada pronóstico usa únicamente la información disponible hasta el mes anterior. La tabla queda en
    la escala del log-nivel X, donde se evalúa la calibración de los intervalos.
    """
    X_ini = X.iloc[:-H]
    media_ini = ajustar_media(X_ini)
    filtro = media_ini.apply(X)                       # mismos parámetros sobre toda la serie
    prediccion = filtro.get_prediction(start=X.index[-H])

    garch_ini = ajustar_garch(residuos_media(media_ini))
    sigma_garch = (arch_model(residuos_media(filtro), mean="Zero", vol="GARCH", p=1, q=1, dist="t")
                   .fix(garch_ini.params).conditional_volatility.iloc[-H:])

    tabla = pd.DataFrame({
        "real": X.iloc[-H:],
        "arima": prediccion.predicted_mean,
        "caminata": X.shift(1).iloc[-H:],
        "sigma_garch": sigma_garch,
    })
    info = {
        "fin_estimacion": X_ini.index[-1],
        "theta": float(media_ini.params["ma.L1"]),
        "deriva": float(media_ini.params["intercept"]),
        "sigma_constante": float(np.sqrt(media_ini.params["sigma2"])),
        "nu": float(garch_ini.params["nu"]),
    }
    return tabla, info


def cuantil_t(nivel: float, nu: float) -> float:
    """Cuantil de la t de Student estandarizada a varianza unitaria."""
    return stats.t.ppf(0.5 + nivel / 2, nu) * np.sqrt((nu - 2) / nu)


def limites_un_paso(tabla: pd.DataFrame, info: dict, nivel: float = config.NIVEL) -> pd.DataFrame:
    """Intervalos a un paso en COP/USD con varianza constante y con GARCH(1,1)-t."""
    z_n = stats.norm.ppf(0.5 + nivel / 2)
    z_t = cuantil_t(nivel, info["nu"])
    return pd.DataFrame({
        "inf_constante": np.exp((tabla["arima"] - z_n * info["sigma_constante"]) / 100),
        "sup_constante": np.exp((tabla["arima"] + z_n * info["sigma_constante"]) / 100),
        "inf_garch": np.exp((tabla["arima"] - z_t * tabla["sigma_garch"]) / 100),
        "sup_garch": np.exp((tabla["arima"] + z_t * tabla["sigma_garch"]) / 100),
    }, index=tabla.index)


def calibracion(tabla: pd.DataFrame, info: dict, niveles=(0.95, 0.99), como_texto: bool = True) -> pd.DataFrame:
    """Proporción de meses por fuera del intervalo y ancho medio en pesos, por nivel de confianza.

    Con como_texto=False las proporciones se devuelven como fracciones, para exportarlas al tablero.
    """
    filas = []
    error = (tabla["real"] - tabla["arima"]).abs()
    pct = (lambda v: f"{v:.1%}") if como_texto else (lambda v: round(float(v), 4))
    for nivel in niveles:
        lim = limites_un_paso(tabla, info, nivel)
        z_n = stats.norm.ppf(0.5 + nivel / 2)
        z_t = cuantil_t(nivel, info["nu"])
        filas.append({
            "Nivel": f"{nivel:.0%}" if como_texto else nivel,
            "Esperado fuera": pct(1 - nivel),
            "Fuera var. constante": pct((error > z_n * info["sigma_constante"]).mean()),
            "Fuera GARCH-t": pct((error > z_t * tabla["sigma_garch"]).mean()),
            "Ancho var. constante": round(float((lim["sup_constante"] - lim["inf_constante"]).mean()), 1),
            "Ancho GARCH-t": round(float((lim["sup_garch"] - lim["inf_garch"]).mean()), 1),
        })
    return pd.DataFrame(filas)


def estabilidad_acf(y: pd.Series, tramos) -> pd.DataFrame:
    """Autocorrelación de primer orden del log-retorno en distintos tramos de la muestra."""
    filas = []
    for inicio, fin in tramos:
        tramo = y.loc[inicio:fin]
        filas.append({
            "Tramo": f"{tramo.index[0]:%Y-%m} a {tramo.index[-1]:%Y-%m}",
            "n": len(tramo),
            "ACF(1)": round(acf(tramo, nlags=1)[1], 4),
            "Umbral": f"±{banda(len(tramo)):.4f}",
        })
    return pd.DataFrame(filas)
