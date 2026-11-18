// Gerado a partir de metadata.json (conector lh_reserva_lotes, Lakehouse só de leitura).
// Sem chave nem relações: o endpoint SQL do Lakehouse não expõe PK/FK.
// Nomes em snake_case iguais à tabela (regra 2 do projeto).
import { entity, role, date, text } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

@role('authenticated', ['read'])
@entity()
export class dim_lote extends Source({ schema: 'dbo', table: 'dim_lote', primaryKey: [] }) {
  @text({ optional: true, max: 8000 }) cod_empresa?: string;
  @text({ optional: true, max: 8000 }) cod_artigo?: string;
  @text({ optional: true, max: 8000 }) cod_lote?: string;
  @date({ optional: true }) data_producao?: Date;
  @date({ optional: true }) data_rececao?: Date;
  @date({ optional: true }) data_validade?: Date;
  @text({ optional: true, max: 8000 }) estado_lote?: string;
}
