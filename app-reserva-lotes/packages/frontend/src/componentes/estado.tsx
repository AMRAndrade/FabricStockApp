// Estados comuns dos ecrãs: a carregar, erro (com repetir) e vazio.

export function a_carregar_vista(texto = 'A carregar…') {
  return (
    <p role="status" className="py-4 text-sm text-muted-foreground">
      {texto}
    </p>
  );
}

export function erro_vista(mensagem: string, repetir?: () => void) {
  return (
    <div role="alert" className="my-2 rounded-lg border border-destructive p-3 text-sm text-destructive">
      <p className="font-semibold">Não foi possível obter os dados.</p>
      <p className="mt-1 break-words">{mensagem}</p>
      {repetir && (
        <button type="button" onClick={repetir}
          className="mt-2 rounded-md border border-border px-3 py-1 text-foreground hover:bg-accent">
          Tentar de novo
        </button>
      )}
    </div>
  );
}

export function vazio_vista(texto: string) {
  return <p className="py-4 text-sm text-muted-foreground">{texto}</p>;
}

export const formato_qtd = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 3 });
export const formato_data_hora = new Intl.DateTimeFormat('pt-PT', { dateStyle: 'short', timeStyle: 'short' });

export function data_hora(valor: string): string {
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? valor : formato_data_hora.format(d);
}
