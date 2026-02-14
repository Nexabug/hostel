import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'

const CURRENCY = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const STUDENT_KEY = 'hostel_student_token'
const ADMIN_KEY = 'hostel_admin_token'

function App() {
  const [studentToken, setStudentToken] = useState(localStorage.getItem(STUDENT_KEY) || '')
  const [adminToken, setAdminToken] = useState(localStorage.getItem(ADMIN_KEY) || '')
  const [student, setStudent] = useState(null)
  const [activeView, setActiveView] = useState('customer')
  const [menu, setMenu] = useState([])
  const [cart, setCart] = useState({})
  const [orders, setOrders] = useState([])
  const [status, setStatus] = useState('Connecting...')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [adminNotice, setAdminNotice] = useState('')
  const [authNotice, setAuthNotice] = useState('')
  const [authMode, setAuthMode] = useState('email')
  const [authForm, setAuthForm] = useState({ name: '', email: '', googleId: '' })
  const [adminPin, setAdminPin] = useState('')
  const [form, setForm] = useState({
    customerName: '',
    roomNumber: '',
    phone: '',
    paymentMethod: 'cash',
    notes: '',
  })

  const groupedMenu = useMemo(() => {
    const groups = {}
    for (const item of menu) {
      if (!groups[item.category]) groups[item.category] = []
      groups[item.category].push(item)
    }
    return groups
  }, [menu])

  const cartItems = useMemo(
    () =>
      menu
        .map((item) => ({ ...item, quantity: cart[item.id] || 0 }))
        .filter((item) => item.quantity > 0),
    [menu, cart],
  )

  const total = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cartItems],
  )

  function authHeaders(token) {
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  const loadData = useCallback(async (currentStudentToken = studentToken, currentAdminToken = adminToken) => {
    try {
      const requests = [
        fetch('/api/health'),
        fetch('/api/menu'),
        fetch('/api/orders/my', { headers: authHeaders(currentStudentToken) }),
      ]
      if (currentAdminToken) {
        requests.push(fetch('/api/orders/admin?limit=100', { headers: authHeaders(currentAdminToken) }))
      } else {
        requests.push(Promise.resolve(null))
      }

      const [healthResponse, menuResponse, myOrdersResponse, adminOrdersResponse] = await Promise.all(requests)
      if (!healthResponse.ok || !menuResponse.ok) throw new Error('Could not reach ordering service')
      if (myOrdersResponse && myOrdersResponse.status === 401) throw new Error('Please login again')

      const health = await healthResponse.json()
      const menuData = await menuResponse.json()
      const myOrdersData = myOrdersResponse ? await myOrdersResponse.json() : { orders: [] }
      const adminOrdersData =
        adminOrdersResponse && adminOrdersResponse.ok ? await adminOrdersResponse.json() : null

      setStatus(`Live: ${new Date(health.timestamp).toLocaleTimeString()}`)
      setMenu(menuData.items)
      setOrders(adminOrdersData ? adminOrdersData.orders : myOrdersData.orders)
    } catch {
      setStatus('Server is offline')
    }
  }, [studentToken, adminToken])

  useEffect(() => {
    if (studentToken) {
      loadData(studentToken, adminToken)
    }
  }, [studentToken, adminToken, loadData])

  function updateQuantity(itemId, quantity) {
    setCart((current) => {
      const next = { ...current }
      if (quantity <= 0) delete next[itemId]
      else next[itemId] = quantity
      return next
    })
  }

  function onFieldChange(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  function onAuthField(event) {
    const { name, value } = event.target
    setAuthForm((current) => ({ ...current, [name]: value }))
  }

  async function studentLogin(event) {
    event.preventDefault()
    setAuthNotice('')
    const endpoint =
      authMode === 'email' ? '/api/auth/student/email-login' : '/api/auth/student/google-login'

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: authForm.name,
          email: authForm.email,
          googleId: authMode === 'google' ? authForm.googleId : undefined,
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.message || 'Login failed')

      localStorage.setItem(STUDENT_KEY, payload.token)
      setStudentToken(payload.token)
      setStudent(payload.student)
      setForm((current) => ({
        ...current,
        customerName: payload.student.name || '',
      }))
      setAuthNotice('')
    } catch (error) {
      setAuthNotice(error.message)
    }
  }

  async function adminLogin(event) {
    event.preventDefault()
    setAdminNotice('')
    try {
      const response = await fetch('/api/auth/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: adminPin }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.message || 'Admin login failed')

      localStorage.setItem(ADMIN_KEY, payload.token)
      setAdminToken(payload.token)
      setAdminPin('')
      setAdminNotice('Admin access granted.')
      await loadData(studentToken, payload.token)
    } catch (error) {
      setAdminNotice(error.message)
    }
  }

  async function logoutStudent() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: authHeaders(studentToken),
      })
    } catch {
      // ignore logout failures
    }
    localStorage.removeItem(STUDENT_KEY)
    localStorage.removeItem(ADMIN_KEY)
    setStudentToken('')
    setAdminToken('')
    setStudent(null)
    setOrders([])
    setCart({})
  }

  async function logoutAdmin() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: authHeaders(adminToken),
      })
    } catch {
      // ignore logout failures
    }
    localStorage.removeItem(ADMIN_KEY)
    setAdminToken('')
    setAdminNotice('Admin logged out.')
    await loadData(studentToken, '')
  }

  async function placeOrder(event) {
    event.preventDefault()
    if (cartItems.length === 0) {
      setNotice('Please add at least one item to your cart.')
      return
    }
    setSaving(true)
    setNotice('')

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(studentToken),
        },
        body: JSON.stringify({
          ...form,
          items: cartItems.map((item) => ({
            itemId: item.id,
            quantity: item.quantity,
          })),
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.message || 'Order failed')

      setNotice(`Order confirmed: ${payload.order.orderNumber}`)
      setCart({})
      setForm((current) => ({ ...current, notes: '' }))
      await loadData(studentToken, adminToken)
    } catch (error) {
      setNotice(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(orderId, nextStatus) {
    try {
      const response = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(adminToken),
        },
        body: JSON.stringify({ status: nextStatus }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.message || 'Status update failed')
      setAdminNotice(`Order ${payload.order.orderNumber} updated to ${nextStatus}.`)
      await loadData(studentToken, adminToken)
    } catch (error) {
      setAdminNotice(error.message)
    }
  }

  async function clearOrder(orderId) {
    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: 'DELETE',
        headers: authHeaders(adminToken),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.message || 'Could not clear order')
      setAdminNotice(`Cleared ${payload.order.orderNumber}.`)
      await loadData(studentToken, adminToken)
    } catch (error) {
      setAdminNotice(error.message)
    }
  }

  if (!studentToken) {
    return (
      <main className="page">
        <section className="hero">
          <div>
            <p className="eyebrow">Hostel Canteen Ordering</p>
            <h1>Student Login</h1>
            <p className="subtext">Sign in with email or Google access to place orders.</p>
          </div>
          <div className="status-chip">Secure Access</div>
        </section>

        <section className="panel auth-panel">
          <div className="view-switch">
            <button
              type="button"
              className={authMode === 'email' ? 'active' : ''}
              onClick={() => setAuthMode('email')}
            >
              Email Login
            </button>
            <button
              type="button"
              className={authMode === 'google' ? 'active' : ''}
              onClick={() => setAuthMode('google')}
            >
              Google Login
            </button>
          </div>

          <form className="checkout-form" onSubmit={studentLogin}>
            <input name="name" value={authForm.name} onChange={onAuthField} placeholder="Full name" required />
            <input
              type="email"
              name="email"
              value={authForm.email}
              onChange={onAuthField}
              placeholder="Email"
              required
            />
            {authMode === 'google' && (
              <input
                name="googleId"
                value={authForm.googleId}
                onChange={onAuthField}
                placeholder="Google ID (demo)"
                required
              />
            )}
            <button type="submit">
              {authMode === 'email' ? 'Continue with Email' : 'Continue with Google'}
            </button>
          </form>
          {authNotice && <p className="notice">{authNotice}</p>}
        </section>
      </main>
    )
  }

  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">Hostel Canteen Ordering</p>
          <h1>Welcome {student?.name || 'Student'}</h1>
          <p className="subtext">Order quickly and track your requests in one place.</p>
        </div>
        <div className="hero-actions">
          <div className="status-chip">{status}</div>
          <button type="button" className="link-btn" onClick={logoutStudent}>
            Logout
          </button>
        </div>
      </section>

      <section className="view-switch">
        <button
          type="button"
          className={activeView === 'customer' ? 'active' : ''}
          onClick={() => {
            setActiveView('customer')
            loadData(studentToken, adminToken)
          }}
        >
          Customer
        </button>
        <button
          type="button"
          className={activeView === 'admin' ? 'active' : ''}
          onClick={() => {
            setActiveView('admin')
            loadData(studentToken, adminToken)
          }}
        >
          Admin Panel
        </button>
      </section>

      {activeView === 'customer' ? (
        <>
          <section className="layout">
            <article className="panel menu-panel">
              <h2>Menu</h2>
              {Object.entries(groupedMenu).map(([category, items]) => (
                <div className="category" key={category}>
                  <h3>{category}</h3>
                  <div className="item-grid">
                    {items.map((item) => (
                      <div className="item-card" key={item.id}>
                        <p className="item-title">{item.name}</p>
                        <p className="item-price">{CURRENCY.format(item.price)}</p>
                        <div className="qty-row">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.id, (cart[item.id] || 0) - 1)}
                            disabled={!cart[item.id]}
                          >
                            -
                          </button>
                          <span>{cart[item.id] || 0}</span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.id, (cart[item.id] || 0) + 1)}
                            disabled={!item.inStock}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </article>

            <article className="panel checkout-panel">
              <h2>Checkout</h2>
              <form className="checkout-form" onSubmit={placeOrder}>
                <input
                  name="customerName"
                  value={form.customerName}
                  onChange={onFieldChange}
                  placeholder="Your name"
                  required
                />
                <input
                  name="roomNumber"
                  value={form.roomNumber}
                  onChange={onFieldChange}
                  placeholder="Room number"
                  required
                />
                <input
                  name="phone"
                  value={form.phone}
                  onChange={onFieldChange}
                  placeholder="Phone number"
                  required
                />
                <select
                  name="paymentMethod"
                  value={form.paymentMethod}
                  onChange={onFieldChange}
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                </select>
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={onFieldChange}
                  placeholder="Notes (less spicy, no onion, etc.)"
                  rows={3}
                />

                <div className="cart-box">
                  {cartItems.length === 0 ? (
                    <p>Your cart is empty.</p>
                  ) : (
                    <>
                      {cartItems.map((item) => (
                        <p key={item.id}>
                          {item.name} x {item.quantity}
                        </p>
                      ))}
                      <p className="total">Total: {CURRENCY.format(total)}</p>
                    </>
                  )}
                </div>

                <button type="submit" disabled={saving}>
                  {saving ? 'Placing Order...' : 'Place Order'}
                </button>
                {notice && <p className="notice">{notice}</p>}
              </form>
            </article>
          </section>

          <section className="panel recent-panel">
            <h2>Your Recent Orders</h2>
            {orders.length === 0 ? (
              <p>No orders yet.</p>
            ) : (
              <ul>
                {orders.slice(0, 10).map((order) => (
                  <li key={order.id}>
                    <strong>{order.orderNumber}</strong> - Room {order.roomNumber} - {order.status}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : (
        <section className="panel admin-panel">
          <h2>Admin Orders</h2>
          {!adminToken ? (
            <form className="checkout-form admin-login" onSubmit={adminLogin}>
              <p>Enter admin PIN to manage orders:</p>
              <input
                type="password"
                value={adminPin}
                onChange={(event) => setAdminPin(event.target.value)}
                placeholder="Admin PIN"
                required
              />
              <button type="submit">Unlock Admin</button>
              {adminNotice && <p className="notice">{adminNotice}</p>}
            </form>
          ) : (
            <>
              <div className="admin-topbar">
                <p className="admin-subtext">
                  Manage all orders, update status, and clear delivered/cancelled orders.
                </p>
                <button type="button" className="link-btn" onClick={logoutAdmin}>
                  Logout Admin
                </button>
              </div>

              {adminNotice && <p className="notice">{adminNotice}</p>}
              <div className="admin-list">
                {orders.length === 0 ? (
                  <p>No active orders.</p>
                ) : (
                  orders.map((order) => {
                    const canClear = order.status === 'delivered' || order.status === 'cancelled'
                    return (
                      <article className="admin-card" key={order.id}>
                        <div className="admin-head">
                          <h3>{order.orderNumber}</h3>
                          <span className={`status-badge ${order.status}`}>{order.status}</span>
                        </div>
                        <p>
                          <strong>Name:</strong> {order.customerName}
                        </p>
                        <p>
                          <strong>Email:</strong> {order.studentEmail}
                        </p>
                        <p>
                          <strong>Room:</strong> {order.roomNumber}
                        </p>
                        <p>
                          <strong>Phone:</strong> {order.phone}
                        </p>
                        <p>
                          <strong>Total:</strong> {CURRENCY.format(order.total)}
                        </p>
                        <p>
                          <strong>Items:</strong>{' '}
                          {order.items.map((item) => `${item.name} x${item.quantity}`).join(', ')}
                        </p>
                        {order.notes && (
                          <p>
                            <strong>Notes:</strong> {order.notes}
                          </p>
                        )}

                        <div className="admin-actions">
                          <button type="button" onClick={() => changeStatus(order.id, 'accepted')}>
                            Confirm
                          </button>
                          <button type="button" onClick={() => changeStatus(order.id, 'preparing')}>
                            Preparing
                          </button>
                          <button type="button" onClick={() => changeStatus(order.id, 'delivered')}>
                            Delivered
                          </button>
                          <button
                            type="button"
                            className="danger"
                            disabled={!canClear}
                            onClick={() => clearOrder(order.id)}
                          >
                            Clear Order
                          </button>
                        </div>
                      </article>
                    )
                  })
                )}
              </div>
            </>
          )}
        </section>
      )}
    </main>
  )
}

export default App
