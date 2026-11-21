# AgroIA

AgroIA es un asistente local en español de Colombia para acompañar el manejo de cultivos y el cuidado de plantas en casa. Incluye dos modos (Agrónomo y Hogar), dashboard, clima Open-Meteo, biblioteca de 50 especies, calendario, bitácora, cálculo de riego, alertas explicables y chat con un proveedor local o configurable.

## Requisitos

- Node.js 22.13 o superior (Node 24 recomendado; usa el módulo SQLite incluido en Node).
- npm 10 o superior.
- Para IA local, Ollama instalado y un modelo descargado. Si no está disponible, la app identifica el fallback y responde con su guía local.

## Inicio rápido

En la **raíz de esta carpeta**:

```powershell
npm install
npm run dev
```

Abre <http://localhost:5173>. La API queda en <http://localhost:3001>. No requiere cuenta ni base de datos externa; crea `apps/server/data/agroia.sqlite` en el primer arranque y carga datos de demostración automáticamente.

Comandos adicionales:

```powershell
npm run seed    # asegura datos de ejemplo si la base está vacía
npm run build   # compila API y frontend
npm run test    # pruebas unitarias y humo de API
npm run lint    # ESLint
```

El seed de inicio agrega 3 cultivos (papa, café y tomate), 4 plantas de casa, 30 días de lecturas y tareas/bitácora de ejemplo. No duplica datos si ya existe contenido.

## Funciones disponibles

- Dashboard reordenable con clima, humedad del suelo, tendencias, riesgos, recomendación contextual, tareas y mapa esquemático local (sin transmitir ubicación a un proveedor de mapas).
- Gráfico técnico de lecturas con periodos de 24 horas (por hora), 7 y 30 días (por fecha), promedios de humedad, temperatura y pH, y número de muestras.
- El modo Agrónomo y el modo Hogar filtran los espacios y cambian el lenguaje y cálculos.
- Consulta del clima y geocodificación de Open-Meteo; cache local de 30 minutos y fallback claramente identificado.
- 50 referencias de especies con búsqueda por nombre y categoría.
- Crear, editar y archivar plantas/lotes, gestionar tareas, bitácora con búsqueda y exportación CSV.
- Registrar lecturas manuales e importar CSV con validación de rangos.
- Cálculo transparente de riego por ET₀, Kc, lluvia y humedad del suelo.
- Reglas de riesgo explicables: humedad y hongos, tizón potencial en papa/tomate, estrés hídrico, exceso de agua, helada, calor, frío y viento.
- Chat con streaming SSE, contexto meteorológico/local, historial en SQLite, entrada por voz del navegador y guardado de consejos en bitácora.
- Proveedor sin conexión, Ollama, API compatible con OpenAI o Anthropic.
- Exportación/importación de plantas, tareas, bitácora, sensores, conversaciones y preferencias (las claves nunca se incluyen), PWA instalable y shell de interfaz cacheado para acceso offline.

## Configuración

Copia `.env.example` a `.env` solo si necesitas cambiar valores de servidor/proveedor. Los proveedores también se seleccionan en Ajustes. Una clave ingresada en la interfaz se envía directamente al servidor local, se guarda en SQLite local y no se devuelve a la interfaz. No subas `.env` ni compartas el archivo SQLite.

### Ollama

1. Instala Ollama y descarga un modelo, por ejemplo: `ollama pull llama3.1`.
2. Deja el servicio disponible en `http://localhost:11434`.
3. En AgroIA abre Ajustes, selecciona **Ollama local** e indica el modelo instalado.

### OpenAI compatible o Anthropic

Selecciona el proveedor en Ajustes, escribe la URL/modelo (si aplica) y la clave privada del usuario. Las preguntas, el cultivo/planta y el contexto meteorológico se envían a ese proveedor al usar el chat. Para dejar de enviar datos, vuelve a **Sin conexión**. El proveedor inicial es Ollama; si no responde, se indica y se usa la guía local.

## Publicar una demostración por 10 días en Render

`render.yaml` y `Dockerfile` permiten desplegar el frontend y la API como un solo servicio. La fecha límite de acceso de esta configuración es el **30 de noviembre de 2026 a las 22:02 (UTC-5)**; después, el servidor responde que la demostración expiró. Ajusta `SERVICE_EXPIRES_AT` en Render si el despliegue ocurre en otra fecha.

