import React from 'react';
import { E2EEProvider } from '../../e2ee-context.jsx';
import AppContent from './AppContent.jsx';

function E2EEWrapper() {
  const { token } = useAuth();

  return (
    <E2EEProvider token={token} API_URL={API_URL}>
      <AppContent />
    </E2EEProvider>
  );
}

export default E2EEWrapper;
