// Gerado a partir de metadata.json (conector lh_reserva_lotes, Lakehouse só de leitura).
// Sem chave nem relações: o endpoint SQL do Lakehouse não expõe PK/FK.
// Nomes em snake_case iguais à tabela (regra 2 do projeto).
import { entity, role, text } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

@role('authenticated', ['read'])
@entity()
export class dim_atributo_qualidade extends Source({ schema: 'dbo', table: 'dim_atributo_qualidade', primaryKey: [] }) {
  @text({ optional: true, max: 8000 }) cod_atributo?: string;
  @text({ optional: true, max: 8000 }) nome_atributo?: string;
  @text({ optional: true, max: 8000 }) tipo_valor?: string;
  @text({ optional: true, max: 8000 }) unidade?: string;
}
