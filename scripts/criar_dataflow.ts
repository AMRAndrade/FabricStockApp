// Cria (ou atualiza) o Dataflow Gen2 df-reserva-lotes a partir de dataflow/*.pq,
// pela API REST do Fabric (definição queryMetadata.json + mashup.pq, formato 202502).
//
// Uso (PowerShell, na raiz do repositório, depois de `az login`):
//   node scripts/criar_dataflow.ts --workspace-id <guid> [--substituir]
//
// Limitação documentada (Microsoft Learn, dataflow-gen2-public-apis): os destinos
// de dados (Lakehouse) não podem ser definidos pela API; adicionam-se no portal.
// Os IDs do tenant passam por argumento e nunca ficam no repositório.

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const API = "https://api.fabric.microsoft.com/v1";
const NOME_DATAFLOW = "df-reserva-lotes";
const PASTA_M = join(import.meta.dirname, "..", "dataflow");
const CONSULTAS_AUXILIARES = ["url_dataset", "ler_csv"];
const TABELAS = [
  "dim_armazem",
  "dim_artigo",
  "dim_lote",
  "dim_atributo_qualidade",
  "fato_lote_atributo",
  "fato_stock",
  "fato_encomenda",
  "fato_encomenda_linha",
];

function ler_argumento(nome: string): string {
  const i = process.argv.indexOf(nome);
  const valor = i >= 0 ? process.argv[i + 1] : undefined;
  if (!valor) throw new Error(`Falta o argumento ${nome}`);
  return valor;
}

function obter_token(): string {
  // No Windows o az.cmd precisa de shell; o caminho tem espaços, por isso vai entre aspas.
  const az = process.platform === "win32"
    ? "\"C:\\Program Files\\Microsoft SDKs\\Azure\\CLI2\\wbin\\az.cmd\""
    : "az";
  return execFileSync(az, [
    "account", "get-access-token",
    "--resource", "https://api.fabric.microsoft.com",
    "--query", "accessToken", "-o", "tsv",
  ], { encoding: "utf8", shell: process.platform === "win32" }).trim();
}

function ler_consulta(nome: string): string {
  const texto = readFileSync(join(PASTA_M, `${nome}.pq`), "utf8");
  return texto
    .split(/\r?\n/)
    .filter((linha) => !linha.trimStart().startsWith("//"))
    .join("\n")
    .trim();
}

function montar_mashup(): string {
  const consultas = [...CONSULTAS_AUXILIARES, ...TABELAS]
    .map((nome) => `shared ${nome} = ${ler_consulta(nome)};`);
  return ["section Section1;", ...consultas].join("\r\n") + "\r\n";
}

function montar_metadados(): string {
  const queriesMetadata: Record<string, unknown> = {};
  for (const nome of [...CONSULTAS_AUXILIARES, ...TABELAS]) {
    queriesMetadata[nome] = {
      queryId: randomUUID(),
      queryName: nome,
      isHidden: false,
      loadEnabled: TABELAS.includes(nome),
    };
  }
  return JSON.stringify({
    formatVersion: "202502",
    name: NOME_DATAFLOW,
    documentLocale: "en-US",
    queriesMetadata,
    fastCombine: false,
    allowNativeQueries: false,
    skipAutomaticTypeAndHeaderDetection: true,
  }, null, 2);
}

function parte(caminho: string, conteudo: string) {
  return { path: caminho, payload: Buffer.from(conteudo, "utf8").toString("base64"), payloadType: "InlineBase64" };
}

async function pedido(token: string, metodo: string, url: string, corpo?: unknown): Promise<Response> {
  const resposta = await fetch(url, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  if (!resposta.ok) {
    throw new Error(`${metodo} ${url.replace(API, "")} → HTTP ${resposta.status}: ${await resposta.text()}`);
  }
  return resposta;
}

// Operações longas: 202 + Location; espera até Succeeded.
async function esperar_operacao(token: string, resposta: Response): Promise<void> {
  if (resposta.status !== 202) return;
  const local = resposta.headers.get("Location");
  if (!local) return;
  for (let tentativa = 0; tentativa < 60; tentativa++) {
    await new Promise((r) => setTimeout(r, Number(resposta.headers.get("Retry-After") ?? 3) * 1000));
    const estado = (await (await pedido(token, "GET", local)).json()) as { status: string; error?: unknown };
    if (estado.status === "Succeeded") return;
    if (estado.status === "Failed") throw new Error(`Operação falhou: ${JSON.stringify(estado.error)}`);
  }
  throw new Error("Operação sem resposta após 3 minutos");
}

async function main(): Promise<void> {
  const workspace = ler_argumento("--workspace-id");
  const token = obter_token();
  const definicao = {
    parts: [parte("queryMetadata.json", montar_metadados()), parte("mashup.pq", montar_mashup())],
  };

  const itens = (await (await pedido(token, "GET", `${API}/workspaces/${workspace}/items?type=Dataflow`)).json()) as {
    value: { id: string; displayName: string }[];
  };
  const existente = itens.value.find((i) => i.displayName === NOME_DATAFLOW);

  if (existente) {
    // A API não guarda versões anteriores: substituir só com pedido explícito.
    if (!process.argv.includes("--substituir")) {
      throw new Error(`${NOME_DATAFLOW} já existe. Rever no portal e repetir com --substituir para o sobrescrever.`);
    }
    const r = await pedido(token, "POST", `${API}/workspaces/${workspace}/items/${existente.id}/updateDefinition`, { definition: definicao });
    await esperar_operacao(token, r);
    console.log(`Definição de ${NOME_DATAFLOW} atualizada.`);
  } else {
    const r = await pedido(token, "POST", `${API}/workspaces/${workspace}/items`, {
      displayName: NOME_DATAFLOW,
      type: "Dataflow",
      description: "PoC reserva de lotes: CSVs sintéticos do GitHub para o lh_reserva_lotes",
      definition: definicao,
    });
    await esperar_operacao(token, r);
    console.log(`${NOME_DATAFLOW} criado.`);
  }
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
