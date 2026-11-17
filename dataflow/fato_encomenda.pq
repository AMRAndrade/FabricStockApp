// Consulta fato_encomenda (destino: tabela fato_encomenda do lh_reserva_lotes, substituir).
ler_csv("fato_encomenda", {{"cod_empresa", type text}, {"num_encomenda", type text}, {"cod_cliente", type text}, {"nome_cliente", type text}, {"data_encomenda", type date}, {"data_entrega", type date}})
