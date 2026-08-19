import React, { useEffect, useRef, useState } from 'react'
import HomeOverview from './HomeOverview.jsx'
import { supabase, getMyWorkspaces } from './lib/supabase.js'

function textOf(el) {
  return (el?.innerText || el?.textContent || '').trim()
}

function isVisible(el) {
  if (!el) return false
  const r = el.getBoundingClientRect?.()
  const s = getComputedStyle(el)
  return !!r && r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden'
}

function legacyHomeVisible() {
  const root = document.getElementById('root')
  if (!root) return false
  return [...root.querySelectorAll('h1')].some((el) => textOf(el) === 'Practice Hub')
}

function hideLegacyHome() {
  const root = document.getElementById('root')
  if (!root) return
  const heading = [...root.querySelectorAll('h1')].find((el) => textOf(el) === 'Practice Hub')
  if (!heading) return
  let n = heading
  while (n && n.parentElement && n.parentElement !== root) {
    const s = getComputedStyle(n)
    if (s.flexGrow === '1' && s.overflowY === 'auto') {
      n.classList.add('tf-home-legacy')
      return
    }
    n = n.parentElement
  }
}

function removeHomeExtraItems() {
  document.querySelectorAll('[data-tf-home-extra]').forEach((el) => el.remove())
}

function findNav() {
  return document.querySelector('nav')
}

function captureNavActions() {
  const nav = findNav()
  if (!nav) return { install: null, portal: null, announcements: null, attendance: null, more: null }
  const buttons = [...nav.querySelectorAll('button,[role="button"]')]
  const more = buttons.find((b) => (b.getAttribute('title') || '').toLowerCase() === 'more') || null
  let install = buttons.find((b) => textOf(b).toLowerCase().includes('install app')) || null
  let portal = buttons.find((b) => textOf(b).toLowerCase().includes('client portal')) || null
  let announcements = buttons.find((b) => {
    const t = (b.getAttribute('title') || '').toLowerCase()
    const a = (b.getAttribute('aria-label') || '').toLowerCase()
    return t.includes('announcement') || a.includes('announcement')
  }) || null
  let attendance = buttons.find((b) => {
    const t = (b.getAttribute('title') || '').toLowerCase()
    const a = (b.getAttribute('aria-label') || '').toLowerCase()
    return t.includes('attendance') || a.includes('attendance')
  }) || null

  const moreIndex = more ? buttons.indexOf(more) : buttons.length
  const portalIndex = portal ? buttons.indexOf(portal) : -1
  if (!install && portalIndex > 0) install = buttons[portalIndex - 1]
  if (!portal && install) {
    const i = buttons.indexOf(install)
    if (i >= 0 && i + 1 < moreIndex) portal = buttons[i + 1]
  }
  if (!announcements && portalIndex >= 0) {
    const candidate = buttons[portalIndex + 1]
    if (candidate && buttons.indexOf(candidate) < moreIndex && candidate !== attendance) announcements = candidate
  }
  if (!attendance && announcements) {
    const i = buttons.indexOf(announcements)
    const candidate = buttons[i + 1]
    if (candidate && buttons.indexOf(candidate) < moreIndex) attendance = candidate
  }
  return { install, portal, announcements, attendance, more }
}

function applyGlobalUtilityNav(actionRefs) {
  const nav = findNav()
  if (!nav) return
  ;[actionRefs.install, actionRefs.portal, actionRefs.announcements, actionRefs.attendance]
    .filter(Boolean)
    .forEach((el) => el.classList.add('tf-home-secondary-action'))
}

function restoreGlobalUtilityNav() {
  document.querySelectorAll('.tf-home-secondary-action').forEach((el) => el.classList.remove('tf-home-secondary-action'))
}

function openWorkspaceDirectly(ws) {
  if (!ws?.id) return
  localStorage.setItem('tf_lastWsId', ws.id)
  localStorage.removeItem('tf_lastOrgId')
  localStorage.removeItem('tf_lastOrgModule')
  localStorage.removeItem('tf_lastOrgTab')
  window.location.reload()
}

function openPracticeDirectly(org) {
  if (!org?.id) return
  localStorage.setItem('tf_lastOrgId', org.id)
  localStorage.removeItem('tf_lastWsId')
  localStorage.removeItem('tf_lastOrgModule')
  localStorage.removeItem('tf_lastOrgTab')
  window.location.reload()
}

function clickLegacyCard(text, preferText = '') {
  const root = document.getElementById('root')
  if (!root) return
  const candidates = [...root.querySelectorAll('*')].filter((el) => {
    if (textOf(el) !== text) return false
    if (el.closest('.tf-home-overlay')) return false
    return true
  })
  for (const node of candidates) {
    let cur = node
    for (let i = 0; i < 7 && cur && cur !== root; i += 1, cur = cur.parentElement) {
      if ((preferText && !textOf(cur).includes(preferText)) && i > 0) continue
      if (getComputedStyle(cur).cursor === 'pointer') {
        cur.click()
        return
      }
    }
  }
  candidates[0]?.click()
}

