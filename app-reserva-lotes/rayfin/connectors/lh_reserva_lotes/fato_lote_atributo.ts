// Gerado a partir de metadata.json (conector lh_reserva_lotes, Lakehouse só de leitura).
// Sem chave nem relações: o endpoint SQL do Lakehouse não expõe PK/FK.
// Nomes em snake_case iguais à tabela (regra 2 do projeto).
import { entity, role, decimal, text } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

@role('authenticated', ['read'])
@entity()
export class fato_lote_atributo extends Source({ schema: 'dbo', table: 'fato_lote_atributo', primaryKey: [] }) {
  @text({ optional: true, max: 8000 }) cod_empresa?: string;
  @text({ optional: true, max: 8000 }) cod_artigo?: string;
  @text({ optional: true, max: 8000 }) cod_lote?: string;
  @text({ optional: true, max: 8000 }) cod_atributo?: string;
  @decimal({ optional: true }) valor_numero?: number;
  @text({ optional: true, max: 8000 }) valor_texto?: string;
}
