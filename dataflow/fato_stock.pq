// Consulta fato_stock (destino: tabela fato_stock do lh_reserva_lotes, substituir).
// data_hora_carga é gerada aqui (UTC), não vem do CSV.
let
    origem = ler_csv("fato_stock", {{"cod_empresa", type text}, {"cod_armazem", type text}, {"cod_artigo", type text}, {"cod_lote", type text}, {"qtd_fisica", type number}}),
    agora = DateTimeZone.RemoveZone(DateTimeZone.UtcNow()),
    com_carga = Table.AddColumn(origem, "data_hora_carga", each agora, type datetime)
in
    com_carga
