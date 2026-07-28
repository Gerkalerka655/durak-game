lobby_js = '''class LobbyManager {
  constructor(socket, roomId, myPlayerIndex) {
    this.socket = socket;
    this.roomId = roomId;
    this.myPlayerIndex = myPlayerIndex;
    this.players = [];
    this.imReady = false;
  }

  init() {
    this.socket.emit('join-room', {
      roomId: this.roomId,
      userData: window.Telegram?.WebApp?.initDataUnsafe?.user || {}
    });

    this.socket.on('player-joined', (data) => {
      this.players = data.players;
      this.renderPlayers();
    });

    this.socket.on('player-ready-update', (data) => {
      this.players = data.players;
      this.renderPlayers();
      this.updateHint(data);
    });

    this.socket.on('player-left', (data) => {
      this.players = data.players;
      this.renderPlayers();
    });

    this.socket.on('game-started', (state) => {
      localStorage.setItem('durak_gameState', JSON.stringify(state));
      window.location.href = 'game.html';
    });
  }

  setReady() {
    if (!this.imReady) {
      this.imReady = true;
      this.socket.emit('player-ready');
      return true;
    }
    return false;
  }

  startGame() {
    if (this.myPlayerIndex === 0) {
      this.socket.emit('start-game');
    }
  }

  renderPlayers() {
    const container = document.getElementById('players-list');
    if (!container) return;
    container.innerHTML = '';
    this.players.forEach((player, index) => {
      const card = document.createElement('div');
      card.className = `player-card ${player.isReady ? 'ready' : ''} ${index === 0 ? 'creator' : ''}`;
      const avatar = player.photoUrl
        ? `<img src="${player.photoUrl}" alt="avatar" class="player-avatar">`
        : `<div class="player-avatar-placeholder">${player.firstName[0]}</div>`;
      card.innerHTML = `${avatar}<div class="player-info"><div class="player-name">${player.firstName} ${player.lastName || ''}</div><div class="player-status">${player.isReady ? '✅ Готов' : '⏳ Ожидает'}</div></div>${index === 0 ? '<span class="creator-badge">👑</span>' : ''}`;
      container.appendChild(card);
    });
  }

  updateHint(data) {
    const hint = document.getElementById('lobby-hint');
    const startBtn = document.getElementById('start-btn');
    if (!hint) return;
    if (data.allReady && data.enoughPlayers) {
      hint.textContent = 'Все готовы! Создатель может начать игру.';
      if (this.myPlayerIndex === 0 && startBtn) startBtn.classList.remove('hidden');
    } else {
      hint.textContent = `Ожидаем готовности... (${this.players.filter(p => p.isReady).length}/${this.players.length} готовы)`;
      if (startBtn) startBtn.classList.add('hidden');
    }
  }
}'''

with open(f"{base_dir}/client/js/lobby.js", "w") as f:
    f.write(lobby_js)
