'use client';

import { ReactNode } from 'react';
import AdminSidebar from './AdminSidebar';

export default function PanelLayout({ children }: { children: ReactNode }) {
  return (
    <div className="panel-shell">
      <AdminSidebar />
      <div className="panel-main">{children}</div>
    </div>
  );
}