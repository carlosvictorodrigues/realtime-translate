import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FloatingWidget } from './views/FloatingWidget';

const container = document.getElementById('root');
if (!container) throw new Error('root not found');
createRoot(container).render(
  <StrictMode>
    <FloatingWidget />
  </StrictMode>,
);
