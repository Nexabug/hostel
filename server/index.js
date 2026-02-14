import cors from 'cors'
import crypto from 'node:crypto'
import express from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const app = express()
const PORT = process.env.PORT || 5000

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dbPath = path.join(__dirname, 'data', 'db.json')

const ADMIN_PIN = process.env.ADMIN_PIN || '1234'

const seedMenu = [
  { id: 'm1', name: 'Classic Masala Maggi', category: 'Maggi', price: 45, inStock: true },
  { id: 'm2', name: 'Cheese Maggi', category: 'Maggi', price: 65, inStock: true },
  { id: 'm3', name: 'Egg Maggi', category: 'Maggi', price: 70, inStock: true },
  { id: 'd1', name: 'Coca-Cola (500ml)', category: 'Cold Drinks', price: 40, inStock: true },
  { id: 'd2', name: 'Sprite (500ml)', category: 'Cold Drinks', price: 40, inStock: true },
  { id: 'd3', name: 'Cold Coffee', category: 'Cold Drinks', price: 55, inStock: true },
  { id: 's1', name: 'Salted Chips', category: 'Snacks', price: 25, inStock: true },
  { id: 's2', name: 'Aloo Bhujia', category: 'Snacks', price: 30, inStock: true },
  { id: 's3', name: 'Nachos', category: 'Snacks', price: 45, inStock: true },
  { id: 'b1', name: 'Parle-G Biscuit', category: 'Biscuits', price: 10, inStock: true },
  { id: 'b2', name: 'Oreo Biscuit', category: 'Biscuits', price: 30, inStock: true },
]

app.use(cors())
app.use(express.json())

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex')
}

function makeToken() {
  return crypto.randomBytes(24).toString('hex')
}

async function ensureDb() {
  try {
    await fs.access(dbPath)
  } catch {
    const initial = {
      menu: seedMenu,
      orders: [],
      sessions: [],
      students: [],
      admins: [{ id: 'admin-1', pinHash: sha256(ADMIN_PIN) }],
      meta: { nextOrderId: 1001 },
    }
    await fs.mkdir(path.dirname(dbPath), { recursive: true })
    await fs.writeFile(dbPath, JSON.stringify(initial, null, 2), 'utf8')
  }
}

async function readDb() {
  const raw = await fs.readFile(dbPath, 'utf8')
  return JSON.parse(raw)
}

async function writeDb(db) {
  await fs.writeFile(dbPath, JSON.stringify(db, null, 2), 'utf8')
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function pickAuthToken(req) {
  const authHeader = String(req.headers.authorization || '')
  if (!authHeader.startsWith('Bearer ')) return ''
  return authHeader.slice('Bearer '.length).trim()
}

async function requireAuth(req, res, role) {
  const token = pickAuthToken(req)
  if (!token) {
    res.status(401).json({ message: 'missing auth token' })
    return null
  }

  const db = await readDb()
  const session = db.sessions.find((entry) => entry.token === token && entry.role === role)
  if (!session) {
    res.status(401).json({ message: 'invalid or expired token' })
    return null
  }

  return { db, session }
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.post('/api/auth/student/email-login', async (req, res) => {
  const name = String(req.body?.name || '').trim()
  const email = normalizeEmail(req.body?.email)

  if (!name || !email || !email.includes('@')) {
    return res.status(400).json({ message: 'valid name and email are required' })
  }

  const db = await readDb()
  let student = db.students.find((entry) => entry.email === email)
  if (!student) {
    student = { id: `stu-${Date.now()}`, name, email, provider: 'email' }
    db.students.push(student)
  } else {
    student.name = name
    student.provider = 'email'
  }

  const token = makeToken()
  db.sessions = db.sessions.filter((entry) => !(entry.role === 'student' && entry.userId === student.id))
  db.sessions.push({
    token,
    role: 'student',
    userId: student.id,
    createdAt: new Date().toISOString(),
  })
  await writeDb(db)
  return res.json({ token, student })
})

app.post('/api/auth/student/google-login', async (req, res) => {
  const name = String(req.body?.name || '').trim()
  const email = normalizeEmail(req.body?.email)
  const googleId = String(req.body?.googleId || '').trim()

  if (!name || !email || !googleId || !email.includes('@')) {
    return res.status(400).json({ message: 'google login requires name, email, and googleId' })
  }

  const db = await readDb()
  let student = db.students.find((entry) => entry.email === email)
  if (!student) {
    student = { id: `stu-${Date.now()}`, name, email, provider: 'google' }
    db.students.push(student)
  } else {
    student.name = name
    student.provider = 'google'
  }

  const token = makeToken()
  db.sessions = db.sessions.filter((entry) => !(entry.role === 'student' && entry.userId === student.id))
  db.sessions.push({
    token,
    role: 'student',
    userId: student.id,
    createdAt: new Date().toISOString(),
  })
  await writeDb(db)
  return res.json({ token, student })
})

app.post('/api/auth/admin/login', async (req, res) => {
  const pin = String(req.body?.pin || '').trim()
  if (!pin) {
    return res.status(400).json({ message: 'pin is required' })
  }

  const db = await readDb()
  const admin = db.admins[0]
  if (!admin || admin.pinHash !== sha256(pin)) {
    return res.status(401).json({ message: 'invalid admin pin' })
  }

  const token = makeToken()
  db.sessions = db.sessions.filter((entry) => !(entry.role === 'admin' && entry.userId === admin.id))
  db.sessions.push({
    token,
    role: 'admin',
    userId: admin.id,
    createdAt: new Date().toISOString(),
  })
  await writeDb(db)
  return res.json({ token, admin: { id: admin.id } })
})

app.post('/api/auth/logout', async (req, res) => {
  const token = pickAuthToken(req)
  if (!token) return res.json({ message: 'logged out' })
  const db = await readDb()
  db.sessions = db.sessions.filter((entry) => entry.token !== token)
  await writeDb(db)
  return res.json({ message: 'logged out' })
})

app.get('/api/menu', async (_req, res) => {
  const db = await readDb()
  res.json({ items: db.menu })
})

app.get('/api/orders/my', async (req, res) => {
  const auth = await requireAuth(req, res, 'student')
  if (!auth) return undefined

  const student = auth.db.students.find((entry) => entry.id === auth.session.userId)
  if (!student) return res.status(401).json({ message: 'invalid student session' })

  const orders = auth.db.orders
    .filter((entry) => entry.studentEmail === student.email)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 20)

  return res.json({ orders })
})

app.get('/api/orders/admin', async (req, res) => {
  const auth = await requireAuth(req, res, 'admin')
  if (!auth) return undefined

  const limit = Math.max(1, Math.min(300, Number(req.query.limit) || 100))
  const orders = [...auth.db.orders]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit)
  return res.json({ orders })
})

