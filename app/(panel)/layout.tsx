import { ReactNode } from 'react';
import PanelLayout from '@/components/PanelLayout';

export default function PanelGroupLayout({ children }: { children: ReactNode }) {
  return <PanelLayout>{children}</PanelLayout>;
}