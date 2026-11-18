// Ecrã 1 — Stock e reserva: escolher uma linha de encomenda, filtrar lotes do
// artigo por atributo de qualidade, ver o disponível e reservar vários lotes.
// A validação no cliente é só conveniência; a decisão é do servidor (função
// `reservar`, atómica). Recusas do servidor são mostradas com o motivo.

import { useMemo, useState } from 'react';
import {
  ler_atributos_numericos, ler_linhas_encomenda, ler_lotes_artigo, mensagem_erro, reservar,
  useLeitura, type linha_encomenda, type lote_disponivel,
} from '@/lib/dados';
import { a_carregar_vista, erro_vista, formato_qtd, vazio_vista } from '@/componentes/estado';

const chave_linha = (l: linha_encomenda) => `${l.num_encomenda}|${l.num_linha}`;

/** Valida uma quantidade escrita pelo utilizador; devolve o erro ou null. */
function validar_qtd(texto: string, disponivel: number): string | null {
  const valor = Number(texto.replace(',', '.'));
  if (!Number.isFinite(valor) || valor <= 0) return 'quantidade inválida';
  if (Math.round(valor * 1000) !== valor * 1000) return 'máximo 3 casas decimais';
  if (valor > disponivel) return `acima do disponível (${formato_qtd.format(disponivel)})`;
  return null;
}

