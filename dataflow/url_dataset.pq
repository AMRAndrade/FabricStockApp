// Parâmetro url_dataset (texto, obrigatório).
// No Dataflow Gen2: Gerir parâmetros > Novo parâmetro, nome url_dataset, tipo Texto,
// valor atual = URL base dos CSVs no GitHub, por exemplo
//   https://raw.githubusercontent.com/<organizacao>/<repositorio>/main/dataset
// (sem barra final). Em alternativa, colar esta consulta no editor avançado de uma
// consulta em branco chamada url_dataset.
"https://raw.githubusercontent.com/<organizacao>/<repositorio>/main/dataset"
    meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]
