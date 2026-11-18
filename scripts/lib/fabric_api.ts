// API REST do Fabric com token do Azure CLI (`az login`). Os IDs do tenant
// entram por argumento ou são resolvidos por nome; nada fica no repositório.

import { execFileSync } from 'node:child_process';

export const API = 'https://api.fabric.microsoft.com/v1';

export function token_az(recurso: string): string {
  // No Windows o az.cmd precisa de shell; o caminho tem espaços, por isso vai entre aspas.
  const az = process.platform === 'win32'
    ? '"C:\\Program Files\\Microsoft SDKs\\Azure\\CLI2\\wbin\\az.cmd"'
    : 'az';
  return execFileSync(az, ['account', 'get-access-token', '--resource', recurso, '--query', 'accessToken', '-o', 'tsv'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  }).trim();
}

export async function pedido(token: string, metodo: string, url: string, corpo?: unknown): Promise<Response> {
  const r = await fetch(url.startsWith('http') ? url : `${API}${url}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  if (!r.ok) throw new Error(`${metodo} ${url.replace(API, '')} → HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r;
}

/** Operação longa (202 + Location): espera e devolve o resultado, se existir. */
export async function esperar_operacao(token: string, r: Response): Promise<unknown> {
  if (r.status !== 202) return r.status === 200 ? r.json().catch(() => null) : null;
  const local = r.headers.get('Location');
  if (!local) return null;
  for (let i = 0; i < 120; i++) {
    await new Promise((s) => setTimeout(s, 3000));
    const estado = (await (await pedido(token, 'GET', local)).json()) as { status: string; error?: unknown };
    if (estado.status === 'Succeeded') {
      const resultado = await fetch(`${local}/result`, { headers: { Authorization: `Bearer ${token}` } });
      return resultado.ok ? resultado.json() : null;
    }
    if (estado.status === 'Failed') throw new Error(`Operação falhou: ${JSON.stringify(estado.error)}`);
  }
  throw new Error('Operação sem resposta após 6 minutos');
}

export async function id_workspace(token: string, nome: string): Promise<string> {
  const r = (await (await pedido(token, 'GET', '/workspaces')).json()) as { value: { id: string; displayName: string }[] };
  const ws = r.value.find((w) => w.displayName === nome);
  if (!ws) throw new Error(`Workspace ${nome} não encontrado`);
  return ws.id;
}

export async function id_item(token: string, workspace: string, tipo: string, nome: string): Promise<string> {
  const r = (await (await pedido(token, 'GET', `/workspaces/${workspace}/items?type=${tipo}`)).json()) as {
    value: { id: string; displayName: string }[];
  };
  const item = r.value.find((i) => i.displayName === nome);
  if (!item) throw new Error(`${tipo} ${nome} não encontrado`);
  return item.id;
}

/** Corre um job on-demand e espera pelo fim; devolve estado e duração. */
export async function correr_job(token: string, workspace: string, item: string, tipo: string, nome_item: string) {
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as { upn?: string; oid?: string };
  const inicio = Date.now();
  const r = await pedido(token, 'POST', `/workspaces/${workspace}/items/${item}/jobs/instances?jobType=${tipo}`, {
    executionData: { DataflowName: nome_item, OwnerUserPrincipalName: claims.upn, OwnerUserObjectId: claims.oid },
  });
  const local = r.headers.get('Location');
  if (!local) throw new Error('Job sem Location');
  for (let i = 0; i < 240; i++) {
    await new Promise((s) => setTimeout(s, 5000));
    const j = (await (await pedido(token, 'GET', local)).json()) as { status: string; failureReason?: unknown };
    if (!['NotStarted', 'InProgress'].includes(j.status)) {
      return { estado: j.status, segundos: Math.round((Date.now() - inicio) / 1000), falha: j.failureReason ?? null };
    }
  }
  throw new Error('Job sem resposta após 20 minutos');
}
