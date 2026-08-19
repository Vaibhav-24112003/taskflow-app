import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import HomeSkin from './HomeSkin.jsx'
import './home-glass.css'
import './home-dark.css'
import './home-create-fix.js'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <HomeSkin />
  </React.StrictMode>
)
