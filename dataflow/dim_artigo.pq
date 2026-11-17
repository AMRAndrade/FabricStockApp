// Consulta dim_artigo (destino: tabela dim_artigo do lh_reserva_lotes, substituir).
ler_csv("dim_artigo", {{"cod_artigo", type text}, {"nome_artigo", type text}, {"grupo_artigo", type text}, {"unidade", type text}})
