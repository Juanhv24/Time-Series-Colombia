"""Exporta los datos del tablero (docs/data/tablero.json) a partir del modelo final y su evaluación."""

import json
from datetime import date

import numpy as np
import pandas as pd

from trm import config, datos, evaluacion, modelo, pruebas

# Cuantiles de la distribución simulada que usa la calculadora de probabilidad (pasos de 0.25 %)
PROBABILIDADES = np.round(np.arange(0.0025, 1.0, 0.0025), 4)


def _lista(valores, decimales=2):
    return [None if pd.isna(v) else round(float(v), decimales) for v in valores]


def _fechas(indice):
    return [f"{f:%Y-%m}" for f in indice]


def construir_datos() -> dict:
    serie = datos.cargar_trm()
    mensual = datos.serie_mensual(serie)
    X = datos.log_nivel(mensual)

    # Modelo final y pronóstico de los próximos 12 meses
    final = modelo.ajustar_modelo(X)
    pron = final.pronostico(config.HORIZONTE)
    tray = final.trayectorias(config.HORIZONTE)
    bandas = {n: np.exp(np.percentile(tray, [50 - n / 2, 50 + n / 2], axis=0) / 100) for n in (50, 80, 95)}
    cuantiles = np.exp(np.quantile(tray, PROBABILIDADES, axis=0) / 100).T        # (horizonte, cuantiles)

    volatilidad = final.garch.conditional_volatility.reindex(mensual.index)

    # Evaluación: pronósticos a un paso con parámetros fijos y pronóstico estático a 12 meses
    un_paso, info = evaluacion.pronostico_un_paso(X)
    limites = evaluacion.limites_un_paso(un_paso, info)
    real_1, arima_1, rw_1 = (datos.a_pesos(un_paso[c]) for c in ("real", "arima", "caminata"))
    dm_abs = pruebas.diebold_mariano(real_1 - arima_1, real_1 - rw_1, np.abs)
    dm_cuad = pruebas.diebold_mariano(real_1 - arima_1, real_1 - rw_1, np.square)
    calibracion = evaluacion.calibracion(un_paso, info, como_texto=False).rename(columns={
        "Nivel": "nivel", "Esperado fuera": "esperado", "Fuera var. constante": "fuera_constante",
        "Fuera GARCH-t": "fuera_garch", "Ancho var. constante": "ancho_constante", "Ancho GARCH-t": "ancho_garch"})
    estatico, _ = evaluacion.pronostico_estatico(X)

    g = final.garch.params
    return {
        "generado": date.today().isoformat(),
        "datos": {
            "inicio_diaria": f"{serie.index[0]:%Y-%m-%d}",
            "fin_diaria": f"{serie.index[-1]:%Y-%m-%d}",
            "ultima_diaria": round(float(serie.iloc[-1]), 2),
            "primer_mes": f"{mensual.index[0]:%Y-%m}",
            "ultimo_mes": f"{mensual.index[-1]:%Y-%m}",
            "ultimo_mes_valor": round(float(mensual.iloc[-1]), 2),
            "meses": len(mensual),
        },
        "modelo": {
            "deriva": round(float(final.media.params["intercept"]), 4),
            "theta": round(float(final.media.params["ma.L1"]), 4),
            "sigma_constante": round(float(np.sqrt(final.media.params["sigma2"])), 4),
            "omega": round(float(g["omega"]), 4),
            "alpha": round(float(g["alpha[1]"]), 4),
            "beta": round(float(g["beta[1]"]), 4),
            "nu": round(float(g["nu"]), 2),
            "volatilidad_actual": round(float(final.garch.conditional_volatility.iloc[-1]), 4),
            "simulaciones": config.N_SIMULACIONES,
        },
        "historia": {
            "fecha": _fechas(mensual.index),
            "trm": _lista(mensual),
            "volatilidad": _lista(volatilidad, 4),
        },
        "pronostico": {
            "fecha": _fechas(pron.index),
            "central": _lista(pron["pronostico"]),
            "bandas": {str(n): {"inf": _lista(v[0]), "sup": _lista(v[1])} for n, v in bandas.items()},
            "constante95": {"inf": _lista(pron["inf_constante"]), "sup": _lista(pron["sup_constante"])},
            "probabilidades": PROBABILIDADES.tolist(),
            "cuantiles": [_lista(fila) for fila in cuantiles],
        },
        "evaluacion": {
            "fin_estimacion": f"{info['fin_estimacion']:%Y-%m}",
            "un_paso": {
                "fecha": _fechas(un_paso.index),
                "real": _lista(real_1),
                "arima": _lista(arima_1),
                "caminata": _lista(rw_1),
                "inf_garch": _lista(limites["inf_garch"]),
                "sup_garch": _lista(limites["sup_garch"]),
                "inf_constante": _lista(limites["inf_constante"]),
                "sup_constante": _lista(limites["sup_constante"]),
            },
            "metricas": [
                {"modelo": "Caminata aleatoria", **{k: round(v, 2) for k, v in pruebas.metricas(real_1, rw_1).items()}},
                {"modelo": "ARIMA(0,1,1)", **{k: round(v, 2) for k, v in pruebas.metricas(real_1, arima_1).items()}},
            ],
            "diebold_mariano": {"absoluta": round(dm_abs[1], 4), "cuadratica": round(dm_cuad[1], 4)},
            "calibracion": calibracion.to_dict(orient="records"),
            "estatico": {
                "fecha": _fechas(estatico.index),
                "real": _lista(estatico["real"]),
                "caminata": _lista(estatico["caminata"]),
                "arima": _lista(estatico["pronostico"]),
                "metricas": [
                    {"modelo": "Caminata aleatoria", **{k: round(v, 2) for k, v in pruebas.metricas(estatico["real"], estatico["caminata"]).items()}},
                    {"modelo": "ARIMA(0,1,1)", **{k: round(v, 2) for k, v in pruebas.metricas(estatico["real"], estatico["pronostico"]).items()}},
                ],
            },
        },
    }


def exportar(destino=None) -> dict:
    """Escribe tablero.json en docs/data y devuelve el diccionario exportado."""
    destino = destino or config.SITIO_DATA
    destino.mkdir(parents=True, exist_ok=True)
    contenido = construir_datos()
    with open(destino / "tablero.json", "w", encoding="utf-8") as f:
        json.dump(contenido, f, ensure_ascii=False, separators=(",", ":"))
    return contenido