Esta configuración usa el plan gratuito: el servicio puede apagarse tras 15 minutos sin visitas y sus archivos locales, incluida la base SQLite, se pierden al apagarse o reiniciarse. Al volver, AgroIA carga los datos de demostración. La aplicación es compartida y no tiene cuentas: cualquiera con el enlace puede consultar y modificar los mismos datos. No ingreses información privada ni claves de proveedores en esta demostración.

## Clima y privacidad

La conexión a Open-Meteo solo se realiza para obtener clima/geocodificar la ubicación configurada. Si falla, AgroIA usa el último dato cacheado o una muestra identificada como demostración. Ollama se ejecuta en el equipo; elegir API externa sí transmite el mensaje y contexto al proveedor configurado. La app escucha en `127.0.0.1` y restringe CORS a orígenes localhost.

## Sensores e importación CSV

`POST /api/sensors/readings` acepta JSON validado:

```json
{
  "plantId": 1,
  "moisture": 38.4,
  "temperature": 17.2,
  "ph": 6.1,
  "depth": "20 cm",
  "source": "esp32"
}
```

Un ESP32 conectado a Wi-Fi puede publicar las lecturas a la máquina donde corre AgroIA:

```cpp
HTTPClient http;
http.begin("http://192.168.1.20:3001/api/sensors/readings");
http.addHeader("Content-Type", "application/json");
http.POST("{\"plantId\":1,\"moisture\":38.4,\"temperature\":17.2,\"ph\":6.1,\"source\":\"esp32\"}");
http.end();
```

Reemplaza la IP de ejemplo por la IP local del equipo AgroIA; restringe el acceso a una red de confianza. La interfaz permite registrar lecturas manuales e importar CSV. Al activar “Simulador de sensores”, el servidor genera una lectura variable por cada planta/cultivo activo y repite cada 30 minutos.

El endpoint `POST /api/readings/import` acepta `{ "csv": "moisture,temperature,ph,depth\\n38.4,17.2,6.1,20 cm" }`. Las columnas obligatorias son `moisture`, `temperature`, `ph`; `depth` y `createdAt` son opcionales.

## Estructura

```text
apps/
  server/       Express, SQLite, validación Zod, clima, IA y motor de riesgos
  web/          React, Vite, TypeScript, Tailwind y Recharts
packages/
  shared/       Tipos compartidos de dominio
```

Para agregar especies, modifica `apps/server/src/species.ts`: las entradas se cargan en la tabla SQLite vacía al iniciar. Para ajustar riesgos, edita las reglas y umbrales explicables en `apps/server/src/domain.ts` y añade sus casos en `domain.test.ts`.

## Solución de problemas

- **La app no abre o el navegador no conecta:** ejecuta ambos procesos con `npm run dev` y abre `http://localhost:5173`; revisa que los puertos 5173 y 3001 estén libres.
- **No aparece clima en vivo:** revisa conexión a internet y la ciudad configurada. El tablero identifica el dato cacheado/demo.
- **Ollama no responde:** inicia Ollama, confirma `http://localhost:11434` y descarga el modelo que aparece en Ajustes.
- **Error de proveedor externo:** confirma modelo, clave y conexión; la clave se guarda en la base local.
- **Restaurar una copia:** Ajustes → Respaldo y privacidad. La importación reemplaza plantas, tareas, bitácora, lecturas y conversaciones actuales. Las claves de proveedor se deben ingresar de nuevo.

## Alcance de esta primera versión

La orientación por IA acepta texto; no procesa fotos con un modelo de visión. El mapa es una ilustración local sin cartografía ni geocercas. El tablero utiliza clima actual y series de lecturas locales; el pronóstico de siete días completo, costos/rendimiento y reportes PDF quedan para una siguiente versión. El modo de contingencia, los flujos implementados y los endpoints existentes funcionan sin depender de esos módulos.

Tampoco se incluyen todavía el onboarding guiado, análisis N-P-K, calendario mensual, simulación de gemelo digital/“¿Y si…?”, comparación entre lotes o alertas del navegador. La base está organizada para incorporar estos módulos sin cambiar el almacenamiento local.

## Nota de uso responsable

AgroIA ofrece orientación, no reemplaza a un ingeniero agrónomo ni a un fitosanitario autorizado. Los cálculos y niveles de riesgo son estimaciones. Nunca se calculan dosis agroquímicas; verifica etiqueta y registro ICA y consulta a profesionales.
