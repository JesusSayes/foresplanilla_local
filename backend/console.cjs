// backend/console.cjs

const { PrismaClient } = require('@prisma/client')
const util = require('util')

// ===== Prisma =====
let prisma = new PrismaClient()
global.prisma = prisma

// ===== Pretty Print =====
global.pp = (obj) => {
  console.log(util.inspect(obj, { depth: null, colors: true }))
}
global.p = global.pp

// ===== Helpers base =====
global.pick = (obj, fields = []) => {
  if (!obj) return obj
  return fields.reduce((acc, key) => {
    acc[key] = obj[key]
    return acc
  }, {})
}

global.ids = (arr = []) => arr.map(x => x.id)

global.sleep = (ms) => new Promise(res => setTimeout(res, ms))

global.log = (label, data) => {
  console.log(`\n🔹 ${label}`)
  pp(data)
}

// ===== Reload Prisma =====
global.reload = async () => {
  await prisma.$disconnect()
  prisma = new PrismaClient()
  global.prisma = prisma
  console.log("🔄 Prisma reloaded")
}

// ===== Exit limpio =====
global.exit = async () => {
  await prisma.$disconnect()
  console.log("👋 Bye!")
  process.exit(0)
}

// ===== Query helpers (tipo ActiveRecord) =====
global.find = async (model, id) => {
  return prisma[model].findUnique({ where: { id } })
}

global.all = async (model, limit = 10) => {
  return prisma[model].findMany({ take: limit })
}

global.where = async (model, condition) => {
  return prisma[model].findMany({ where: condition })
}

global.count = async (model) => {
  return prisma[model].count()
}

// ===== Domain helpers (TU NEGOCIO) =====

// Obtener alertas con relaciones
global.alerts = async () => {
  return prisma.overtime_alert.findMany({
    include: {
      employee: true,
      attendance_record: true
    },
    orderBy: { created_date: 'desc' }
  })
}

// Buscar empleado por código
global.empByCode = async (code) => {
  return prisma.employee.findFirst({
    where: { employee_code: code }
  })
}

// Alertas por empleado
global.alertsByEmployee = async (employeeId) => {
  return prisma.overtime_alert.findMany({
    where: { employee_id: employeeId }
  })
}

// Validar empleados sin rol
global.employeesWithoutRole = async () => {
  return prisma.employee.findMany({
    where: {
      OR: [
        { role: null },
        { role: "" }
      ]
    }
  })
}

// ===== Fix helpers (MUY útil en producción) =====

// Corregir overtime_hours (Decimal → Number inconsistente)
global.fixOvertime = async () => {
  const alerts = await prisma.overtime_alert.findMany()

  for (const a of alerts) {
    await prisma.overtime_alert.update({
      where: { id: a.id },
      data: {
        overtime_hours: Number(a.overtime_hours)
      }
    })
  }

  console.log(`✅ Fixed ${alerts.length} alerts`)
}

// Marcar alertas como revisadas
global.markReviewed = async (id) => {
  return prisma.overtime_alert.update({
    where: { id },
    data: { status: "Revisado" }
  })
}

// ===== Debug avanzado =====
global.explain = async (queryFn) => {
  console.time("⏱ Query time")
  const result = await queryFn()
  console.timeEnd("⏱ Query time")
  return result
}

// ===== Auto listado de modelos =====
global.models = Object.keys(prisma).filter(k => !k.startsWith('_'))

// ===== Error handling =====
process.on('unhandledRejection', (err) => {
  console.error("❌ Unhandled Error:")
  console.error(err)
})

// ===== Welcome =====
console.log(`
🚀 PRO Console Ready

=== Base ===
- await prisma.*
- pp(obj)
- pick(obj, ['id'])

=== ActiveRecord style ===
- await find('employee', 'id')
- await all('employee')
- await where('employee', { role: 'ADMIN' })
- await count('employee')

=== Negocio ===
- await alerts()
- await alertsByEmployee('id')
- await empByCode('EMP001')
- await employeesWithoutRole()

=== Fixes ===
- await fixOvertime()
- await markReviewed('alert_id')

=== Utils ===
- reload()
- exit()
- sleep(ms)

=== Modelos ===
- models

`)
