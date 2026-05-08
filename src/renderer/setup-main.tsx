import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SetupViewStub } from './views/SetupViewStub';

const container = document.getElementById('root');
if (!container) throw new Error('root not found');
createRoot(container).render(
  <StrictMode>
    <SetupViewStub />
  </StrictMode>,
);
