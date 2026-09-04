import { ReactNode } from 'react';
import PanelLayout from '@/components/PanelLayout'; // ajusta la ruta según dónde guardes el componente

export default function PanelGroupLayout({ children }: { children: ReactNode }) {
  return <PanelLayout>{children}</PanelLayout>;
}