"""Gera o dataset sintético da PoC de reserva de lotes (seed 42).

Uso:  python scripts/gerar_dataset.py
Saída: dataset/<tabela>.csv (UTF-8, separador vírgula, decimais com ponto, cabeçalho).

Todos os dados são fictícios. O gerador é determinístico e confere no fim as
contagens e o cenário de filtro definidos no CLAUDE.md (secção 1); se algum
falhar, termina com erro e não deixa a dúvida para a Fase 2.
"""

from __future__ import annotations

import csv
import random
import sys
from datetime import date, timedelta
from pathlib import Path

SEED = 42
COD_EMPRESA = "EMP01"
PASTA_SAIDA = Path(__file__).resolve().parent.parent / "dataset"

rnd = random.Random(SEED)

# ---------------------------------------------------------------- dimensões

dim_armazem = [
    {"cod_empresa": COD_EMPRESA, "cod_armazem": "A01", "nome_armazem": "Armazém Central"},
    {"cod_empresa": COD_EMPRESA, "cod_armazem": "A02", "nome_armazem": "Armazém Norte"},
]

_artigos = [
    ("ART-001", "Laranja Valência", "laranja"),
    ("ART-002", "Laranja Navel", "laranja"),
    ("ART-003", "Laranja Lane Late", "laranja"),
    ("ART-004", "Limão Eureka", "limao"),
    ("ART-005", "Limão Verna", "limao"),
    ("ART-006", "Tangerina Clementina", "tangerina"),
    ("ART-007", "Tangerina Ortanique", "tangerina"),
    ("ART-008", "Toranja Star Ruby", "toranja"),
    ("ART-009", "Maçã Gala", "maca"),
    ("ART-010", "Maçã Fuji", "maca"),
    ("ART-011", "Maçã Reineta", "maca"),
    ("ART-012", "Pera Rocha", "pera"),
    ("ART-013", "Pera Conference", "pera"),
    ("ART-014", "Pêssego Amarelo", "pessego"),
    ("ART-015", "Ameixa Rainha Cláudia", "ameixa"),
    ("ART-016", "Kiwi Hayward", "kiwi"),
    ("ART-017", "Uva Branca Itália", "uva"),
    ("ART-018", "Uva Tinta Red Globe", "uva"),
    ("ART-019", "Melão Branco", "melao"),
    ("ART-020", "Melancia Sem Grainha", "melancia"),
]
dim_artigo = [
    {"cod_artigo": c, "nome_artigo": n, "grupo_artigo": g, "unidade": "kg"}
    for c, n, g in _artigos
]
ARTIGOS_LARANJA = [a["cod_artigo"] for a in dim_artigo if a["grupo_artigo"] == "laranja"]
ARTIGOS_OUTROS = [a["cod_artigo"] for a in dim_artigo if a["grupo_artigo"] != "laranja"]

dim_atributo_qualidade = [
    {"cod_atributo": "brix", "nome_atributo": "Brix", "tipo_valor": "numero", "unidade": "°Bx"},
    {"cod_atributo": "acidez", "nome_atributo": "Acidez", "tipo_valor": "numero", "unidade": "%"},
    {"cod_atributo": "variedade", "nome_atributo": "Variedade", "tipo_valor": "texto", "unidade": ""},
    {"cod_atributo": "origem", "nome_atributo": "Origem", "tipo_valor": "texto", "unidade": ""},
    {"cod_atributo": "calibre", "nome_atributo": "Calibre", "tipo_valor": "texto", "unidade": ""},
]

VARIEDADES = {a["cod_artigo"]: a["nome_artigo"].split(" ", 1)[1] for a in dim_artigo}
ORIGENS = ["Algarve", "Ribatejo", "Oeste", "Alentejo", "Beira Interior", "Trás-os-Montes"]
CALIBRES = ["1", "2", "3", "4", "5"]

# ---------------------------------------------------------------- lotes

