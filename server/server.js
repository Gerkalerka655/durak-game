const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// ===== КЛАСС КАРТЫ =====
class Card {
  constructor(suit, rank) {
    this.suit = suit;
    this.rank = rank;
    this.id = `${suit}-${rank}`;
  }
  get value() {
    const values = { '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
    return values[this.rank];
  }
}

function createDeck() {
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const deck = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push(new Card(suit, rank));
    }
  }
  return deck;
}

function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// ===== КОМНАТЫ =====
const rooms = new Map();

class Room {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.players = [];
    this.maxPlayers = 3;
    this.status = 'waiting';
    this.deck = [];
    this.trumpCard = null;
    this.trumpSuit = null;
    this.table = [];
    this.attackerIndex = 0;
    this.defenderIndex = 1;
    this.currentPlayerIndex = 0;
    this.discardPile = [];
    this.turnCount = 0;
    this.winner = null;
    this.loser = null;
  }

  addPlayer(socketId, userData) {
    if (this.players.length >= this.maxPlayers) return false;
    if (this.status !== 'waiting') return false;
    const player = {
      socketId,
      userId: userData.id || uuidv4(),
      username: userData.username || '',
      firstName: userData.first_name || 'Игрок',
      lastName: userData.last_name || '',
      photoUrl: userData.photo_url || '',
      cards: [],
      isReady: false,
      isActive: true
    };
    this.players.push(player);
    return true;
  }

  removePlayer(socketId) {
    const idx = this.players.findIndex(p => p.socketId === socketId);
    if (idx !== -1) {
      if (this.status === 'playing') {
        this.deck.push(...this.players[idx].cards);
        this.players[idx].isActive = false;
      } else {
        this.players.splice(idx, 1);
      }
    }
  }

  startGame() {
    if (this.players.length < 2) return false;
    this.status = 'playing';
    this.deck = shuffleDeck(createDeck());
    this.table = [];
    this.discardPile = [];
    this.trumpCard = this.deck[this.deck.length - 1];
    this.trumpSuit = this.trumpCard.suit;

    for (let i = 0; i < 6; i++) {
      for (const player of this.players) {
        if (this.deck.length > 0) player.cards.push(this.deck.pop());
      }
    }

    let minTrump = null;
    let attackerIdx = 0;
    for (let i = 0; i < this.players.length; i++) {
      const trumpCards = this.players[i].cards.filter(c => c.suit === this.trumpSuit);
      if (trumpCards.length > 0) {
        const min = trumpCards.reduce((a, b) => a.value < b.value ? a : b);
        if (!minTrump || min.value < minTrump.value) {
          minTrump = min;
          attackerIdx = i;
        }
      }
    }

    this.attackerIndex = attackerIdx;
    this.defenderIndex = (attackerIdx + 1) % this.players.length;
    this.currentPlayerIndex = this.attackerIndex;
    this.turnCount = 0;
    return true;
  }

  getGameState(forPlayerIndex) {
    return {
      roomId: this.id,
      status: this.status,
      players: this.players.map((p, i) => ({
        index: i,
        firstName: p.firstName,
        lastName: p.lastName,
        photoUrl: p.photoUrl,
        cardCount: p.cards.length,
        isActive: p.isActive,
        isAttacker: i === this.attackerIndex,
        isDefender: i === this.defenderIndex,
        isCurrent: i === this.currentPlayerIndex
      })),
      myCards: this.players[forPlayerIndex]?.cards || [],
      table: this.table,
      trumpSuit: this.trumpSuit,
      trumpCard: this.trumpCard,
      deckCount: this.deck.length,
      discardCount: this.discardPile.length,
      currentPlayerIndex: this.currentPlayerIndex,
      attackerIndex: this.attackerIndex,
      defenderIndex: this.defenderIndex,
      myIndex: forPlayerIndex,
      winner: this.winner,
      loser: this.loser
    };
  }

  canBeat(attackingCard, defendingCard) {
    if (defendingCard.suit === attackingCard.suit) {
      return defendingCard.value > attackingCard.value;
    }
    if (defendingCard.suit === this.trumpSuit && attackingCard.suit !== this.trumpSuit) {
      return true;
    }
    return false;
  }

  getTableRanks() {
    const ranks = new Set();
    for (const pair of this.table) {
      ranks.add(pair.card.rank);
      if (pair.beatenBy) ranks.add(pair.beatenBy.rank);
    }
    return ranks;
  }

  canThrow(card, playerIndex) {
    if (playerIndex === this.defenderIndex) return false;
    if (this.table.length === 0) return true;
    return this.getTableRanks().has(card.rank);
  }

  getMaxCardsOnTable() {
    const defender = this.players[this.defenderIndex];
    return defender ? Math.min(6, defender.cards.length + this.table.length) : 6;
  }

  makeMove(playerIndex, cardId) {
    const player = this.players[playerIndex];
    const cardIdx = player.cards.findIndex(c => c.id === cardId);
    if (cardIdx === -1) return { success: false, error: 'Карта не найдена' };
    const card = player.cards[cardIdx];

    if (playerIndex === this.attackerIndex ||
        (playerIndex !== this.defenderIndex && this.canThrow(card, playerIndex))) {
      if (this.table.length >= this.getMaxCardsOnTable()) {
        return { success: false, error: 'Нельзя подкинуть больше карт' };
      }
      player.cards.splice(cardIdx, 1);
      this.table.push({ attacker: playerIndex, card: card, beatenBy: null });
      this.checkAutoTake();
      return { success: true, action: 'attack' };
    }

    if (playerIndex === this.defenderIndex && this.table.length > 0) {
      const lastPair = this.table[this.table.length - 1];
      if (lastPair.beatenBy !== null) {
        return { success: false, error: 'Эта карта уже отбита' };
      }
      if (!this.canBeat(lastPair.card, card)) {
        return { success: false, error: 'Нельзя отбить этой картой' };
      }
      player.cards.splice(cardIdx, 1);
      lastPair.beatenBy = card;
      const allBeaten = this.table.every(p => p.beatenBy !== null);
      if (allBeaten && this.table.length >= this.getMaxCardsOnTable()) {
        setTimeout(() => this.endTurn(true), 500);
      }
      return { success: true, action: 'defend' };
    }
    return { success: false, error: 'Неверный ход' };
  }

  checkAutoTake() {
    const defender = this.players[this.defenderIndex];
    if (!defender || defender.cards.length === 0) {
      this.endTurn(false);
    }
  }

  takeCards(playerIndex) {
    if (playerIndex !== this.defenderIndex) {
      return { success: false, error: 'Только защищающийся может взять карты' };
    }
    this.endTurn(false);
    return { success: true };
  }

  endTurn(successfulDefense) {
    if (successfulDefense) {
      for (const pair of this.table) {
        this.discardPile.push(pair.card);
        if (pair.beatenBy) this.discardPile.push(pair.beatenBy);
      }
      this.table = [];
      this.drawCards();
      this.attackerIndex = this.defenderIndex;
      this.defenderIndex = (this.defenderIndex + 1) % this.players.length;
      while (!this.players[this.defenderIndex]?.isActive) {
        this.defenderIndex = (this.defenderIndex + 1) % this.players.length;
      }
    } else {
      const defender = this.players[this.defenderIndex];
      for (const pair of this.table) {
        defender.cards.push(pair.card);
        if (pair.beatenBy) defender.cards.push(pair.beatenBy);
      }
      this.table = [];
      this.drawCards();
      this.defenderIndex = (this.defenderIndex + 1) % this.players.length;
      while (!this.players[this.defenderIndex]?.isActive) {
        this.defenderIndex = (this.defenderIndex + 1) % this.players.length;
      }
    }
    this.currentPlayerIndex = this.attackerIndex;
    this.turnCount++;
    this.checkGameEnd();
  }

  drawCards() {
    const order = [];
    for (let i = 0; i < this.players.length; i++) {
      const idx = (this.attackerIndex + i) % this.players.length;
      if (this.players[idx].isActive) order.push(idx);
    }
    for (const idx of order) {
      while (this.players[idx].cards.length < 6 && this.deck.length > 0) {
        this.players[idx].cards.push(this.deck.pop());
      }
    }
  }

  checkGameEnd() {
    if (this.deck.length === 0) {
      for (const player of this.players) {
        if (player.isActive && player.cards.length === 0) {
          player.isActive = false;
        }
      }
      const stillActive = this.players.filter(p => p.isActive);
      if (stillActive.length === 1) {
        this.loser = stillActive[0].firstName;
        this.status = 'finished';
        const winners = this.players.filter(p => p.firstName !== this.loser).map(p => p.firstName);
        this.winner = winners.join(', ');
      } else if (stillActive.length === 0) {
        this.status = 'finished';
        this.winner = 'Ничья';
      }
    }
  }
}

