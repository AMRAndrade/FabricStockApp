// Consulta dim_atributo_qualidade (destino: tabela dim_atributo_qualidade do lh_reserva_lotes, substituir).
ler_csv("dim_atributo_qualidade", {{"cod_atributo", type text}, {"nome_atributo", type text}, {"tipo_valor", type text}, {"unidade", type text}})
