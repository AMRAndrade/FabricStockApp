// Consulta fato_lote_atributo (destino: tabela fato_lote_atributo do lh_reserva_lotes, substituir).
ler_csv("fato_lote_atributo", {{"cod_empresa", type text}, {"cod_artigo", type text}, {"cod_lote", type text}, {"cod_atributo", type text}, {"valor_numero", type number}, {"valor_texto", type text}})
