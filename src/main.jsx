import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

const style=document.createElement('style')
style.textContent='html.tf-home-mode body{background:linear-gradient(135deg,#f5f8ff,#eef3ff)}'
document.head.appendChild(style)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