// ===== SOCKET.IO =====
io.on('connection', (socket) => {
  let currentRoom = null;
  let playerIndex = -1;

  socket.on('create-room', (data, callback) => {
    const roomId = uuidv4().slice(0, 8).toUpperCase();
    const room = new Room(roomId, data.roomName || `Комната ${roomId}`);
    rooms.set(roomId, room);
    callback({ success: true, roomId, roomName: room.name });
  });

  socket.on('join-room', (data, callback) => {
    const room = rooms.get(data.roomId);
    if (!room) { callback({ success: false, error: 'Комната не найдена' }); return; }
    if (room.players.length >= room.maxPlayers) { callback({ success: false, error: 'Комната заполнена' }); return; }
    if (room.status !== 'waiting') { callback({ success: false, error: 'Игра уже идёт' }); return; }
    const userData = data.userData || {};
    if (room.addPlayer(socket.id, userData)) {
      currentRoom = room;
      playerIndex = room.players.length - 1;
      socket.join(room.id);
      io.to(room.id).emit('player-joined', {
        players: room.players.map(p => ({
          firstName: p.firstName,
          lastName: p.lastName,
          photoUrl: p.photoUrl,
          isReady: p.isReady
        })),
        roomName: room.name
      });
      callback({ success: true, playerIndex });
    } else {
      callback({ success: false, error: 'Не удалось войти в комнату' });
    }
  });

  socket.on('player-ready', () => {
    if (!currentRoom || playerIndex === -1) return;
    currentRoom.players[playerIndex].isReady = true;
    const allReady = currentRoom.players.every(p => p.isReady);
    const enoughPlayers = currentRoom.players.length >= 2;
    io.to(currentRoom.id).emit('player-ready-update', {
      players: currentRoom.players.map(p => ({
        firstName: p.firstName,
        photoUrl: p.photoUrl,
        isReady: p.isReady
      })),
      allReady,
      enoughPlayers
    });
  });

  socket.on('start-game', () => {
    if (!currentRoom || playerIndex !== 0) return;
    if (currentRoom.startGame()) {
      for (let i = 0; i < currentRoom.players.length; i++) {
        const state = currentRoom.getGameState(i);
        io.to(currentRoom.players[i].socketId).emit('game-started', state);
      }
    }
  });

  socket.on('make-move', (data, callback) => {
    if (!currentRoom || playerIndex === -1 || currentRoom.status !== 'playing') {
      callback({ success: false, error: 'Игра не активна' });
      return;
    }
    const result = currentRoom.makeMove(playerIndex, data.cardId);
    callback(result);
    if (result.success) {
      for (let i = 0; i < currentRoom.players.length; i++) {
        const state = currentRoom.getGameState(i);
        io.to(currentRoom.players[i].socketId).emit('game-update', state);
      }
    }
  });

  socket.on('take-cards', (data, callback) => {
    if (!currentRoom || playerIndex === -1) { callback({ success: false, error: 'Ошибка' }); return; }
    const result = currentRoom.takeCards(playerIndex);
    callback(result);
    if (result.success) {
      for (let i = 0; i < currentRoom.players.length; i++) {
        const state = currentRoom.getGameState(i);
        io.to(currentRoom.players[i].socketId).emit('game-update', state);
      }
    }
  });

  socket.on('end-turn', () => {
    if (!currentRoom || playerIndex !== currentRoom.attackerIndex) return;
    const allBeaten = currentRoom.table.every(p => p.beatenBy !== null);
    if (allBeaten && currentRoom.table.length > 0) {
      currentRoom.endTurn(true);
      for (let i = 0; i < currentRoom.players.length; i++) {
        const state = currentRoom.getGameState(i);
        io.to(currentRoom.players[i].socketId).emit('game-update', state);
      }
    }
  });

  socket.on('disconnect', () => {
    if (currentRoom) {
      currentRoom.removePlayer(socket.id);
      io.to(currentRoom.id).emit('player-left', {
        players: currentRoom.players.map(p => ({
          firstName: p.firstName,
          photoUrl: p.photoUrl,
          isReady: p.isReady,
          isActive: p.isActive
        }))
      });
      if (currentRoom.players.length === 0) rooms.delete(currentRoom.id);
    }
  });
});

// ===== API: СПИСОК АКТИВНЫХ КОМНАТ =====
app.get('/api/rooms', (req, res) => {
  const roomList = Array.from(rooms.values())
    .filter(r => r.status === 'waiting')
    .map(r => ({
      id: r.id,
      name: r.name,
      players: r.players.length,
      maxPlayers: r.maxPlayers,
      status: r.status,
      playerNames: r.players.map(p => p.firstName)
    }));
  res.json(roomList);
});

// API: Инфо о конкретной комнате
app.get('/api/rooms/:roomId', (req, res) => {
  const room = rooms.get(req.params.roomId.toUpperCase());
  if (!room) return res.status(404).json({ error: 'Комната не найдена' });
  res.json({
    id: room.id,
    name: room.name,
    players: room.players.length,
    maxPlayers: room.maxPlayers,
    status: room.status,
    playerNames: room.players.map(p => p.firstName)
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
