// Invoca a função `diagnostico` (Fase 3) e imprime o resultado, com o
// identificador do utilizador mascarado.
import { criar_cliente_autenticado } from '../lib/cliente.ts';

const cliente = await criar_cliente_autenticado();
const sessao = cliente.auth.getSession();
const inicio = performance.now();
const r = await cliente.functions.diagnostico.invoke();
const ms = Math.round(performance.now() - inicio);
const mascarar = (s: string) => (s.length > 8 ? `${s.slice(0, 4)}…${s.slice(-4)} (${s.length} car.)` : s);
console.log(JSON.stringify({
  sessao_user_id: mascarar(sessao.user?.id ?? ''),
  servidor_ctx_user_id: mascarar(r.utilizador),
  iguais: sessao.user?.id === r.utilizador,
  ...r,
  utilizador: undefined,
  ms,
}, null, 2));
cliente.dispose();
