'use client';

export const POR_PAGINA = 15;

// Paginador reutilizable. `pagina` empieza en 1. Si hay una sola página no dibuja nada.
export default function Paginacion({
  pagina,
  total,
  onCambiar,
  porPagina = POR_PAGINA,
  compacto = false,
}: {
  pagina: number;
  total: number;
  onCambiar: (nueva: number) => void;
  porPagina?: number;
  compacto?: boolean;
}) {
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  if (total <= porPagina) return null;

  const desde = (pagina - 1) * porPagina + 1;
  const hasta = Math.min(pagina * porPagina, total);

  // Ventana de números: 1 … (actual-1) actual (actual+1) … última
  const numeros: (number | '…')[] = [];
  for (let n = 1; n <= totalPaginas; n++) {
    if (n === 1 || n === totalPaginas || Math.abs(n - pagina) <= 1) numeros.push(n);
    else if (numeros[numeros.length - 1] !== '…') numeros.push('…');
  }

  function ir(n: number) {
    if (n < 1 || n > totalPaginas || n === pagina) return;
    onCambiar(n);
    // Vuelve al inicio de la zona de contenido al cambiar de página
    document.querySelector('.cp-content')?.scrollTo({ top: 0 });
  }

  return (
    <nav className={`paginacion${compacto ? ' paginacion-compacta' : ''}`} aria-label="Paginación">
      <span className="paginacion-info">
        {desde}–{hasta} de {total}
      </span>
      <div className="paginacion-botones">
        <button type="button" onClick={() => ir(pagina - 1)} disabled={pagina === 1}>
          Anterior
        </button>
        {!compacto &&
          numeros.map((n, i) =>
            n === '…' ? (
              <span key={`p${i}`} className="paginacion-puntos">…</span>
            ) : (
              <button
                key={n}
                type="button"
                className={n === pagina ? 'activa' : ''}
                onClick={() => ir(n)}
                aria-current={n === pagina ? 'page' : undefined}
              >
                {n}
              </button>
            )
          )}
        {compacto && <span className="paginacion-puntos">{pagina} / {totalPaginas}</span>}
        <button type="button" onClick={() => ir(pagina + 1)} disabled={pagina === totalPaginas}>
          Siguiente
        </button>
      </div>
    </nav>
  );
}
