game_js = '''class GameManager {
  constructor(socket, roomId) {
    this.socket = socket;
    this.roomId = roomId;
    this.gameState = null;
    this.selectedCard = null;
  }

  init() {
    this.socket.emit('join-room', {
      roomId: this.roomId,
      userData: window.Telegram?.WebApp?.initDataUnsafe?.user || {}
    });

    this.socket.on('game-update', (state) => {
      this.gameState = state;
      this.renderGame();
    });

    this.socket.on('game-started', (state) => {
      this.gameState = state;
      this.renderGame();
    });

    const takeBtn = document.getElementById('take-btn');
    const doneBtn = document.getElementById('done-btn');
    if (takeBtn) takeBtn.addEventListener('click', () => this.takeCards());
    if (doneBtn) doneBtn.addEventListener('click', () => this.endTurn());
  }

  renderGame() {
    if (!this.gameState) return;
    this.updateHeader();
    this.renderOpponents();
    this.renderTable();
    this.renderMyCards();
    this.updateButtons();
    if (this.gameState.status === 'finished') this.showResult();
  }

  updateHeader() {
    const trumpSuit = document.getElementById('trump-suit');
    const deckCount = document.getElementById('deck-count');
    const turnInfo = document.getElementById('turn-info');
    if (trumpSuit) trumpSuit.textContent = this.gameState.trumpSuit;
    if (deckCount) deckCount.textContent = this.gameState.deckCount;
    const myIndex = this.gameState.myIndex;
    const isAttacker = myIndex === this.gameState.attackerIndex;
    const isDefender = myIndex === this.gameState.defenderIndex;
    let turnText = '';
    if (isAttacker) turnText = '🔥 Ваша атака!';
    else if (isDefender) turnText = '🛡️ Вы защищаетесь!';
    else turnText = '👀 Наблюдаете...';
    if (turnInfo) turnInfo.textContent = turnText;
  }

  updateButtons() {
    const myIndex = this.gameState.myIndex;
    const isAttacker = myIndex === this.gameState.attackerIndex;
    const isDefender = myIndex === this.gameState.defenderIndex;
    const takeBtn = document.getElementById('take-btn');
    const doneBtn = document.getElementById('done-btn');
    if (takeBtn) {
      if (isDefender && this.gameState.table.length > 0) takeBtn.classList.remove('hidden');
      else takeBtn.classList.add('hidden');
    }
    if (doneBtn) {
      if (isAttacker && this.gameState.table.length > 0 && this.gameState.table.every(p => p.beatenBy)) {
        doneBtn.classList.remove('hidden');
      } else {
        doneBtn.classList.add('hidden');
      }
    }
  }

  renderOpponents() {
    const container = document.getElementById('opponents');
    if (!container) return;
    container.innerHTML = '';
    this.gameState.players.forEach((player, index) => {
      if (index === this.gameState.myIndex) return;
      const card = document.createElement('div');
      card.className = `opponent-card ${player.isAttacker ? 'attacker' : ''} ${player.isDefender ? 'defender' : ''}`;
      const avatar = player.photoUrl
        ? `<img src="${player.photoUrl}" class="opp-avatar">`
        : `<div class="opp-avatar-placeholder">${player.firstName[0]}</div>`;
      card.innerHTML = `${avatar}<div class="opp-info"><div class="opp-name">${player.firstName}</div><div class="opp-cards">${player.cardCount} 🃏</div></div>${player.isAttacker ? '<span class="role-badge attack">⚔️</span>' : ''}${player.isDefender ? '<span class="role-badge defend">🛡️</span>' : ''}`;
      container.appendChild(card);
    });
  }

  renderTable() {
    const container = document.getElementById('table-area');
    if (!container) return;
    if (this.gameState.table.length === 0) {
      container.innerHTML = '<div class="table-placeholder">Стол пуст</div>';
      return;
    }
    container.innerHTML = '';
    this.gameState.table.forEach((pair) => {
      const pairEl = document.createElement('div');
      pairEl.className = 'card-pair';
      pairEl.appendChild(this.createCardElement(pair.card, false));
      if (pair.beatenBy) {
        const defendCard = this.createCardElement(pair.beatenBy, false);
        defendCard.classList.add('beaten');
        pairEl.appendChild(defendCard);
      }
      container.appendChild(pairEl);
    });
  }

  renderMyCards() {
    const container = document.getElementById('my-hand');
    if (!container) return;
    container.innerHTML = '';
    const myCards = [...this.gameState.myCards];
    const suitOrder = { '♠': 0, '♥': 1, '♦': 2, '♣': 3 };
    myCards.sort((a, b) => {
      const aIsTrump = a.suit === this.gameState.trumpSuit;
      const bIsTrump = b.suit === this.gameState.trumpSuit;
      if (aIsTrump && !bIsTrump) return 1;
      if (!aIsTrump && bIsTrump) return -1;
      if (a.suit !== b.suit) return suitOrder[a.suit] - suitOrder[b.suit];
      return a.value - b.value;
    });
    myCards.forEach(card => {
      const cardEl = this.createCardElement(card, true);
      cardEl.addEventListener('click', () => this.onCardClick(card, cardEl));
      container.appendChild(cardEl);
    });
  }

  createCardElement(card, isInteractive) {
    const el = document.createElement('div');
    el.className = `card ${card.suit === '♥' || card.suit === '♦' ? 'red' : 'black'} ${isInteractive ? 'interactive' : ''}`;
    el.dataset.cardId = card.id;
    const isTrump = card.suit === this.gameState?.trumpSuit;
    el.innerHTML = `<div class="card-corner top-left"><span class="card-rank">${card.rank}</span><span class="card-suit">${card.suit}</span></div><div class="card-center">${card.suit}</div><div class="card-corner bottom-right"><span class="card-rank">${card.rank}</span><span class="card-suit">${card.suit}</span></div>${isTrump ? '<div class="trump-mark">★</div>' : ''}`;
    return el;
  }

  onCardClick(card, cardEl) {
    document.querySelectorAll('.card.selected').forEach(el => el.classList.remove('selected'));
    this.selectedCard = card;
    cardEl.classList.add('selected');
    this.makeMove(card.id);
  }

  makeMove(cardId) {
    this.socket.emit('make-move', { cardId }, (response) => {
      if (!response.success) {
        const tg = window.Telegram?.WebApp;
        if (tg) tg.showPopup({ title: 'Неверный ход', message: response.error });
        document.querySelectorAll('.card.selected').forEach(el => el.classList.remove('selected'));
      }
      this.selectedCard = null;
    });
  }

  takeCards() {
    this.socket.emit('take-cards', {}, (response) => {
      if (!response.success) {
        const tg = window.Telegram?.WebApp;
        if (tg) tg.showPopup({ title: 'Ошибка', message: response.error });
      }
    });
  }

  endTurn() {
    this.socket.emit('end-turn');
  }

  showResult() {
    const resultEl = document.getElementById('game-result');
    const titleEl = document.getElementById('result-title');
    const msgEl = document.getElementById('result-message');
    if (!resultEl) return;
    resultEl.classList.remove('hidden');
    if (this.gameState.loser) {
      const isLoser = this.gameState.players[this.gameState.myIndex]?.firstName === this.gameState.loser;
      if (titleEl) titleEl.textContent = isLoser ? '😵 Вы дурак!' : '🎉 Победа!';
      if (msgEl) msgEl.textContent = isLoser ? 'Вы проиграли. В следующий раз повезёт!' : `Победитель: ${this.gameState.winner}`;
    } else {
      if (titleEl) titleEl.textContent = '🤝 Ничья!';
    }
  }
}'''