# Cada especificação: (cod_lote, cod_artigo, brix, qtd_fisica, estado_lote)
# Lotes fixos (CLAUDE.md, secção 1).
especificacoes: list[tuple[str, str, float, float, str]] = [
    ("L-CONC", "ART-001", 68.0, 100.0, "disponivel"),
    ("L-ATOM", "ART-001", 67.0, 5.0, "disponivel"),
    ("L-ALRT", "ART-001", 66.0, 50.0, "disponivel"),
    ("L-FORA", "ART-001", 64.0, 80.0, "disponivel"),
    ("L-LIM", "ART-001", 65.0, 40.0, "disponivel"),
]
LOTES_FIXOS = {e[0] for e in especificacoes}

_seq = iter(range(1, 1000))


def _novo_cod() -> str:
    return f"L-{next(_seq):04d}"


def _qtd() -> float:
    return float(rnd.randint(2, 50) * 10)


# Laranja gerada: 9 dentro do filtro, 2 com Brix > 65 mas sem stock, 9 com Brix <= 64,9.
for _ in range(9):
    especificacoes.append((_novo_cod(), rnd.choice(ARTIGOS_LARANJA), round(rnd.uniform(65.5, 72.0), 1), _qtd(), "disponivel"))
for _ in range(2):
    especificacoes.append((_novo_cod(), rnd.choice(ARTIGOS_LARANJA), round(rnd.uniform(65.5, 72.0), 1), 0.0, "disponivel"))
for _ in range(9):
    especificacoes.append((_novo_cod(), rnd.choice(ARTIGOS_LARANJA), round(rnd.uniform(55.0, 64.9), 1), _qtd(), "disponivel"))
# Outros artigos: 75 lotes; Brix típico da fruta, alguns bloqueados, alguns sem stock.
for i in range(75):
    artigo = ARTIGOS_OUTROS[i % len(ARTIGOS_OUTROS)]
    estado = "bloqueado" if rnd.random() < 0.1 else "disponivel"
    qtd = 0.0 if rnd.random() < 0.1 else _qtd()
    especificacoes.append((_novo_cod(), artigo, round(rnd.uniform(8.0, 20.0), 1), qtd, estado))

dim_lote = []
fato_stock = []
fato_lote_atributo = []
for cod_lote, cod_artigo, brix, qtd, estado in especificacoes:
    producao = date(2026, 9, 1) + timedelta(days=rnd.randint(0, 45))
    rececao = producao + timedelta(days=rnd.randint(1, 5))
    validade = rececao + timedelta(days=rnd.randint(30, 90))
    dim_lote.append({
        "cod_empresa": COD_EMPRESA, "cod_artigo": cod_artigo, "cod_lote": cod_lote,
        "data_producao": producao.isoformat(), "data_rececao": rececao.isoformat(),
        "data_validade": validade.isoformat(), "estado_lote": estado,
    })
    armazem = "A01" if cod_lote in LOTES_FIXOS else rnd.choice(["A01", "A02"])
    fato_stock.append({
        "cod_empresa": COD_EMPRESA, "cod_armazem": armazem, "cod_artigo": cod_artigo,
        "cod_lote": cod_lote, "qtd_fisica": f"{qtd:.1f}",
    })
    valores = {
        "brix": (f"{brix:.1f}", ""),
        "acidez": (f"{rnd.uniform(0.5, 1.5):.2f}", ""),
        "variedade": ("", VARIEDADES[cod_artigo]),
        "origem": ("", rnd.choice(ORIGENS)),
        "calibre": ("", rnd.choice(CALIBRES)),
    }
    for atributo in dim_atributo_qualidade:
        num, txt = valores[atributo["cod_atributo"]]
        fato_lote_atributo.append({
            "cod_empresa": COD_EMPRESA, "cod_artigo": cod_artigo, "cod_lote": cod_lote,
            "cod_atributo": atributo["cod_atributo"], "valor_numero": num, "valor_texto": txt,
        })

# ---------------------------------------------------------------- encomendas

