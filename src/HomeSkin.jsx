import { useEffect } from 'react'

const HOME_MARKERS = ['Practice Hub', 'New Practice']

function textOf(el) {
  return (el?.innerText || el?.textContent || '').trim()
}

function isHome() {
  const text = document.body?.innerText || ''
  return HOME_MARKERS.every((marker) => text.includes(marker))
}

function findPracticeGrid(root) {
  return [...root.querySelectorAll('div')].find((el) => {
    const style = getComputedStyle(el)
    if (style.display !== 'grid') return false
    const children = [...el.children]
    if (children.length === 0 || children.length > 12) return false
    return children.some((child) => {
      const t = textOf(child)
      return t.includes('0 Spaces') && t.includes('Clients') && t.includes('Work Types')
    })
  }) || null
}

function markPracticeCards(root) {
  const grid = findPracticeGrid(root)
  if (!grid) return

  grid.classList.add('tf-home-practice-grid')
  ;[...grid.children].forEach((card) => {
    if (!textOf(card).includes('0 Spaces')) return
    card.classList.add('tf-home-practice-card')
    ;[...card.children].forEach((child) => {
      const r = child.getBoundingClientRect?.()
      if (r && r.height <= 8 && r.width >= r.width * 0.7) child.classList.add('tf-home-strip-remove')
    })
  })
}

function markWorkspaceCards(root) {
  const heading = [...root.querySelectorAll('h2')].find((el) => textOf(el) === 'Workspaces')
  const pane = heading?.parentElement?.parentElement
  if (!pane) return

  pane.classList.add('tf-home-workspace-pane')
  const list = [...pane.querySelectorAll('div')].find((el) => {
    const style = getComputedStyle(el)
    if (style.display !== 'flex' || style.flexDirection !== 'column') return false
    return [...el.children].some((child) => textOf(child).includes('New Workspace'))
  })
  if (!list) return

  list.classList.add('tf-home-workspace-list')
  ;[...list.children].forEach((card) => card.classList.add('tf-home-workspace-card'))
}

function simplifyTopNav() {
  const nav = document.querySelector('nav')
  if (!nav) return
  const home = isHome()
  nav.classList.toggle('tf-topnav-home', home)

  if (!home) return
  // The Home header should not look like a workspace switcher.
  if (nav.children[2]) nav.children[2].classList.add('tf-home-nav-separator')
  if (nav.children[3]) nav.children[3].classList.add('tf-home-nav-workspaces')

  nav.querySelectorAll('button, [role="button"]').forEach((el) => {
    const label = textOf(el).toLowerCase()
    const title = (el.getAttribute('title') || '').toLowerCase()
    if (label.includes('install app') || label.includes('client portal') || title.includes('announcements') || title.includes('attendance')) {
      el.classList.add('tf-home-secondary-action')
    }
  })
}

function apply(root) {
  const home = isHome()
  document.body.classList.toggle('tf-home-active', home)
  root.classList.toggle('tf-home-active-root', home)

  if (!home) {
    root.querySelectorAll('.tf-home-practice-card, .tf-home-practice-grid, .tf-home-workspace-pane, .tf-home-workspace-list, .tf-home-workspace-card, .tf-home-strip-remove').forEach((el) => {
      el.classList.remove('tf-home-practice-card', 'tf-home-practice-grid', 'tf-home-workspace-pane', 'tf-home-workspace-list', 'tf-home-workspace-card', 'tf-home-strip-remove')
    })
    document.querySelectorAll('.tf-topnav-home').forEach((el) => el.classList.remove('tf-topnav-home'))
    document.querySelectorAll('.tf-home-secondary-action').forEach((el) => el.classList.remove('tf-home-secondary-action'))
    return
  }

  markPracticeCards(root)
  markWorkspaceCards(root)
  simplifyTopNav()
}

export default function HomeSkin() {
  useEffect(() => {
    const root = document.getElementById('root')
    if (!root) return undefined

    let raf = 0
    const schedule = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => apply(root))
    }

    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', schedule)
    window.addEventListener('popstate', schedule)
    window.addEventListener('hashchange', schedule)
    schedule()

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      window.removeEventListener('resize', schedule)
      window.removeEventListener('popstate', schedule)
      window.removeEventListener('hashchange', schedule)
    }
  }, [])

  return null
}
