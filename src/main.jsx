import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './home-glass.css'

const SECONDARY_HOME_ACTIONS = ['Install App', 'Install app', 'Client Portal', 'Announcement']
const HOME_WORKSPACE_TABS = ['Anulom', 'PSCO To Do', 'Personal TO DO']

function textOf(el) {
  return (el?.innerText || el?.textContent || '').trim()
}

function isHomePage() {
  const text = document.body.innerText || ''
  return text.includes('Practice Hub') && text.includes('New Practice')
}

function markCards(root) {
  if (!root) return

  root.querySelectorAll('.tf-home-card').forEach((el) => el.classList.remove('tf-home-card'))
  root.querySelectorAll('.tf-home-strip').forEach((el) => el.classList.remove('tf-home-strip'))

  const candidates = [...root.querySelectorAll('div')].filter((el) => {
    const t = textOf(el)
    return t && t.length <= 500 && t.includes('0 Spaces') && t.includes('Clients') && t.includes('Work Types')
  })

  candidates.forEach((el) => {
    let card = el
    for (let i = 0; i < 6 && card && card !== root; i++, card = card.parentElement) {
      const rect = card.getBoundingClientRect?.()
      if (rect && rect.width > 220 && rect.height > 100) {
        card.classList.add('tf-home-card')
        break
      }
    }
  })

  root.querySelectorAll('.tf-home-card').forEach((card) => {
    ;[...card.children].forEach((child) => {
      const rect = child.getBoundingClientRect?.()
      if (!rect) return
      if (rect.height <= 8 && rect.width >= card.getBoundingClientRect().width * 0.7) {
        child.classList.add('tf-home-strip')
      }
    })
  })
}

function markHomeElements() {
  const home = isHomePage()
  document.body.classList.toggle('tf-home-waves', home)

  const root = document.getElementById('root')
  if (!root) return

  if (!home) {
    root.classList.remove('tf-home-root')
    root.querySelectorAll('.tf-home-card, .tf-home-strip, .tf-home-secondary, .tf-home-nav-workspace')
      .forEach((el) => el.classList.remove('tf-home-card', 'tf-home-strip', 'tf-home-secondary', 'tf-home-nav-workspace'))
    return
  }

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
    } else {
      el.classList.remove('tf-home-nav-workspace')
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
