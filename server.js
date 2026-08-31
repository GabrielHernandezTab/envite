const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;
const rooms = new Map();

app.use(express.static('public'));

function createRoomCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i += 1) {
    code += letters[Math.floor(Math.random() * letters.length)];
  }
  return code;
}

function getRoom(code) {
  if (!rooms.has(code)) {
    rooms.set(code, {
      code,
      players: [],
      game: null,
      lastResult: null
    });
  }
  return rooms.get(code);
}

function teamNames(room) {
  if (!room || !room.players.length) return ['Equipo A', 'Equipo B'];
  return ['Equipo A', 'Equipo B'];
}

function serializeRoom(room) {
  return {
    code: room.code,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      team: player.team,
      score: player.score,
      choice: player.choice
    })),
    game: room.game ? {
      status: room.game.status,
      round: room.game.round,
      maxRounds: room.game.maxRounds,
      scores: room.game.scores,
      lastResult: room.game.lastResult,
      roundValues: room.game.roundValues
    } : null,
    lastResult: room.lastResult
  };
}

function assignTeams(room) {
  room.players.forEach((player, index) => {
    player.team = index < 2 ? 0 : 1;
  });
}

function notifyRoom(room) {
  io.to(room.code).emit('room-state', serializeRoom(room));
}

function finalizeRound(room) {
  const values = room.game.roundValues;
  const totals = { 0: 0, 1: 0 };

  room.players.forEach((player) => {
    const val = Number(values[player.id]);
    if (!Number.isNaN(val)) {
      totals[player.team] += val;
    }
  });

  const winner = totals[0] === totals[1] ? 'empate' : totals[0] > totals[1] ? 0 : 1;

  if (winner !== 'empate') {
    room.game.scores[winner] += 1;
  }

  room.lastResult = {
    round: room.game.round,
    totals,
    winner,
    players: room.players.map((player) => ({
      name: player.name,
      team: player.team,
      choice: values[player.id]
    }))
  };

  room.game.lastResult = room.lastResult;
  room.game.round += 1;
  room.game.roundValues = {};
  room.players.forEach((player) => {
    player.choice = null;
  });

  if (room.game.round > room.game.maxRounds) {
    room.game.status = 'finished';
    const scores = room.game.scores;
    let teamWinner = 'empate';
    if (scores[0] !== scores[1]) {
      teamWinner = scores[0] > scores[1] ? 0 : 1;
    }
    room.lastResult = {
      ...room.lastResult,
      final: true,
      teamWinner,
      scores
    };
  }

  notifyRoom(room);
}

function startGame(room) {
  if (room.players.length !== 4) {
    return;
  }

  assignTeams(room);
  room.game = {
    status: 'playing',
    round: 1,
    maxRounds: 5,
    scores: { 0: 0, 1: 0 },
    roundValues: {},
    lastResult: null
  };
  room.players.forEach((player) => {
    player.choice = null;
  });
  room.lastResult = null;
  notifyRoom(room);
}

io.on('connection', (socket) => {
  socket.on('create-room', (name) => {
    const roomCode = createRoomCode();
    const room = getRoom(roomCode);
    const playerName = String(name || 'Jugador').trim().slice(0, 18) || 'Jugador';

    room.players.push({
      id: socket.id,
      name: playerName,
      team: -1,
      score: 0,
      choice: null
    });

    socket.join(room.code);
    notifyRoom(room);
    socket.emit('joined-room', { code: room.code });

    if (room.players.length === 4) {
      startGame(room);
    }
  });

  socket.on('join-room', ({ roomCode, name }) => {
    const code = String(roomCode || '').toUpperCase();
    const room = getRoom(code);
    const playerName = String(name || 'Jugador').trim().slice(0, 18) || 'Jugador';

    if (!room || room.players.length >= 4) {
      socket.emit('join-error', 'La sala está llena o no existe.');
      return;
    }

    if (room.players.some((player) => player.id === socket.id)) {
      return;
    }

    room.players.push({
      id: socket.id,
      name: playerName,
      team: -1,
      score: 0,
      choice: null
    });

    socket.join(room.code);
    notifyRoom(room);
    socket.emit('joined-room', { code: room.code });

    if (room.players.length === 4) {
      startGame(room);
    }
  });

  socket.on('play-choice', (value) => {
    const room = [...rooms.values()].find((entry) => entry.players.some((player) => player.id === socket.id));
    if (!room || !room.game || room.game.status !== 'playing') {
      return;
    }

    const player = room.players.find((entry) => entry.id === socket.id);
    if (!player) return;

    const numericValue = Number(value);
    if (Number.isNaN(numericValue) || numericValue < 1 || numericValue > 9) {
      return;
    }

    if (player.choice !== null) {
      return;
    }

    player.choice = numericValue;
    room.game.roundValues[socket.id] = numericValue;

    if (Object.keys(room.game.roundValues).length === 4) {
      finalizeRound(room);
    }

    notifyRoom(room);
  });

  socket.on('reset-game', () => {
    const room = [...rooms.values()].find((entry) => entry.players.some((player) => player.id === socket.id));
    if (!room) return;

    room.game = null;
    room.lastResult = null;
    room.players.forEach((player) => {
      player.team = -1;
      player.choice = null;
      player.score = 0;
    });
    notifyRoom(room);
  });

  socket.on('disconnect', () => {
    for (const room of rooms.values()) {
      const index = room.players.findIndex((player) => player.id === socket.id);
      if (index >= 0) {
        room.players.splice(index, 1);
        if (room.players.length === 0) {
          rooms.delete(room.code);
        } else {
          assignTeams(room);
          notifyRoom(room);
        }
        break;
      }
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, rooms: rooms.size });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor Envite Canario listo en http://0.0.0.0:${PORT}`);
});
