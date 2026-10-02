import { ReactNode } from 'react';

// Barra superior de cada panel: título + subtítulo a la izquierda,
// y a la derecha (opcional) el botón de acción de esa sección.
export default function PanelTopbar({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="cp-topbar">
      <div>
        <div className="cp-topbar-title">{title}</div>
        {subtitle && <div className="cp-topbar-sub">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}
