// Gerado a partir de metadata.json (conector lh_reserva_lotes, Lakehouse só de leitura).
// Sem chave nem relações: o endpoint SQL do Lakehouse não expõe PK/FK.
// Nomes em snake_case iguais à tabela (regra 2 do projeto).
import { entity, role, decimal, int, text } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

@role('authenticated', ['read'])
@entity()
export class fato_encomenda_linha extends Source({ schema: 'dbo', table: 'fato_encomenda_linha', primaryKey: [] }) {
  @text({ optional: true, max: 8000 }) cod_empresa?: string;
  @text({ optional: true, max: 8000 }) num_encomenda?: string;
  @int({ optional: true }) num_linha?: number;
  @text({ optional: true, max: 8000 }) cod_artigo?: string;
  @decimal({ optional: true }) qtd_pendente?: number;
}