function clickVisibleHomeButton(text) {
  const overlay = document.querySelector('.tf-home-overlay')
  if (!overlay) return false
  const target = [...overlay.querySelectorAll('button,[role="button"]')]
    .filter((el) => textOf(el).toLowerCase().includes(text.toLowerCase()))
    .find(isVisible)
  if (!target) return false
  target.click()
  return true
}

function addGlobalMoreItems(actionRefs) {
  const nav = findNav()
  const more = actionRefs.more || nav?.querySelector('button[title="More"]')
  if (!nav || !more) return
  const wrapper = more.parentElement
  const menu = [...(wrapper?.querySelectorAll('div') || [])].find((el) => {
    const t = textOf(el).toLowerCase()
    const s = getComputedStyle(el)
    return s.position === 'absolute' && t.includes('quick notes') && t.includes('get help') && (t.includes('dark mode') || t.includes('light mode'))
  })
  if (!menu || menu.querySelector('[data-tf-home-extra]')) return

  const items = [
    ['Install app', actionRefs.install],
    ['Client Portal', actionRefs.portal],
    ['Announcements', actionRefs.announcements],
    ['Attendance', actionRefs.attendance],
  ]

  items.filter(([, target]) => !!target).forEach(([label, target]) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.dataset.tfHomeExtra = '1'
    b.textContent = label
    b.style.cssText = 'width:100%;text-align:left;display:flex;align-items:center;gap:10px;padding:10px 14px;border:none;border-top:1px solid var(--tf-border);background:transparent;cursor:pointer;font-family:inherit;font-size:13px;font-weight:600;color:var(--tf-text)'
    b.onmouseenter = () => { b.style.background = 'var(--tf-surface)' }
    b.onmouseleave = () => { b.style.background = 'transparent' }
    b.onclick = () => {
      target.click()
      setTimeout(() => {
        if (isVisible(menu)) more.click()
      }, 0)
    }
    menu.appendChild(b)
  })
}

export default function HomeSkin() {
  const [home, setHome] = useState(false)
  const [data, setData] = useState({ orgs: [], workspaces: [], profiles: [], user: null })
  const navActionsRef = useRef({ install: null, portal: null, announcements: null, attendance: null, more: null })

  async function loadData() {
    const auth = await supabase.auth.getUser()
    const user = auth.data?.user
    if (!user) {
      setData({ orgs: [], workspaces: [], profiles: [], user: null })
      return
    }
    const [or, wr, pr] = await Promise.all([
      supabase.from('organizations').select('*').order('name').limit(100),
      getMyWorkspaces(user.id),
      supabase.from('profiles').select('id,name,email').limit(500),
    ])
    setData({ orgs: or.data || [], workspaces: wr.data || [], profiles: pr.data || [], user })
  }

  useEffect(() => {
    let raf = 0
    const schedule = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const refs = captureNavActions()
        navActionsRef.current = refs
        applyGlobalUtilityNav(refs)
        const h = legacyHomeVisible()
        setHome(h)
        if (h) hideLegacyHome()
        if (!h) document.body.classList.remove('tf-home-active')
        else document.body.classList.add('tf-home-active')
      })
    }
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    const click = (e) => {
      const b = e.target?.closest?.('button')
      if (!b || (b.getAttribute('title') || '').toLowerCase() !== 'more') return
      setTimeout(() => addGlobalMoreItems(navActionsRef.current), 0)
    }
    document.addEventListener('click', click)
    window.addEventListener('resize', schedule)
    window.addEventListener('popstate', schedule)
    window.addEventListener('hashchange', schedule)
    schedule()
    loadData()
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      document.removeEventListener('click', click)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('popstate', schedule)
      window.removeEventListener('hashchange', schedule)
      removeHomeExtraItems()
      restoreGlobalUtilityNav()
    }
  }, [])

  if (!home) return null

  return (
    <div className="tf-home-overlay">
      <HomeOverview
        orgs={data.orgs}
        workspaces={data.workspaces}
        allProfiles={data.profiles}
        supabase={supabase}
        cu={data.user}
        onOpenOrg={openPracticeDirectly}
        onOpenWorkspace={openWorkspaceDirectly}
        onCreateOrg={() => {
          if (!clickVisibleHomeButton('New Practice')) {
            clickLegacyCard('+ New Practice')
            clickLegacyCard('Create Practice')
          }
        }}
      />
    </div>
  )
}
