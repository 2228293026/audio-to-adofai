import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './styles/main.css'

// Error handler
window.onerror = function(msg, url, line, col, error) {
  console.error('Global error:', {msg, url, line, col, error});
  return false;
};

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled rejection:', event.reason);
});

const root = document.getElementById('root');
if (!root) {
  console.error('Root element not found!');
  document.body.innerHTML = '<h1 style="color:red">Error: Root element #root not found</h1>';
} else {
  console.log('Root element found, rendering App...');
  try {
    ReactDOM.createRoot(root).render(
      <App />
    );
    console.log('App rendered successfully');
  } catch (err) {
    console.error('Render error:', err as Error);
    root.innerHTML = `<h1 style="color:red">React Error: ${(err as Error).message}</h1><pre>${(err as Error).stack}</pre>`;
  }
}
