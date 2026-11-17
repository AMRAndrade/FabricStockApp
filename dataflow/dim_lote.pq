// Consulta dim_lote (destino: tabela dim_lote do lh_reserva_lotes, substituir).
ler_csv("dim_lote", {{"cod_empresa", type text}, {"cod_artigo", type text}, {"cod_lote", type text}, {"data_producao", type date}, {"data_rececao", type date}, {"data_validade", type date}, {"estado_lote", type text}})