app.post('/api/orders', async (req, res) => {
  const auth = await requireAuth(req, res, 'student')
  if (!auth) return undefined

  const student = auth.db.students.find((entry) => entry.id === auth.session.userId)
  if (!student) return res.status(401).json({ message: 'invalid student session' })

  const customerName = String(req.body?.customerName || '').trim()
  const roomNumber = String(req.body?.roomNumber || '').trim()
  const phone = String(req.body?.phone || '').trim()
  const paymentMethod = String(req.body?.paymentMethod || 'cash').trim().toLowerCase()
  const notes = String(req.body?.notes || '').trim()
  const requestedItems = Array.isArray(req.body?.items) ? req.body.items : []

  if (!customerName || !roomNumber || !phone) {
    return res.status(400).json({ message: 'name, room number, and phone are required' })
  }
  if (!['cash', 'upi'].includes(paymentMethod)) {
    return res.status(400).json({ message: 'payment method must be cash or upi' })
  }
  if (requestedItems.length === 0) {
    return res.status(400).json({ message: 'at least one item is required' })
  }

  const menuMap = new Map(auth.db.menu.map((item) => [item.id, item]))
  const normalized = []

  for (const entry of requestedItems) {
    const item = menuMap.get(entry?.itemId)
    const quantity = Number(entry?.quantity)
    if (!item || Number.isNaN(quantity) || quantity < 1 || quantity > 20) {
      return res.status(400).json({ message: 'one or more items are invalid' })
    }
    if (!item.inStock) {
      return res.status(400).json({ message: `${item.name} is currently out of stock` })
    }
    normalized.push({
      itemId: item.id,
      name: item.name,
      price: item.price,
      quantity,
      lineTotal: item.price * quantity,
    })
  }

  const orderId = auth.db.meta.nextOrderId
  auth.db.meta.nextOrderId += 1

  const order = {
    id: orderId,
    orderNumber: `HG-${orderId}`,
    customerName,
    roomNumber,
    phone,
    studentEmail: student.email,
    paymentMethod,
    notes,
    status: 'pending',
    createdAt: new Date().toISOString(),
    items: normalized,
    total: normalized.reduce((sum, line) => sum + line.lineTotal, 0),
  }

  auth.db.orders.push(order)
  await writeDb(auth.db)
  return res.status(201).json({ message: 'order placed', order })
})

app.patch('/api/orders/:id/status', async (req, res) => {
  const auth = await requireAuth(req, res, 'admin')
  if (!auth) return undefined

  const id = Number(req.params.id)
  const status = String(req.body?.status || '').trim().toLowerCase()
  const allowed = ['pending', 'accepted', 'preparing', 'delivered', 'cancelled']

  if (Number.isNaN(id)) {
    return res.status(400).json({ message: 'invalid order id' })
  }
  if (!allowed.includes(status)) {
    return res.status(400).json({ message: `status must be one of: ${allowed.join(', ')}` })
  }

  const order = auth.db.orders.find((entry) => entry.id === id)
  if (!order) {
    return res.status(404).json({ message: 'order not found' })
  }

  order.status = status
  await writeDb(auth.db)
  return res.json({ message: 'status updated', order })
})

app.delete('/api/orders/:id', async (req, res) => {
  const auth = await requireAuth(req, res, 'admin')
  if (!auth) return undefined

  const id = Number(req.params.id)
  if (Number.isNaN(id)) {
    return res.status(400).json({ message: 'invalid order id' })
  }

  const orderIndex = auth.db.orders.findIndex((entry) => entry.id === id)
  if (orderIndex === -1) {
    return res.status(404).json({ message: 'order not found' })
  }

  const [order] = auth.db.orders.splice(orderIndex, 1)
  await writeDb(auth.db)
  return res.json({ message: 'order cleared', order })
})

ensureDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Hostel ordering API running on http://localhost:${PORT}`)
    })
  })
  .catch((error) => {
    console.error('Failed to initialize database', error)
    process.exit(1)
  })
