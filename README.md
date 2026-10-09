# Customization Hub

Base de distribución de temas y recursos para una aplicación iOS. El backend usa Express, MongoDB y Mongoose; el dashboard estático se sirve desde `public/` y el ejemplo Swift descarga y verifica los recursos antes de guardarlos.

## Requisitos

- Node.js 18 o superior
- MongoDB local o una URI administrada
- Cuenta y aplicación configuradas en KeyAuth

## Arranque

1. Instala dependencias con `npm install`.
2. Para probar sin instalar MongoDB, configura `MONGODB_MEMORY=true` en `.env`. La base de datos es temporal y se limpia al reiniciar; los archivos subidos quedan en disco. Para datos persistentes, usa `MONGODB_MEMORY=false` y configura `MONGODB_URI`.
3. Ejecuta `npm run dev` durante el desarrollo o `npm start` en producción.
4. Abre `http://localhost:3000/` e inicia sesión con una licencia KeyAuth.

Para desarrollo local temporal sin login, configura `LOCAL_AUTH_BYPASS=true` en `.env` y reinicia el servidor. El panel abrirá directamente y la API usará un usuario local administrador. El bypass se ignora si `NODE_ENV=production`; elimina la variable para volver al login normal.

El panel valida licencias a través de KeyAuth y conserva un JWT local de cuatro horas en `sessionStorage`. KeyAuth necesita Internet para validar claves reales. `KEYAUTH_ADMIN_USERNAMES` es una lista separada por comas; solo esos usernames reciben `role: admin` en el JWT y pueden subir recursos. Las demás licencias válidas reciben `role: user`. La llamada a KeyAuth se realiza desde Express, nunca desde el navegador. `KEYAUTH_SECRET` queda en el entorno del servidor y no se incluye en las solicitudes Client API de inicialización/licencia.

## API

Todas las rutas protegidas de `/api/v1` requieren `Authorization: Bearer <token>`; el login es la excepción. Los tokens se verifican con `JWT_SECRET` y duran cuatro horas.

- `POST /api/v1/login-keyauth`: body `{ "licenseKey": "..." }`; inicializa KeyAuth con `name`, `ownerid` y `version`, valida la licencia y devuelve un JWT local firmado. `KEYAUTH_API_URL` debe usar HTTPS.
- `POST /api/v1/upload` (admin, `multipart/form-data`): campos `name`, `category`, `version` y `fileAsset`. Acepta las categorías `.cache`, `.avatar` y `.shaders`; guarda el archivo físico en `public/uploads/`, calcula SHA-256 y registra URL, versión y categoría en MongoDB.
- `GET /api/v1/customizations` (usuario autenticado): lista recursos disponibles para el dashboard.
- `PATCH /api/v1/user/customizations/:id/active` (usuario): body `{ "active": true|false }`; una activación reemplaza la selección anterior del mismo usuario.
- `GET /api/v1/user/active-theme` (usuario): devuelve `{ "customization": { ... } }` con URL y hash, o HTTP 404 si no hay selección activa.
- `GET /api/v1/user/active-resource` (usuario): devuelve `resource_id`, `resource_name`, `download_url`, `checksum_sha256` y `target_path_relative`. La identidad del usuario se toma del JWT, no de un ID enviado por el cliente.
- `GET /api/v1/proxy-routes`, `POST /api/v1/proxy-routes`, `PATCH /api/v1/proxy-routes/:id` y `DELETE /api/v1/proxy-routes/:id` (admin): administran rutas HTTP inversas con prefijo `/gateway/`. Cada ruta reenvía a un origen HTTP(S) configurado, incluido su puerto; el gateway exige JWT y no reenvía el bearer token al destino.
- `GET /gateway/<prefijo>/<ruta>` y otros métodos HTTP (usuario autenticado): reenvían la solicitud a la ruta habilitada de prefijo más específico. El prefijo configurado se elimina antes de enviar la ruta al destino.

El puerto de escucha es `PORT`: localmente se puede configurar antes de iniciar Node, pero plataformas como Render asignan ese puerto y no permiten escoger puertos públicos adicionales desde el panel. La consola admin muestra la dirección y puerto públicos que debe usar iOS (normalmente HTTPS/443 en Render), además del puerto interno del proceso. Cada ruta permite configurar por separado protocolo, servidor y puerto destino; los defaults son `PROXY_DEFAULT_HOST=127.0.0.1` y `PROXY_DEFAULT_PORT=8080`.

Al subir un recurso, el administrador indica `target_path_relative`, una ruta relativa debajo de `Documents/Caches/` en el cliente iOS (por ejemplo `cache/mi-archivo.cache`). Se rechazan rutas absolutas y segmentos `..`.

El cliente iOS debe integrar `ResourceManager`, autenticarse y llamar `syncActiveResource()`; el servidor no puede modificar directamente el sandbox de otra app iOS. El gestor escribe únicamente dentro del contenedor de la app que lo integra.

El endpoint nuevo guarda los archivos en `public/uploads/` por defecto y los sirve bajo `/uploads/`. `UPLOADS_DIR` permite moverlos a una ruta persistente (por ejemplo `/var/data/uploads` en Render, con un disco montado en `/var/data`). `BASE_URL` debe ser el origen público alcanzable por los clientes: usa `http://localhost:3000` en local o la URL HTTPS del túnel/PaaS en despliegue. CORS permite localhost y direcciones IPv4 privadas; declara dominios públicos exactos en `CORS_ORIGINS`, separados por comas. Los archivos subidos están excluidos de Git.

## Cliente iOS

Añade `ios/ResourceManager.swift` a un target iOS 15 o superior. Crea `ResourceManager(apiBaseURL:bearerToken:)` y llama `syncActiveResource()`. Compara primero el SHA-256 local; si cambió, descarga y valida antes de reemplazar en `Documents/Caches/<target_path_relative>`. Si lanza un error, conserva el recurso previo y la app puede seguir usando su recurso predeterminado. `ios/ThemeDownloader.swift` conserva el flujo anterior para temas.

El checksum detecta corrupción, pero no autentica por sí mismo al publicador: protege la API y el almacenamiento de recursos con HTTPS y permisos adecuados. En producción, sirve los recursos desde un CDN/origen confiable y restringe CORS a los dominios del panel.
