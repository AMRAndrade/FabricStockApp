// Parâmetro url_dataset (texto, obrigatório): RAIZ do repositório no GitHub (raw),
// sem barra final. A pasta (dataset ou dataset_variacao) vem do parâmetro
// pasta_dataset, para que a fonte de dados Web — e a ligação/credencial associada —
// seja sempre a mesma (o Dataflow associa credenciais ao caminho exato do URL).
"https://raw.githubusercontent.com/AMRAndrade/FabricStockApp/main"
    meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]
