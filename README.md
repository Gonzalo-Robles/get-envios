# Rutas de Remitos GET

Aplicación web estática para cargar remitos, agruparlos por expreso/dirección, optimizar el orden de reparto con distancias y tiempos de Google Maps, corregir paradas, compartir la ruta y preparar un texto para WhatsApp.

## Funciones

- Carga manual, CSV, texto pegado y adjuntos PDF/imagen con lectura en el navegador.
- Agrupa varios clientes/remitos que se entregan en el mismo expreso y dirección.
- Calcula el mejor orden desde el domicilio de salida usando Google Routes API.
- Muestra distancia y duración estimadas para cada tramo y el total.
- Permite corregir una dirección, reordenar paradas o marcar una dirección temporalmente inaccesible y recalcular las restantes.
- Genera enlace de Google Maps, texto descargable y mensaje para compartir por WhatsApp.
- Los remitos se guardan localmente en el navegador. Los archivos adjuntos no se suben.

## Subir a GitHub y Vercel

1. Descargá y descomprimí el proyecto.
2. Creá un repositorio nuevo en GitHub y subí todo el contenido de esta carpeta, incluida `api/`, `dist/`, `package.json` y `vercel.json`.
3. En Vercel, importá ese repositorio. Dejá **Framework Preset: Other**, **Root Directory: `./`** y sin comando de build. El `index.html` está en la raíz y Vercel detecta la función de `api/` automáticamente.
4. En Google Cloud Console, habilitá **Routes API** para un proyecto con facturación habilitada. Creá una API key y restringila a Routes API. Configurala como variable de entorno de Vercel con el nombre exacto `GOOGLE_MAPS_API_KEY`, para Production y Preview. No la escribas en `dist/index.html`, el repositorio ni `.env.example`.
5. Volvé a desplegar en Vercel. La app consultará el endpoint `/api/optimize` y la clave quedará del lado servidor.

### Desarrollo local

- Instalá Node.js 18+ y la herramienta Vercel CLI.
- Copiá `.env.example` a `.env.local` y reemplazá el valor de `GOOGLE_MAPS_API_KEY` por tu clave.
- Ejecutá `vercel dev` y abrí la URL local que informe la herramienta.

## Límites y comportamiento

- El optimizador busca el orden con menor tiempo estimado para hasta 7 paradas (más el origen), luego pide a Routes API el recorrido completo y sus tramos. No agrega el domicilio como parada final.
- El cálculo es una estimación de Google para auto y no garantiza que una entrada física esté abierta. Ante acceso bloqueado, el mensajero puede marcar la parada como “No accesible” y recalcular; la parada queda guardada para reincorporarla después.
- Se necesita conexión a Internet y API key de Google Maps Platform con Routes API habilitada. Google puede cobrar por solicitudes según el plan vigente; revisá cuotas y facturación de tu proyecto.
- La aplicación guarda los remitos en el navegador/dispositivo desde el que se usa. Para cambiar de dispositivo, exportá/compartí la ruta o volvé a cargar los remitos.