CLIENTES = [
    ("C-001", "Frutaria Exemplo, Lda."), ("C-002", "Mercado Fictício, S.A."),
    ("C-003", "Sumos Teste, Lda."), ("C-004", "Distribuidora Modelo, S.A."),
    ("C-005", "Mercearia Imaginária, Lda."),
]
fato_encomenda = []
fato_encomenda_linha = []
for n in range(1, 11):
    num = f"ENC-{n:04d}"
    cliente = CLIENTES[(n - 1) % len(CLIENTES)]
    data_enc = date(2026, 11, 1) + timedelta(days=rnd.randint(0, 10))
    fato_encomenda.append({
        "cod_empresa": COD_EMPRESA, "num_encomenda": num, "cod_cliente": cliente[0],
        "nome_cliente": cliente[1], "data_encomenda": data_enc.isoformat(),
        "data_entrega": (data_enc + timedelta(days=rnd.randint(3, 14))).isoformat(),
    })
    n_linhas = 2 if n <= 5 else 3
    for linha in range(1, n_linhas + 1):
        if n in (1, 2) and linha == 1 or n == 1 and linha == 2:
            artigo = "ART-001"  # linhas fixas: concorrência, atomicidade, alertas
        else:
            artigo = rnd.choice(ARTIGOS_LARANJA + ARTIGOS_OUTROS)
        fato_encomenda_linha.append({
            "cod_empresa": COD_EMPRESA, "num_encomenda": num, "num_linha": linha,
            "cod_artigo": artigo, "qtd_pendente": f"{rnd.randint(5, 100) * 10:.1f}",
        })

# ---------------------------------------------------------------- escrita

TABELAS = {
    "dim_armazem": dim_armazem,
    "dim_artigo": dim_artigo,
    "dim_lote": dim_lote,
    "dim_atributo_qualidade": dim_atributo_qualidade,
    "fato_lote_atributo": fato_lote_atributo,
    "fato_stock": fato_stock,
    "fato_encomenda": fato_encomenda,
    "fato_encomenda_linha": fato_encomenda_linha,
}

CONTAGENS_ESPERADAS = {
    "dim_armazem": 2, "dim_artigo": 20, "dim_lote": 100, "dim_atributo_qualidade": 5,
    "fato_lote_atributo": 500, "fato_stock": 100, "fato_encomenda": 10,
    "fato_encomenda_linha": 25,
}


def verificar() -> list[str]:
    erros = []
    for nome, esperado in CONTAGENS_ESPERADAS.items():
        if len(TABELAS[nome]) != esperado:
            erros.append(f"{nome}: esperado {esperado}, obtido {len(TABELAS[nome])}")
    if sum(1 for a in dim_artigo if a["grupo_artigo"] == "laranja") != 3:
        erros.append("dim_artigo: esperados 3 artigos do grupo laranja")
    brix = {r["cod_lote"]: float(r["valor_numero"]) for r in fato_lote_atributo if r["cod_atributo"] == "brix"}
    qtd = {r["cod_lote"]: float(r["qtd_fisica"]) for r in fato_stock}
    filtro = sorted(
        l["cod_lote"] for l in dim_lote
        if l["cod_artigo"] in ARTIGOS_LARANJA and brix[l["cod_lote"]] > 65 and qtd[l["cod_lote"]] > 0
    )
    if len(filtro) != 12:
        erros.append(f"filtro laranja/brix>65/qtd>0: esperado 12, obtido {len(filtro)}")
    for lote in ("L-CONC", "L-ATOM", "L-ALRT"):
        if lote not in filtro:
            erros.append(f"filtro: {lote} devia aparecer")
    for lote in ("L-FORA", "L-LIM"):
        if lote in filtro:
            erros.append(f"filtro: {lote} não devia aparecer")
    if len({l["cod_lote"] for l in dim_lote}) != 100:
        erros.append("dim_lote: cod_lote duplicado")
    return erros


def main() -> int:
    erros = verificar()
    if erros:
        print("Dataset inválido:", *erros, sep="\n  ")
        return 1
    PASTA_SAIDA.mkdir(exist_ok=True)
    for nome, linhas in TABELAS.items():
        with open(PASTA_SAIDA / f"{nome}.csv", "w", encoding="utf-8", newline="") as f:
            escritor = csv.DictWriter(f, fieldnames=list(linhas[0].keys()), lineterminator="\n")
            escritor.writeheader()
            escritor.writerows(linhas)
        print(f"{nome}.csv: {len(linhas)} linhas")
    return 0


if __name__ == "__main__":
    sys.exit(main())
