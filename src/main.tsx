import {StrictMode, createElement} from 'react';
// @ts-expect-error react-dom/client types are not installed in this project.
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  createElement(StrictMode, null, createElement(App)),
);
