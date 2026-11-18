// Cliente Rayfin para os testes da PoC, a correr em Node (chamadas diretas à API,
// sem a UI — regra 7). Usa o mesmo SDK da app (versão 2.0.0).
//
// Token: o Azure CLI não tem consentimento para Item.Execute.All, por isso o token
// delegado vem do módulo de autenticação do CLI do Rayfin já instalado na app
// (o mesmo que `rayfin connector invoke` usa; sessão de `npx rayfin login`).
// O token nunca é impresso nem gravado.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RayfinClient } from '@microsoft/rayfin-client';
import { browserSession } from '@microsoft/rayfin-auth';
import { signInWithEntraToken } from '@microsoft/rayfin-auth-provider-fabric';
import { dataService } from '@microsoft/rayfin-data';
import { functionsService } from '@microsoft/rayfin-functions';
import { connectorsService } from '@microsoft/rayfin-connectors';
import type { UniversalAppSchema } from '../../app-reserva-lotes/packages/shared/src/index.ts';
import type { AppFunctionsSchema } from '../../app-reserva-lotes/packages/functions/src/types.ts';
import {
  connectorConfig as lh_reserva_lotes_config,
  type LhReservaLotesSchema,
} from '../../app-reserva-lotes/rayfin/connectors/lh_reserva_lotes/schema.ts';

export const RAIZ_APP = join(import.meta.dirname, '..', '..', 'app-reserva-lotes');
const ESCOPO_POWER_BI = 'https://analysis.windows.net/powerbi/api/.default';

export function ler_env(): Record<string, string> {
  const texto = readFileSync(join(RAIZ_APP, 'rayfin', '.env'), 'utf8');
  const valores: Record<string, string> = {};
  for (const linha of texto.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(linha.trim());
    if (m) valores[m[1]] = m[2];
  }
  return valores;
}

export async function obter_token_utilizador(): Promise<string> {
  const caminho = join(RAIZ_APP, 'node_modules', '@microsoft', 'rayfin-cli', 'dist', 'auth', 'index.js');
  const modulo = (await import(`file:///${caminho.replace(/\\/g, '/')}`)) as {
    getRayfinAuth: () => Promise<{ acquireToken: (s: string[], o?: { silentOnly?: boolean }) => Promise<{ token: string }> }>;
  };
  const auth = await modulo.getRayfinAuth();
  return (await auth.acquireToken([ESCOPO_POWER_BI])).token;
}

export function criar_cliente() {
  const env = ler_env();
  const baseUrl = env.RAYFIN_PUBLIC_API_URL;
  const publishableKey = env.RAYFIN_PUBLIC_PUBLISHABLE_KEY;
  if (!baseUrl || !publishableKey) throw new Error('rayfin/.env sem RAYFIN_PUBLIC_API_URL ou RAYFIN_PUBLIC_PUBLISHABLE_KEY');
  return RayfinClient.create({
    baseUrl,
    publishableKey,
    auth: browserSession({ storage: false }),
    services: {
      data: dataService<UniversalAppSchema>(),
      functions: functionsService<AppFunctionsSchema>(),
      connectors: connectorsService<{ lh_reserva_lotes: LhReservaLotesSchema }>({
        configs: { lh_reserva_lotes: lh_reserva_lotes_config },
        runtime: {},
      }),
    },
  });
}

export type cliente_app = ReturnType<typeof criar_cliente>;

/** Cliente com sessão do utilizador do `rayfin login`. */
export async function criar_cliente_autenticado(token?: string): Promise<cliente_app> {
  const cliente = criar_cliente();
  const sessao = await signInWithEntraToken(cliente.auth, { entraToken: token ?? (await obter_token_utilizador()) });
  if (!sessao.isAuthenticated) throw new Error('Troca de token não autenticou');
  return cliente;
}

/** Executa e devolve o erro (ou null), para testes que esperam recusa. */
export async function capturar_erro(acao: () => Promise<unknown>): Promise<{ erro: string | null; resultado?: unknown }> {
  try {
    return { erro: null, resultado: await acao() };
  } catch (e) {
    const x = e as { name?: string; code?: string; status?: number; message?: string };
    return { erro: [x.name, x.code, x.status, x.message].filter((v) => v !== undefined).join(' · ').slice(0, 300) };
  }
}
