# Corre sql/qualidade_lakehouse.sql no endpoint SQL do lh_reserva_lotes (Fase 2).
# Uso (Windows PowerShell 5.1, depois de `az login`):
#   powershell -File scripts/testes/qualidade_lakehouse.ps1 -workspace_id <guid>
# Sai com código 1 se algum teste falhar.
#
# Usa System.Data.SqlClient (.NET Framework) com token Entra do Azure CLI: o driver
# Node.js `tedious` 18 perde a ligação ao endpoint SQL do Fabric logo após o LOGIN7
# (registado no POC-LOG, 2026-11-18).

param([Parameter(Mandatory = $true)][string]$workspace_id)

$ErrorActionPreference = 'Stop'
$az = 'C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd'
$lakehouse = 'lh_reserva_lotes'
$raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

$token_fabric = & $az account get-access-token --resource https://api.fabric.microsoft.com --query accessToken -o tsv
$cabecalhos = @{ Authorization = "Bearer $token_fabric" }
$base = "https://api.fabric.microsoft.com/v1/workspaces/$workspace_id"
$lh = (Invoke-RestMethod -Headers $cabecalhos "$base/lakehouses").value | Where-Object displayName -eq $lakehouse
if (-not $lh) { throw "Lakehouse $lakehouse não encontrado" }
$servidor = (Invoke-RestMethod -Headers $cabecalhos "$base/lakehouses/$($lh.id)").properties.sqlEndpointProperties.connectionString

$ligacao = New-Object System.Data.SqlClient.SqlConnection("Server=tcp:$servidor,1433;Database=$lakehouse;Encrypt=True;TrustServerCertificate=False;Connect Timeout=60")
$ligacao.AccessToken = & $az account get-access-token --resource https://database.windows.net --query accessToken -o tsv
$ligacao.Open()
try {
    $comando = $ligacao.CreateCommand()
    $comando.CommandTimeout = 300
    $comando.CommandText = [IO.File]::ReadAllText((Join-Path $raiz 'sql\qualidade_lakehouse.sql'), [Text.Encoding]::UTF8)
    $cronometro = [Diagnostics.Stopwatch]::StartNew()
    $tabela = New-Object System.Data.DataTable
    $tabela.Load($comando.ExecuteReader())
    $cronometro.Stop()
} finally {
    $ligacao.Close()
}

$tabela | Format-Table grupo, teste, esperado, obtido, status -AutoSize | Out-String -Width 200
$falhas = @($tabela.Rows | Where-Object { $_.status -ne 'ok' }).Count
'{0:o} | {1} testes | {2} falhas | {3} ms' -f (Get-Date).ToUniversalTime(), $tabela.Rows.Count, $falhas, $cronometro.ElapsedMilliseconds
if ($falhas -gt 0) { exit 1 }

