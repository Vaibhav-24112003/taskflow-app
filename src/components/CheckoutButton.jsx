// src/components/CheckoutButton.jsx
// Handles the full Razorpay checkout flow — calls create-order Edge Function,
// opens Razorpay modal, webhook handles the rest automatically
import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

export default function CheckoutButton({
  orgId,
  planId,
  billingCycle = 'monthly',
  label = 'Upgrade Plan',
  className = '',
  onSuccess,
}) {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  async function handleCheckout() {
    setLoading(true)
    setError(null)

    try {
      // 1. Get order from our Edge Function (server-side, keys never in browser)
      const { data, error: fnErr } = await supabase.functions.invoke('create-order', {
        body: { org_id: orgId, plan_id: planId, billing_cycle: billingCycle }
      })
      if (fnErr || !data?.order_id) throw new Error(fnErr?.message || 'Could not create order')

      // 2. Dynamically load Razorpay script if not already loaded
      if (!window.Razorpay) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script')
          s.src = 'https://checkout.razorpay.com/v1/checkout.js'
          s.onload  = resolve
          s.onerror = () => reject(new Error('Failed to load Razorpay'))
          document.head.appendChild(s)
        })
      }

      // 3. Open Razorpay modal
      const rzp = new window.Razorpay({
        key:         data.key_id,
        order_id:    data.order_id,
        amount:      data.amount,
        currency:    data.currency || 'INR',
        name:        'TaskFlowCo',
        description: `${data.plan_name} — ${billingCycle}`,
        theme:       { color: '#2F6BFF' },
        prefill:     {},
        handler: function () {
          // Payment captured on Razorpay's side.
          // Webhook (razorpay-webhook) handles DB update + Zoho invoice automatically.
          // Just show success UI — don't update DB from here.
          setLoading(false)
          onSuccess?.()
        },
        modal: {
          ondismiss: () => setLoading(false),
          escape: true,
        }
      })
      rzp.on('payment.failed', (resp) => {
        setError(resp?.error?.description || 'Payment failed')
        setLoading(false)
      })
      rzp.open()
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 6 }}>
      <button
        onClick={handleCheckout}
        disabled={loading}
        className={className}
        style={{
          display:        'inline-flex',
          alignItems:     'center',
          gap:            8,
          background:     loading ? '#93a8c8' : '#2F6BFF',
          color:          '#fff',
          border:         'none',
          borderRadius:   11,
          padding:        '11px 22px',
          fontSize:       13,
          fontWeight:     800,
          cursor:         loading ? 'not-allowed' : 'pointer',
          transition:     'background .2s',
        }}
      >
        {loading ? (
          <><span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin .7s linear infinite' }} /> Processing…</>
        ) : label}
      </button>
      {error && (
        <span style={{ fontSize: 11, color: '#ef4444', maxWidth: 260 }}>⚠ {error}</span>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
