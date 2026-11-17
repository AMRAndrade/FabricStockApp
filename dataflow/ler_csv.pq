// Função ler_csv(arquivo, tipos)
//   arquivo: nome do CSV sem extensão (ex.: "dim_lote")
//   tipos:   lista {{"coluna", tipo}, ...} na ordem exata das colunas do CSV
// Lê o CSV de url_dataset, confere as colunas, aplica Text.Trim, converte os
// tipos com cultura en-US e faz FALHAR o refresh se alguma célula não converter.
// Texto vazio mantém-se "" (nunca nulo); número vazio passa a nulo.
(arquivo as text, tipos as list) as table =>
let
    conteudo = Web.Contents(url_dataset, [RelativePath = "/" & arquivo & ".csv"]),
    csv = Csv.Document(conteudo, [Delimiter = ",", Encoding = 65001, QuoteStyle = QuoteStyle.Csv]),
    com_cabecalho = Table.PromoteHeaders(csv, [PromoteAllScalars = true]),
    esperadas = List.Transform(tipos, each _{0}),
    obtidas = Table.ColumnNames(com_cabecalho),
    colunas_ok =
        if obtidas = esperadas then com_cabecalho
        else error Error.Record(
            "ler_csv.colunas",
            "Colunas inesperadas em " & arquivo & ".csv",
            [esperadas = Text.Combine(esperadas, ","), obtidas = Text.Combine(obtidas, ",")]
        ),
    aparado = Table.TransformColumns(colunas_ok, List.Transform(obtidas, each {_, Text.Trim, type text})),
    tipado = Table.TransformColumnTypes(aparado, tipos, "en-US"),
    erros = Table.RowCount(Table.SelectRowsWithErrors(tipado, obtidas)),
    resultado =
        if erros = 0 then tipado
        else error Error.Record(
            "ler_csv.conversao",
            arquivo & ".csv: " & Text.From(erros) & " linha(s) com valores que não convertem",
            [arquivo = arquivo]
        )
in
    resultado
