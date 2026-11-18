// Gerado a partir de metadata.json (conector lh_reserva_lotes, Lakehouse só de leitura).
// Sem chave nem relações: o endpoint SQL do Lakehouse não expõe PK/FK.
// Nomes em snake_case iguais à tabela (regra 2 do projeto).
import { entity, role, date, decimal, text } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

@role('authenticated', ['read'])
@entity()
export class fato_stock extends Source({ schema: 'dbo', table: 'fato_stock', primaryKey: [] }) {
  @text({ optional: true, max: 8000 }) cod_empresa?: string;
  @text({ optional: true, max: 8000 }) cod_armazem?: string;
  @text({ optional: true, max: 8000 }) cod_artigo?: string;
  @text({ optional: true, max: 8000 }) cod_lote?: string;
  @decimal({ optional: true }) qtd_fisica?: number;
  @date({ optional: true }) data_hora_carga?: Date;
}
