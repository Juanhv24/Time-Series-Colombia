"""Línea de comandos del proyecto.

    uv run trm pronostico   # pronóstico de los próximos 12 meses en la terminal
    uv run trm sitio        # regenera docs/data/tablero.json para el tablero de GitHub Pages
"""

import argparse

import pandas as pd

from trm import config, datos, modelo, sitio


def _pronostico() -> None:
    X = datos.log_nivel(datos.serie_mensual(datos.cargar_trm()))
    final = modelo.ajustar_modelo(X)
    tabla = final.pronostico(config.HORIZONTE)[["pronostico", "inf_garch", "sup_garch"]]
    tabla.columns = ["Pronóstico", "IC 95 % inferior", "IC 95 % superior"]
    tabla.index = tabla.index.strftime("%Y-%m")
    print(f"TRM promedio mensual, último mes observado: {X.index[-1]:%Y-%m}\n")
    with pd.option_context("display.float_format", "{:,.2f}".format):
        print(tabla.to_string())


def _sitio() -> None:
    contenido = sitio.exportar()
    d = contenido["datos"]
    print(f"tablero.json actualizado en {config.SITIO_DATA}")
    print(f"Datos diarios hasta {d['fin_diaria']} | último mes completo {d['ultimo_mes']} ({d['ultimo_mes_valor']:,.2f} COP/USD)")


def main() -> None:
    parser = argparse.ArgumentParser(prog="trm", description="Modelo y tablero de la TRM de Colombia")
    sub = parser.add_subparsers(dest="comando", required=True)
    sub.add_parser("pronostico", help="Muestra el pronóstico de los próximos 12 meses")
    sub.add_parser("sitio", help="Regenera los datos del tablero en docs/data")
    args = parser.parse_args()
    {"pronostico": _pronostico, "sitio": _sitio}[args.comando]()


if __name__ == "__main__":
    main()
