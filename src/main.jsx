import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './home-glass.css'

const SECONDARY_HOME_ACTIONS = ['Install App', 'Install app', 'Client Portal', 'Announcement']
const HOME_WORKSPACE_TABS = ['Anulom', 'PSCO To Do', 'Personal TO DO']

function textOf(el) {
  return (el?.innerText || el?.textContent || '').trim()
}

function findHomeRoot() {
  const heading = [...document.querySelectorAll('h1,h2,h3')].find((el) => textOf(el) === 'Practice Hub')
  if (!heading) return null
  return heading.parentElement?.parentElement?.parentElement?.parentElement || null
}

function markCards(root) {
  if (!root) return
  root.querySelectorAll('.tf-home-card').forEach((el) => el.classList.remove('tf-home-card'))

  ;[...root.querySelectorAll('div')].forEach((el) => {
    const t = textOf(el)
    if (!t || t.length > 500 || !t.includes('0 Spaces') || !t.includes('Clients') || !t.includes('Work Types')) return
    let node = el
    for (let i = 0; i < 5 && node && node !== root; i++, node = node.parentElement) {
      if (node.style?.borderTop || node.style?.boxShadow || node.style?.border) {
        node.classList.add('tf-home-card')
        break
      }
    }
  })
}

function markHomeElements() {
  const root = findHomeRoot()
  const home = !!root
  document.body.classList.toggle('tf-home-waves', home)
  if (!home) return

  root.classList.add('tf-home-root')
  markCards(root)

  document.querySelectorAll('button, a, [role="button"]').forEach((el) => {
    const label = textOf(el)
    if (SECONDARY_HOME_ACTIONS.some((item) => label === item || label.includes(item))) {
      el.classList.add('tf-home-secondary')
    } else {
      el.classList.remove('tf-home-secondary')
    }
    if (HOME_WORKSPACE_TABS.includes(label)) {
      el.classList.add('tf-home-nav-workspace')
    }
  })
}

let scheduled = false
function scheduleMark() {
  if (scheduled) return
  scheduled = true
  requestAnimationFrame(() => {
    scheduled = false
    markHomeElements()
  })
}

const observer = new MutationObserver(scheduleMark)
observer.observe(document.body, { childList: true, subtree: true })
window.addEventListener('popstate', scheduleMark)
window.addEventListener('hashchange', scheduleMark)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

scheduleMark()
