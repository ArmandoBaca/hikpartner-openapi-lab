# HPP OpenAPI Lab

Laboratorio visual del OpenAPI **Hik-Partner Pro V2.15.500**. Next.js en Vercel, sesión solo en cookies httpOnly. El servidor no guarda API Keys ni eventos.

## Local

```bash
npm install
npm run dev
```

Abre `http://localhost:3000`, pega `appKey` y `secretKey` en Conexión.

## Vercel

Conecta el repo. No hace falta ninguna variable de entorno de HPP. `maxDuration` de las rutas proxy está en 60 s para el long-poll de alarmas.

## Notas

- Las cookies no viajan entre dispositivos: en cada navegador hay que conectar.
- El inbox de webhook en vivo no existe sin almacenamiento; usa el muro MQ.
- Live/playback es HPNetSDK, no REST.
