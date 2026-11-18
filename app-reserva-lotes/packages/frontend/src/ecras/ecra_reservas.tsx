// Ecrã 2 — Reservas e alertas: reservas ativas por artigo e lote, alertas de
// stock abertos e libertação de reservas (função `libertar`, atómica).

import { useMemo, useState } from 'react';
import { ler_alertas_abertos, ler_reservas_ativas, libertar, mensagem_erro, useLeitura } from '@/lib/dados';
import { a_carregar_vista, data_hora, erro_vista, formato_qtd, vazio_vista } from '@/componentes/estado';

export function EcraReservas() {
  const reservas = useLeitura(ler_reservas_ativas, []);
  const alertas = useLeitura(ler_alertas_abertos, []);
  const [a_libertar, set_a_libertar] = useState<string | null>(null);
  const [mensagem, set_mensagem] = useState<{ tipo: 'ok' | 'recusa' | 'erro'; texto: string } | null>(null);

  const por_lote = useMemo(() => {
    const mapa = new Map<string, { cod_artigo: string; cod_lote: string; qtd: number; reservas: number }>();
    for (const r of reservas.dados ?? []) {
      for (const d of r.detalhes) {
        const k = `${d.cod_artigo}|${d.cod_lote}`;
        const atual = mapa.get(k) ?? { cod_artigo: d.cod_artigo, cod_lote: d.cod_lote, qtd: 0, reservas: 0 };
        atual.qtd += d.qtd;
        atual.reservas += 1;
        mapa.set(k, atual);
      }
    }
    return [...mapa.values()].sort((a, b) => a.cod_artigo.localeCompare(b.cod_artigo) || a.cod_lote.localeCompare(b.cod_lote));
  }, [reservas.dados]);

  async function libertar_reserva(id: string) {
    set_a_libertar(id);
    set_mensagem(null);
    try {
      const r = await libertar(id);
      set_mensagem(r.libertada
        ? { tipo: 'ok', texto: 'Reserva libertada.' }
        : { tipo: 'recusa', texto: `Não libertada: ${r.motivo ?? ''}` });
    } catch (erro) {
      set_mensagem({ tipo: 'erro', texto: `Falha ao libertar: ${mensagem_erro(erro)}` });
    } finally {
      set_a_libertar(null);
      reservas.recarregar();
      alertas.recarregar();
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold">Alertas de stock</h2>
          <button type="button" onClick={alertas.recarregar} className="rounded-md border border-border px-3 py-1 text-sm hover:bg-accent">Atualizar</button>
        </div>
        {alertas.a_carregar && a_carregar_vista('A carregar alertas…')}
        {alertas.erro && erro_vista(alertas.erro, alertas.recarregar)}
        {alertas.dados && alertas.dados.length === 0 && vazio_vista('Sem alertas abertos.')}
        {alertas.dados && alertas.dados.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr><th className="p-2">Artigo</th><th className="p-2">Lote</th><th className="p-2">Encomenda</th>
                <th className="p-2 text-right">Reservado</th><th className="p-2 text-right">SAP</th><th className="p-2">Criado</th></tr>
            </thead>
            <tbody>
              {alertas.dados.map((a) => (
                <tr key={a.id} className="border-b border-border text-destructive">
                  <td className="p-2">{a.cod_artigo}</td><td className="p-2 font-semibold">{a.cod_lote}</td>
                  <td className="p-2">{a.num_encomenda}</td>
                  <td className="p-2 text-right">{formato_qtd.format(a.qtd_reservada)}</td>
                  <td className="p-2 text-right">{formato_qtd.format(a.qtd_sap)}</td>
                  <td className="p-2">{data_hora(a.criado_em)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold">Reservado por artigo e lote</h2>
          <button type="button" onClick={reservas.recarregar} className="rounded-md border border-border px-3 py-1 text-sm hover:bg-accent">Atualizar</button>
        </div>
        {reservas.a_carregar && a_carregar_vista('A carregar reservas…')}
        {reservas.erro && erro_vista(reservas.erro, reservas.recarregar)}
        {reservas.dados && por_lote.length === 0 && vazio_vista('Sem reservas ativas.')}
        {por_lote.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr><th className="p-2">Artigo</th><th className="p-2">Lote</th><th className="p-2 text-right">Reservado</th><th className="p-2 text-right">Reservas</th></tr>
            </thead>
            <tbody>
              {por_lote.map((l) => (
                <tr key={`${l.cod_artigo}|${l.cod_lote}`} className="border-b border-border">
                  <td className="p-2">{l.cod_artigo}</td><td className="p-2 font-semibold">{l.cod_lote}</td>
                  <td className="p-2 text-right">{formato_qtd.format(l.qtd)}</td><td className="p-2 text-right">{l.reservas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 text-base font-semibold">Reservas ativas</h2>
        {mensagem && (
          <p role={mensagem.tipo === 'ok' ? 'status' : 'alert'}
            className={`mb-2 rounded-md border p-2 text-sm ${mensagem.tipo === 'ok' ? 'border-border' : 'border-destructive text-destructive'}`}>
            {mensagem.texto}
          </p>
        )}
        {reservas.dados && reservas.dados.length === 0 && vazio_vista('Sem reservas ativas.')}
        {reservas.dados && reservas.dados.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr><th className="p-2">Encomenda</th><th className="p-2">Lotes</th><th className="p-2">Criada</th><th className="p-2" /></tr>
            </thead>
            <tbody>
              {reservas.dados.map((r) => (
                <tr key={r.id} className="border-b border-border">
                  <td className="p-2">{r.num_encomenda} · linha {r.num_linha}</td>
                  <td className="p-2">{r.detalhes.map((d) => `${d.cod_lote} ${formato_qtd.format(d.qtd)}`).join(' · ')}</td>
                  <td className="p-2">{data_hora(r.criado_em)}</td>
                  <td className="p-2 text-right">
                    <button type="button" disabled={a_libertar !== null} onClick={() => void libertar_reserva(r.id)}
                      className="rounded-md border border-border px-3 py-1 hover:bg-accent disabled:opacity-50">
                      {a_libertar === r.id ? 'A libertar…' : 'Libertar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
