import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import { readEditorRuntimeFlags } from './app/editorRuntimeFlags';
import { scheduleBootShellRemoval } from './bootstrapShell';
import './styles/base.css';
import './styles/shared-controls.css';
import './styles/toolbar.css';
import './styles/tool-palette.css';
import './styles/editor-layout.css';
import './styles/canvas.css';
import './styles/panel.css';
import './styles/inspector.css';
import './styles/pickers.css';
import './styles/layers.css';

const runtimeFlags = readEditorRuntimeFlags();
const app = <App />;

ReactDOM.createRoot(document.getElementById('root')!).render(
  runtimeFlags.useStrictMode ? <React.StrictMode>{app}</React.StrictMode> : app,
);


scheduleBootShellRemoval();
