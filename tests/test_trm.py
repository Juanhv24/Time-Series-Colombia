"""Pruebas de las funciones del paquete trm sobre datos sintéticos y sobre la serie real."""

import numpy as np
import pandas as pd
import pytest

from trm import datos, evaluacion, modelo, pruebas


@pytest.fixture(scope="module")
def diaria_sintetica():
    # Del 28 de enero al 3 de abril: enero y abril quedan incompletos, febrero y marzo completos
    fechas = pd.date_range("2024-01-28", "2024-04-03", freq="D")
    return pd.Series(np.linspace(4000, 4100, len(fechas)), index=fechas)


@pytest.fixture(scope="module")
def X_real():
    return datos.log_nivel(datos.serie_mensual(datos.cargar_trm()))


def test_serie_mensual_excluye_meses_incompletos(diaria_sintetica):
    mensual = datos.serie_mensual(diaria_sintetica)
    assert list(mensual.index.strftime("%Y-%m")) == ["2024-02", "2024-03"]
    assert len(datos.serie_mensual(diaria_sintetica, solo_completos=False)) == 4


def test_log_retorno_y_conversion_a_pesos():
    serie = pd.Series([100.0, 110.0, 99.0])
    r = datos.log_retorno(serie)
    assert r.iloc[0] == pytest.approx(100 * np.log(1.1))
    assert datos.a_pesos(datos.log_nivel(serie)).tolist() == pytest.approx(serie.tolist())


def test_metricas_con_valores_conocidos():
    m = pruebas.metricas([100, 200], [110, 180])
    assert m["MAE"] == pytest.approx(15)
    assert m["RMSE"] == pytest.approx(np.sqrt((100 + 400) / 2))
    assert m["MAPE (%)"] == pytest.approx((10 + 10) / 2)


def test_diebold_mariano_es_antisimetrica():
    rng = np.random.default_rng(1)
    e1, e2 = rng.normal(0, 1, 200), rng.normal(0, 1.3, 200)
    dm_12, p_12 = pruebas.diebold_mariano(e1, e2)
    dm_21, p_21 = pruebas.diebold_mariano(e2, e1)
    assert dm_12 == pytest.approx(-dm_21)
    assert p_12 == pytest.approx(p_21)


def test_datos_reales_sin_meses_incompletos(X_real):
    assert X_real.index[0] == pd.Timestamp("1991-12-01")
    assert X_real.index[-1] == pd.Timestamp("2026-07-01")
    assert len(X_real) == 416


def test_simulacion_reproducible_y_ordenada(X_real):
    m = modelo.ajustar_modelo(X_real)
    a = m.trayectorias(pasos=6, n_sim=500)
    b = m.trayectorias(pasos=6, n_sim=500)
    np.testing.assert_array_equal(a, b)
    pron = m.pronostico(pasos=6, n_sim=500)
    assert (pron["inf_garch"] < pron["pronostico"]).all() and (pron["pronostico"] < pron["sup_garch"]).all()
    # Con un horizonte más largo la incertidumbre crece
    ancho = pron["sup_garch"] - pron["inf_garch"]
    assert ancho.iloc[-1] > ancho.iloc[0]


def test_probabilidad_superar_es_decreciente_en_el_umbral(X_real):
    tray = modelo.ajustar_modelo(X_real).trayectorias(pasos=3, n_sim=500)
    p_bajo = modelo.probabilidad_superar(tray, 3000)
    p_alto = modelo.probabilidad_superar(tray, 4000)
    assert (p_bajo >= p_alto).all()
    assert ((0 <= p_alto) & (p_bajo <= 1)).all()


def test_pronostico_un_paso_no_usa_informacion_futura(X_real):
    # Alterar los últimos meses no debe cambiar los pronósticos de los meses anteriores
    base, _ = evaluacion.pronostico_un_paso(X_real, H=24)
    alterada = X_real.copy()
    alterada.iloc[-6:] += 50
    otra, _ = evaluacion.pronostico_un_paso(alterada, H=24)
    pd.testing.assert_series_equal(base["arima"].iloc[:-6], otra["arima"].iloc[:-6])
    pd.testing.assert_series_equal(base["sigma_garch"].iloc[:-6], otra["sigma_garch"].iloc[:-6])