export function EcraStock() {
  const linhas = useLeitura(ler_linhas_encomenda, []);
  const atributos = useLeitura(ler_atributos_numericos, []);
  const [linha_escolhida, set_linha_escolhida] = useState('');
  const linha = useMemo(
    () => linhas.dados?.find((l) => chave_linha(l) === linha_escolhida) ?? null,
    [linhas.dados, linha_escolhida],
  );
  const lotes = useLeitura(
    () => (linha ? ler_lotes_artigo(linha.cod_artigo) : Promise.resolve([] as lote_disponivel[])),
    [linha?.cod_artigo],
  );

  const [atributo, set_atributo] = useState('brix');
  const [minimo, set_minimo] = useState('65');
  const [so_disponivel, set_so_disponivel] = useState(true);
  const [quantidades, set_quantidades] = useState<Record<string, string>>({});
  const [a_reservar, set_a_reservar] = useState(false);
  const [resultado, set_resultado] = useState<{ tipo: 'ok' | 'recusa' | 'erro'; texto: string } | null>(null);

  const lotes_filtrados = useMemo(() => {
    const limite = minimo.trim() === '' ? null : Number(minimo.replace(',', '.'));
    return (lotes.dados ?? []).filter((l) => {
      if (so_disponivel && l.disponivel <= 0) return false;
      if (limite !== null && Number.isFinite(limite)) {
        const valor = l.atributos[atributo];
        if (typeof valor !== 'number' || !(valor > limite)) return false;
      }
      return true;
    });
  }, [lotes.dados, atributo, minimo, so_disponivel]);

  const escolhidos = lotes_filtrados
    .map((l) => ({ lote: l, texto: quantidades[l.cod_lote] ?? '' }))
    .filter((x) => x.texto.trim() !== '');
  const erros = Object.fromEntries(escolhidos.map((x) => [x.lote.cod_lote, validar_qtd(x.texto, x.lote.disponivel)]));
  const pode_reservar = linha !== null && escolhidos.length > 0 && Object.values(erros).every((e) => e === null) && !a_reservar;

  async function submeter() {
    if (!linha || !pode_reservar) return;
    set_a_reservar(true);
    set_resultado(null);
    try {
      const r = await reservar(linha, escolhidos.map((x) => ({ lote: x.lote, qtd: Number(x.texto.replace(',', '.')) })));
      if (r.aceite) {
        set_resultado({ tipo: 'ok', texto: `Reserva criada (${escolhidos.length} lote(s)) para ${linha.num_encomenda} linha ${linha.num_linha}.` });
        set_quantidades({});
      } else {
        set_resultado({ tipo: 'recusa', texto: `Reserva recusada. ${r.motivo ?? ''}` });
      }
    } catch (erro) {
      set_resultado({ tipo: 'erro', texto: `Falha ao reservar: ${mensagem_erro(erro)}` });
    } finally {
      set_a_reservar(false);
      lotes.recarregar();
    }
  }

  const colunas_atributos = ['brix', 'acidez', 'variedade', 'calibre', 'origem'];

  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 text-base font-semibold">1. Linha de encomenda</h2>
        {linhas.a_carregar && a_carregar_vista('A carregar encomendas…')}
        {linhas.erro && erro_vista(linhas.erro, linhas.recarregar)}
        {linhas.dados && linhas.dados.length === 0 && vazio_vista('Não há encomendas abertas.')}
        {linhas.dados && linhas.dados.length > 0 && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Encomenda e linha</span>
            <select
              className="rounded-md border border-input bg-background p-2"
              value={linha_escolhida}
              onChange={(e) => { set_linha_escolhida(e.target.value); set_quantidades({}); set_resultado(null); }}
            >
              <option value="">— escolher —</option>
              {linhas.dados.map((l) => (
                <option key={chave_linha(l)} value={chave_linha(l)}>
                  {l.num_encomenda} · linha {l.num_linha} · {l.nome_artigo} · pendente {formato_qtd.format(l.qtd_pendente)} · {l.nome_cliente} · entrega {l.data_entrega}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {linha && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-2 text-base font-semibold">2. Lotes de {linha.nome_artigo}</h2>
          <div className="mb-3 flex flex-wrap items-end gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">Atributo</span>
              <select className="rounded-md border border-input bg-background p-2" value={atributo}
                onChange={(e) => set_atributo(e.target.value)}>
                {(atributos.dados ?? [{ cod_atributo: 'brix', nome_atributo: 'Brix', unidade: '' }]).map((a) => (
                  <option key={a.cod_atributo} value={a.cod_atributo}>{a.nome_atributo}{a.unidade ? ` (${a.unidade})` : ''}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">Maior que</span>
              <input className="w-28 rounded-md border border-input bg-background p-2" inputMode="decimal"
                value={minimo} onChange={(e) => set_minimo(e.target.value)} placeholder="sem filtro" />
            </label>
            <label className="flex items-center gap-2 pb-2">
              <input type="checkbox" checked={so_disponivel} onChange={(e) => set_so_disponivel(e.target.checked)} />
              Só com disponível &gt; 0
            </label>
            <button type="button" onClick={lotes.recarregar}
              className="rounded-md border border-border px-3 py-2 hover:bg-accent">Atualizar</button>
          </div>
          {atributos.erro && erro_vista(atributos.erro, atributos.recarregar)}
          {lotes.a_carregar && a_carregar_vista('A carregar lotes…')}
          {lotes.erro && erro_vista(lotes.erro, lotes.recarregar)}
          {lotes.dados && lotes_filtrados.length === 0 && vazio_vista('Nenhum lote cumpre o filtro.')}
          {lotes.dados && lotes_filtrados.length > 0 && (
            <>
              <p className="mb-2 text-sm text-muted-foreground">{lotes_filtrados.length} lote(s)</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border text-muted-foreground">
                    <tr>
                      <th className="p-2">Lote</th><th className="p-2">Armazém</th><th className="p-2">Estado</th>
                      <th className="p-2">Validade</th>
                      {colunas_atributos.map((c) => <th key={c} className="p-2">{c}</th>)}
                      <th className="p-2 text-right">SAP</th><th className="p-2 text-right">Reservado</th>
                      <th className="p-2 text-right">Disponível</th><th className="p-2">Reservar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lotes_filtrados.map((l) => {
                      const bloqueado = l.estado_lote !== 'disponivel';
                      return (
                        <tr key={l.cod_lote} className="border-b border-border">
                          <td className="p-2 font-semibold">{l.cod_lote}</td>
                          <td className="p-2">{l.cod_armazem}</td>
                          <td className="p-2">{l.estado_lote}</td>
                          <td className="p-2">{l.data_validade}</td>
                          {colunas_atributos.map((c) => (
                            <td key={c} className="p-2">{typeof l.atributos[c] === 'number' ? formato_qtd.format(l.atributos[c] as number) : String(l.atributos[c] ?? '')}</td>
                          ))}
                          <td className="p-2 text-right">{formato_qtd.format(l.qtd_sap)}</td>
                          <td className="p-2 text-right">{formato_qtd.format(l.qtd_reservada)}</td>
                          <td className="p-2 text-right font-semibold">{formato_qtd.format(l.disponivel)}</td>
                          <td className="p-2">
                            <input
                              aria-label={`Quantidade a reservar de ${l.cod_lote}`}
                              className="w-24 rounded-md border border-input bg-background p-1"
                              inputMode="decimal" disabled={bloqueado || l.disponivel <= 0}
                              value={quantidades[l.cod_lote] ?? ''}
                              onChange={(e) => set_quantidades((q) => ({ ...q, [l.cod_lote]: e.target.value }))}
                            />
                            {erros[l.cod_lote] && <p className="text-xs text-destructive">{erros[l.cod_lote]}</p>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <button type="button" disabled={!pode_reservar} onClick={() => void submeter()}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                  {a_reservar ? 'A reservar…' : `Reservar ${escolhidos.length || ''} lote(s)`}
                </button>
                <span className="text-sm text-muted-foreground">Tudo ou nada: se um lote falhar, nada é reservado.</span>
              </div>
            </>
          )}
          {resultado && (
            <p role={resultado.tipo === 'ok' ? 'status' : 'alert'}
              className={`mt-3 rounded-md border p-2 text-sm ${resultado.tipo === 'ok' ? 'border-border' : 'border-destructive text-destructive'}`}>
              {resultado.texto}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
