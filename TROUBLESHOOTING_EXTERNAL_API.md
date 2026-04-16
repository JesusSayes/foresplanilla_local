# Solución al Error: "Error al obtener asistencias del API externo"

## Problema
Al ejecutar `node backend/syncAttendanceCLI.js --dry-run` aparece el error:
```
[2026-04-15T04:35:32.120Z] ERROR GENERAL: Error al obtener asistencias del API externo
```

## Diagnóstico

### Paso 1: Verificar variables de entorno

El script requiere 3 variables de entorno configuradas en el servidor de producción:

```bash
EXTERNAL_API_BASE_URL=https://tu-api.com/api
EXTERNAL_API_EMAIL=tu-email@ejemplo.com
EXTERNAL_API_PASSWORD=tu-contraseña
```

**Verificar en producción:**
```bash
cd /var/www/html/foresplanilla
cat backend/.env | grep EXTERNAL_API
```

Si no existen o están vacías, ese es el problema.

### Paso 2: Ejecutar script de diagnóstico

He creado un script que verifica la configuración y prueba la conexión:

```bash
cd /var/www/html/foresplanilla
node backend/testExternalApi.js
```

Este script te dirá exactamente qué está fallando:
- ✓ Variables de entorno configuradas
- ✓ Conexión al API externo
- ✓ Autenticación exitosa
- ✓ Datos recibidos

### Paso 3: Soluciones según el error

#### Error: "NO CONFIGURADO"
**Causa:** Falta el archivo `.env` o las variables no están definidas.

**Solución:**
```bash
cd /var/www/html/foresplanilla/backend
cp .env.example .env
nano .env  # Editar y configurar las variables EXTERNAL_API_*
```

#### Error: "No se pudo conectar al API externo"
**Causa:** El servidor del API externo no está disponible o la URL es incorrecta.

**Solución:**
1. Verifica que `EXTERNAL_API_BASE_URL` sea correcto
2. Prueba la URL manualmente:
   ```bash
   curl -X POST https://tu-api.com/api/api-login \
     -H "Content-Type: application/json" \
     -d '{"email":"tu-email","password":"tu-password"}'
   ```

#### Error: "Credenciales inválidas"
**Causa:** Email o contraseña incorrectos.

**Solución:**
1. Verifica que `EXTERNAL_API_EMAIL` y `EXTERNAL_API_PASSWORD` sean correctos
2. Prueba las credenciales manualmente con curl (ver arriba)

#### Error: "Timeout"
**Causa:** El servidor tarda mucho en responder o hay problemas de red.

**Solución:**
1. Verifica la conexión de red del servidor
2. Verifica que no haya firewall bloqueando la conexión
3. Aumenta el timeout en `backend/config/externalApi.js` (actualmente 15000ms)

#### Error: "Endpoint /asistencias no encontrado"
**Causa:** La URL base no incluye el path correcto o el endpoint cambió.

**Solución:**
1. Verifica que `EXTERNAL_API_BASE_URL` termine en `/api` (sin slash final)
2. Contacta al proveedor del API para confirmar el endpoint

## Mejoras implementadas

He mejorado el manejo de errores en `backend/utils/externalApiService.js` para que ahora muestre:
- ✓ Logs detallados de cada paso
- ✓ Validación de variables de entorno
- ✓ Mensajes de error específicos según el tipo de fallo
- ✓ Sugerencias de solución

## Ejecución después de configurar

Una vez configuradas las variables de entorno:

```bash
# 1. Probar conexión
node backend/testExternalApi.js

# 2. Ejecutar sincronización en modo prueba
node backend/syncAttendanceCLI.js --dry-run --limit 10

# 3. Si todo está bien, ejecutar sincronización real
node backend/syncAttendanceCLI.js --limit 100
```

## Logs mejorados

Ahora verás logs como:
```
[LOGIN] Intentando autenticar en: https://api.com/api/api-login
[LOGIN] Email: user@example.com
[LOGIN] ✓ Autenticación exitosa
[GET_ASISTENCIAS] Obteniendo token...
[GET_ASISTENCIAS] Solicitando asistencias desde: https://api.com/api/asistencias
[GET_ASISTENCIAS] ✓ Recibidos 150 registros
```

En caso de error:
```
[LOGIN] ✗ Error en autenticación:
  URL: https://api.com/api
  Email: user@example.com
  Status: 401
  Data: {"error": "Invalid credentials"}
  Message: Request failed with status code 401
```
