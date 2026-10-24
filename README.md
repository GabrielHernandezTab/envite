# Envite Canario 2v2

Juego multijugador mínimo con salas, 2 contra 2, pensado para jugar online desde una red no local.

## Requisitos

- Node.js 18+
- npm

## Instalación

```bash
npm install
```

## Arranque

```bash
npm start
```

La app quedará disponible en:

- Local: http://localhost:3000
- Red local: http://TU_IP:3000

## Acceso desde fuera de la red local

Para que personas ajenas a tu red puedan entrar, necesitas:

1. Abrir el puerto 3000 en tu router, o
2. Usar un servicio de túnel como ngrok / Cloudflare Tunnel, o
3. desplegarlo en un host público (Render, Railway, VPS, etc.)

El servidor escucha en `0.0.0.0`, lo que permite conexiones desde otras redes cuando lo expones correctamente.

## Cómo jugar

- Al crear la sala, el anfitrión elige el modo 2 contra 2 o 3 contra 3.
- Los demás jugadores entran con el código de la sala.
- Cada jugador elige el equipo A o B y, después, su rol.
- La partida empieza automáticamente cuando todos los puestos y roles están completos.

## Archivos principales

- `server.js` — servidor Socket.IO
- `public/index.html` — menú principal para elegir juego
- `public/envite.html` — sala y partida de Envite
- `public/game.js` — lógica del cliente
- `public/style.css` — estilos visuales
