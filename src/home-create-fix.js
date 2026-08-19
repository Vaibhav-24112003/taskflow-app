// Robust Home → Create Practice bridge.
// The Home overlay is a separate React surface, while the existing Create Practice
// flow lives in the legacy Home component. Route the Home click to that real handler.
function textOf(el) {
  return (el?.innerText || el?.textContent || '').trim().toLowerCase()
}

function findLegacyCreatePracticeButton() {
  const candidates = [...document.querySelectorAll('button,[role="button"]')]
    .filter((el) => !el.closest('.tf-home-overlay'))

  return candidates.find((el) => {
    const text = textOf(el)
    return text === '+ new practice' || text === 'new practice' || text === 'create practice'
  }) || null
}

document.addEventListener('click', (event) => {
  const button = event.target?.closest?.('button,[role="button"]')
  if (!button || !button.closest('.tf-home-overlay')) return

  const text = textOf(button)
  if (!text.includes('new practice') && !text.includes('create practice')) return

  const target = findLegacyCreatePracticeButton()
  if (!target || target === button) return

  // Prevent the Home overlay button from calling its own fallback/DOM lookup.
  event.preventDefault()
  event.stopImmediatePropagation()
  target.click()
}, true)
