'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PDFDocument, PDFCheckBox } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { supabase } from '@/lib/supabase'; // ajusta la ruta si tu cliente está en otro lugar

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const PDF_URL = '/formato-recepcion.pdf'; // coloca aquí tu PDF editable (carpeta /public)

// Estos campos se guardan como columna propia en "recepciones".
// Todo lo que NO esté en esta lista se guarda junto, como JSON, en la columna "detalles".
const CAMPOS_INDIVIDUALES = [
  'fecha', 'asesoria_no',
  'nombres_apellidos', 'cedula_numero', 'correo', 'contacto_1',
  'direccion', 'area_derecho', 'naturaleza_asunto',
  'estudiante_recepciona_nombre', 'estudiante_recepciona_codigo',
];

type Campo = { name: string; type: 'text' | 'checkbox'; page: number; rect: number[] };

export default function RecepcionPage() {
  const router = useRouter();
  const [campos, setCampos] = useState<Campo[]>([]);
  const [paginas, setPaginas] = useState<{ width: number; height: number }[]>([]);
  const [valores, setValores] = useState<Record<string, string | boolean>>({});
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'error' | 'success'; texto: string } | null>(null);
  const [numeroAsesoria, setNumeroAsesoria] = useState<number | null>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);

  // Solo monitores o administradores pueden entrar aquí
  useEffect(() => {
    let cancelado = false;
    async function verificarPermiso() {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) { if (!cancelado) router.replace('/login'); return; }
      const { data: perfil } = await supabase.from('usuarios').select('rol').eq('id', user.id).single();
      if (cancelado) return;
      if (!perfil || !['monitor', 'administrador'].includes(perfil.rol)) router.replace('/login');
    }
    verificarPermiso();
    return () => { cancelado = true; };
  }, [router]);

  // Cargar el PDF: leer sus campos con pdf-lib y dibujarlo con pdf.js
  useEffect(() => {
    let cancelado = false;

    async function cargar() {
      const bytes = await fetch(PDF_URL).then((r) => r.arrayBuffer());
      if (cancelado) return;
      setPdfBytes(bytes);

      const doc = await PDFDocument.load(bytes);
      const paginasDoc = doc.getPages();
      const lista: Campo[] = doc.getForm().getFields().map((f) => {
        const widget = f.acroField.getWidgets()[0];
        const rect = widget.getRectangle();
        const pagina = paginasDoc.findIndex((p) => p.ref === widget.P());
        return {
          name: f.getName(),
          type: f instanceof PDFCheckBox ? 'checkbox' : 'text',
          page: pagina,
          rect: [rect.x, rect.y, rect.width, rect.height],
        };
      });
      if (cancelado) return;
      setCampos(lista);
      setPaginas(paginasDoc.map((p) => ({ width: p.getWidth(), height: p.getHeight() })));

      const pdfjsDoc = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
      const dpr = window.devicePixelRatio || 1;

      for (let i = 0; i < pdfjsDoc.numPages; i++) {
        if (cancelado) return;
        const page = await pdfjsDoc.getPage(i + 1);
        const canvas = canvasRefs.current[i];
        if (!canvas || cancelado) continue;

        // Nitidez real: usamos el ancho con el que la página se ve EN PANTALLA
        // (el contenedor, no el canvas) para calcular la escala exacta que
        // necesita el render. Así el canvas nunca queda "estirado" por CSS
        // más allá de su resolución real, sin importar el tamaño de pantalla.
        const contenedor = canvas.parentElement;
        const anchoVisible = contenedor?.getBoundingClientRect().width || canvas.clientWidth || 800;
        const viewportBase = page.getViewport({ scale: 1 });
        const escala = Math.max((anchoVisible / viewportBase.width) * dpr * 2, dpr * 3);

        const viewport = page.getViewport({ scale: escala });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d')!, canvas, viewport }).promise;
      }
    }
    cargar();
    return () => { cancelado = true; };
  }, []);

  function actualizar(nombre: string, valor: string | boolean) {
    setValores((prev) => ({ ...prev, [nombre]: valor }));
  }

  async function guardarYDescargar() {
    if (!pdfBytes) return;
    setGuardando(true);
    setMensaje(null);
    try {
      // 1. Pedir el siguiente número de asesoría de forma atómica en la BD
      const { data: numero, error: errorNumero } = await supabase.rpc('siguiente_numero_asesoria');
      if (errorNumero) throw errorNumero;

      // Se usa esta copia local (no el estado "valores") para no depender de que
      // React ya haya actualizado el estado antes de rellenar el PDF.
      const valoresFinales: Record<string, string | boolean> = { ...valores, asesoria_no: String(numero) };
      setValores(valoresFinales); // refleja el número también en el formulario en pantalla

      // 2. Rellenar el PDF y generar el archivo final
      const doc = await PDFDocument.load(pdfBytes);
      const form = doc.getForm();
      for (const campo of campos) {
        const valor = valoresFinales[campo.name];
        if (campo.type === 'checkbox') {
          valor ? form.getCheckBox(campo.name).check() : form.getCheckBox(campo.name).uncheck();
        } else {
          form.getTextField(campo.name).setText(valor ? String(valor) : '');
        }
      }
      const bytesFinal = await doc.save();
      const blob = new Blob([bytesFinal as BlobPart], { type: 'application/pdf' });
      const nombreArchivo = `recepcion-${Date.now()}.pdf`;

      // 3. Descargar en el navegador
      const enlace = document.createElement('a');
      enlace.href = URL.createObjectURL(blob);
      enlace.download = nombreArchivo;
      enlace.click();

      // 4. Subir el PDF final a Supabase Storage (bucket "recepciones")
      const { error: errorSubida } = await supabase.storage.from('recepciones').upload(nombreArchivo, blob);
      if (errorSubida) throw errorSubida;
      const { data: urlData } = supabase.storage.from('recepciones').getPublicUrl(nombreArchivo);

      // 5. Separar los datos: columnas individuales vs JSON
      const individuales: Record<string, unknown> = {};
      const detalles: Record<string, unknown> = {};
      for (const [nombre, valor] of Object.entries(valoresFinales)) {
        (CAMPOS_INDIVIDUALES.includes(nombre) ? individuales : detalles)[nombre] = valor;
      }

      const { data: { user } } = await supabase.auth.getUser();
      const { error: errorInsert } = await supabase.from('recepciones').insert({
        ...individuales,
        detalles,
        pdf_url: urlData.publicUrl,
        monitor_id: user?.id,
      });
      if (errorInsert) throw errorInsert;

      setNumeroAsesoria(numero);
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof Error ? err.message : 'Ocurrió un error al guardar.' });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <div className="recepcion-page">
        <header className="recepcion-hero">
          <h2>Formato de recepción</h2>
          <p>Consultorio Jurídico · Unicórdoba</p>
        </header>

        <div className="recepcion-content">
          {paginas.map((pagina, i) => (
            <div key={i} className="recepcion-pagina" style={{ aspectRatio: `${pagina.width} / ${pagina.height}` }}>
              <canvas ref={(el) => { canvasRefs.current[i] = el; }} className="recepcion-canvas" />
              {campos.filter((c) => c.page === i).map((c) => {
                const [x, y, w, h] = c.rect;
                const estilo = {
                  left: `${(x / pagina.width) * 100}%`,
                  top: `${((pagina.height - y - h) / pagina.height) * 100}%`,
                  width: `${(w / pagina.width) * 100}%`,
                  height: `${(h / pagina.height) * 100}%`,
                };
                return c.type === 'checkbox' ? (
                  <input
                    key={c.name}
                    type="checkbox"
                    className="recepcion-campo recepcion-checkbox"
                    style={estilo}
                    checked={Boolean(valores[c.name])}
                    onChange={(e) => actualizar(c.name, e.target.checked)}
                  />
                ) : (
                  <input
                    key={c.name}
                    type="text"
                    className="recepcion-campo"
                    style={estilo}
                    value={(valores[c.name] as string) ?? ''}
                    onChange={(e) => actualizar(c.name, e.target.value)}
                  />
                );
              })}
            </div>
          ))}
        </div>

        <footer className="recepcion-footer">
          {mensaje && <div className={`form-message ${mensaje.tipo}`}>{mensaje.texto}</div>}
          <button className="btn-primary" onClick={guardarYDescargar} disabled={guardando || !pdfBytes}>
            {guardando ? 'Guardando...' : 'Guardar y descargar PDF'}
          </button>
        </footer>
      </div>

      {numeroAsesoria !== null && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-card-cuerpo">
              <h3>¡Recepción registrada!</h3>
              <p>Asesoría N.° <strong>{numeroAsesoria}</strong> registrada con éxito.</p>
            </div>
            <div className="modal-acciones">
              <button className="btn-primary" onClick={() => setNumeroAsesoria(null)}>Aceptar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}