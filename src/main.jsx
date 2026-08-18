import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './home-glass.css'

const SECONDARY_HOME_ACTIONS = ['Install App', 'Install app', 'Client Portal', 'Announcement']

function isHomePage() {
  const text = document.body.innerText || ''
  return text.includes('Practice Hub') && text.includes('New Practice')
}

function markHomeElements() {
  const home = isHomePage()
  document.body.classList.toggle('tf-home-waves', home)

  if (!home) {
    document.querySelectorAll('.tf-home-secondary').forEach((el) => el.classList.remove('tf-home-secondary'))
    return
  }

  document.querySelectorAll('button, a, [role="button"]').forEach((el) => {
    const label = (el.innerText || el.getAttribute('aria-label') || '').trim()
    if (SECONDARY_HOME_ACTIONS.some((item) => label === item || label.includes(item))) {
      el.classList.add('tf-home-secondary')
    }
  })
}

const observer = new MutationObserver(markHomeElements)
observer.observe(document.body, { childList: true, subtree: true })
markHomeElements()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
