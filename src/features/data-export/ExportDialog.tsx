import { useRef, useState } from 'react';
import { FeedbackMessage } from '../../app/components/FeedbackMessage';
import { dataExportService, type ExportFormat } from './exportService';

export function ExportDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [formatInProgress, setFormatInProgress] = useState<ExportFormat | null>(null);
  const [error, setError] = useState(false);

  async function handleDownload(format: ExportFormat) {
    setError(false);
    setFormatInProgress(format);

    try {
      const file = await dataExportService.createExport(format);
      const objectUrl = URL.createObjectURL(new Blob([file.content], { type: file.mimeType }));
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = file.filename;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      setError(true);
    } finally {
      setFormatInProgress(null);
    }
  }

  return (
    <>
      <button
        className="data-export__trigger"
        onClick={() => dialogRef.current?.showModal()}
        type="button"
      >
        Exportar datos
      </button>
      <dialog aria-labelledby="data-export-heading" className="data-export-dialog" ref={dialogRef}>
        <header className="data-export-dialog__heading">
          <h2 id="data-export-heading">Exportar tus datos</h2>
          <button onClick={() => dialogRef.current?.close()} type="button">
            Cerrar
          </button>
        </header>
        <div aria-busy={formatInProgress !== null} className="data-export-dialog__actions">
          <button
            disabled={formatInProgress !== null}
            onClick={() => void handleDownload('csv')}
            type="button"
          >
            {formatInProgress === 'csv' ? 'Preparando CSV...' : 'Descargar CSV'}
          </button>
          <button
            disabled={formatInProgress !== null}
            onClick={() => void handleDownload('json')}
            type="button"
          >
            {formatInProgress === 'json' ? 'Preparando JSON...' : 'Descargar JSON'}
          </button>
        </div>
        {error ? (
          <FeedbackMessage tone="error">
            No se pudo preparar la exportación. Comprueba la conexión e inténtalo de nuevo.
          </FeedbackMessage>
        ) : null}
      </dialog>
    </>
  );
}
