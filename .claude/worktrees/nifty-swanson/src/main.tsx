import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import { readEditorRuntimeFlags } from './app/editorRuntimeFlags';
import { scheduleBootShellRemoval } from './bootstrapShell';
import './index.css';

const runtimeFlags = readEditorRuntimeFlags();
const app = <App />;

ReactDOM.createRoot(document.getElementById('root')!).render(
  runtimeFlags.useStrictMode ? <React.StrictMode>{app}</React.StrictMode> : app,
);


scheduleBootShellRemoval();
