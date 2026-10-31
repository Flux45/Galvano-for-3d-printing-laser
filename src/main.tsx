import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Guard against browser extensions or iframe wrappers attempting `window.fetch = ...`
// when Window.prototype.fetch is defined as a getter-only property.
try {
  let activeFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : undefined;
  Object.defineProperty(window, 'fetch', {
    get() {
      return activeFetch;
    },
    set(fn) {
      if (typeof fn === 'function') {
        activeFetch = fn;
      }
    },
    configurable: true,
    enumerable: true,
  });
} catch {
  // Ignore if property cannot be redefined
}

createRoot(document.getElementById('root')!).render(<App />);
