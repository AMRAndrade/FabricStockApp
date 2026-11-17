// Consulta fato_encomenda_linha (destino: tabela fato_encomenda_linha do lh_reserva_lotes, substituir).
ler_csv("fato_encomenda_linha", {{"cod_empresa", type text}, {"num_encomenda", type text}, {"num_linha", Int64.Type}, {"cod_artigo", type text}, {"qtd_pendente", type number}})
