import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './home-glass.css'

function syncHomeStyle(){
  const text=document.body.innerText||''
  document.body.classList.toggle('tf-home-waves',text.includes('Practice Hub')&&text.includes('New Practice'))
}
setInterval(syncHomeStyle,1000)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
