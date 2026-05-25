// Главное состояние игры: волна, деньги, здоровье замка, враги и колода.
    let SLOT_COUNT = 0;
    let wave = 1;
    let unlockedLevel = 1;
    let currentLevel = 1;
    let levelStars = {};
    let menuGold = 0;
    let battleGold = BATTLE_START_GOLD;
    let hp = 100;
    let killed = 0;
    let finishedEnemies = 0;
    let currentWaveFinished = 0;
    let currentWaveTotal = 16;
    let targetKills = 16;
    let roundRewardPaid = false;
    let bossSpawned = false;
    let skipRewardPaid = false;
    let activeWaves = 0;
    let gameSpeed = 1;
    let enemies = [];
    let placed = [];
    let lastAtk = [];
    let dragonChannels = [];
    let selectedPlacedSlot = null;
    let selectedDeckCard = null;
    let pendingDeckType = null;
    let deckCards = [];
    let ownedClasses = ['warrior', 'archer'];
    let dragGhost = null;
    let running = false;
    let spawnTimers = [];
    let bossTimers = [];
    let saveReady = false;
    let saveTimer = null;
    let lastFrame = performance.now();
    let mobilePerformanceMode = false;
    let lastSkipDisabled = true;
    let layoutMode = getStoredValue('hamster-defense-layout-mode') || getDefaultLayoutMode();

    function getDefaultLayoutMode() {
      return window.innerWidth >= 900 && window.innerWidth > window.innerHeight ? 'pc' : 'phone';
    }

    // Проверяет, открыт ли телефон вертикально, чтобы включить виртуальный landscape.
    function shouldUsePortraitLandscape() {
      return layoutMode === 'phone' && window.innerHeight > window.innerWidth && Math.min(window.innerWidth, window.innerHeight) <= 820;
    }

    // Ширина боковой панели в мобильном landscape: маленьким телефонам отдаем больше места карте.
    function getMobileHudWidth(viewportWidth, viewportHeight) {
      const shortSide = Math.min(viewportWidth, viewportHeight);
      if (shortSide <= 360) return 118;
      if (shortSide <= 390) return 128;
      if (shortSide <= 430) return 142;
      return 154;
    }

    function getViewportSize() {
      const viewport = window.visualViewport;
      return {
        width: Math.round(viewport?.width || window.innerWidth),
        height: Math.round(viewport?.height || window.innerHeight)
      };
    }

    function shouldReduceEffects(scale, tinyPhone) {
      const weakCpu = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4;
      const lowMemory = navigator.deviceMemory && navigator.deviceMemory <= 4;
      return layoutMode === 'phone' && (tinyPhone || scale < 0.62 || weakCpu || lowMemory);
    }

    function updateMenuOrientation() {
      document.getElementById('main-menu').classList.remove('portrait-landscape');
      updateLayoutButtons();
    }

    // Ручной выбор конфигурации экрана: ПК или телефон.
    function setLayoutMode(mode) {
      layoutMode = mode === 'pc' ? 'pc' : 'phone';
      setStoredValue('hamster-defense-layout-mode', layoutMode);
      updateLayoutButtons();
      updateGameScale();
    }

    function updateLayoutButtons() {
      const pcButton = document.getElementById('layout-pc-btn');
      const phoneButton = document.getElementById('layout-phone-btn');
      if (!pcButton || !phoneButton) return;
      pcButton.classList.toggle('active', layoutMode === 'pc');
      phoneButton.classList.toggle('active', layoutMode === 'phone');
      pcButton.textContent = t('pc');
      phoneButton.textContent = t('phone');
      document.body.classList.toggle('layout-pc', layoutMode === 'pc');
      document.body.classList.toggle('layout-phone', layoutMode === 'phone');
    }

    function toggleLanguage() {
      gameLanguage = gameLanguage === 'en' ? 'uk' : 'en';
      setStoredValue('hamster-defense-language', gameLanguage);
      applyLanguage();
    }

    function getHamsterName(type) {
      return t(`hamsters.${type}`);
    }

    function getInventoryName(type) {
      return t(`inventoryNames.${type}`);
    }

    function applyLanguage() {
      document.documentElement.lang = gameLanguage === 'uk' ? 'uk' : 'en';
      document.getElementById('menu-subtitle').textContent = t('menuSubtitle');
      document.getElementById('play-btn').textContent = t('play');
      document.getElementById('inventory-btn').textContent = t('inventory');
      document.getElementById('shop-btn').textContent = t('shop');
      document.getElementById('language-btn').textContent = t('languageButton');
      document.getElementById('level-title').textContent = t('levelSelect');
      document.getElementById('level-back-btn').textContent = t('back');
      document.getElementById('inventory-title').textContent = t('inventoryTitle');
      document.getElementById('confirm-yes-btn').textContent = t('yes');
      document.getElementById('confirm-no-btn').textContent = t('no');
      document.getElementById('inventory-close-btn').textContent = t('close');
      document.getElementById('shop-title').textContent = t('shopTitle');
      document.getElementById('shop-close-btn').textContent = t('close');
      document.getElementById('skip-wave-btn').textContent = t('skip');
      document.getElementById('exit-menu-btn').textContent = t('menu');
      document.getElementById('start-btn').textContent = t('startWave');
      document.querySelector('.deck').setAttribute('aria-label', t('deck'));
      updateLayoutButtons();
      cancelAddToDeck();
      renderDeck();
      renderLevelMenu();
      renderInventory();
      renderShop();
      updateWaveLabel();
      if (selectedPlacedSlot !== null) openUpgradePanel(selectedPlacedSlot);
    }

    // Возвращает id аккаунта Telegram. Если игра открыта не в Telegram, будет local.
    function getTelegramUserId() {
      return window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 'local';
    }

    // Ключ сохранения: у каждого Telegram аккаунта свой прогресс.
    function getSaveKey() {
      return `hamster-defense-progress:${getTelegramUserId()}`;
    }

    // Данные, которые сохраняются между запусками игры.
    function collectProgress() {
      return {
        version: SAVE_VERSION,
        tgUserId: getTelegramUserId(),
        menuGold,
        wave,
        unlockedLevel,
        currentLevel,
        levelStars: { ...levelStars },
        ownedClasses: [...ownedClasses],
        deckCards: [...deckCards]
      };
    }

    function clampNumber(value, min, max, fallback) {
      const number = Number(value);
      if (!Number.isFinite(number)) return fallback;
      return Math.min(max, Math.max(min, Math.floor(number)));
    }

    function sanitizeOwnedClasses(classes) {
      return Array.from(new Set(['warrior', 'archer', ...(Array.isArray(classes) ? classes : [])]))
        .filter(type => HAMSTERS[type]);
    }

    function sanitizeDeckCards(cards, classes) {
      const seen = new Set();
      if (!Array.isArray(cards)) return [];
      return cards.filter(type => {
        if (!HAMSTERS[type] || !classes.includes(type) || seen.has(type)) return false;
        seen.add(type);
        return true;
      }).slice(0, 5);
    }

    function normalizeProgress(progress) {
      const source = progress && typeof progress === 'object' ? progress : {};
      const cleanOwnedClasses = sanitizeOwnedClasses(source.ownedClasses);
      const cleanUnlockedLevel = clampNumber(source.unlockedLevel, 1, 30, 1);
      const cleanCurrentLevel = Math.min(clampNumber(source.currentLevel, 1, 30, 1), cleanUnlockedLevel);
      return {
        version: SAVE_VERSION,
        tgUserId: getTelegramUserId(),
        menuGold: clampNumber(source.menuGold ?? source.gold, 0, 999999, 0),
        wave: clampNumber(source.wave, 1, 5, 1),
        unlockedLevel: cleanUnlockedLevel,
        currentLevel: cleanCurrentLevel,
        levelStars: sanitizeLevelStars(source.levelStars),
        ownedClasses: cleanOwnedClasses,
        deckCards: sanitizeDeckCards(source.deckCards, cleanOwnedClasses)
      };
    }

    // Применяет сохраненный прогресс к игре. Даже битые данные приводятся к безопасным значениям.
    function applyProgress(progress) {
      const clean = normalizeProgress(progress);
      menuGold = clean.menuGold;
      wave = clean.wave;
      unlockedLevel = clean.unlockedLevel;
      currentLevel = clean.currentLevel;
      levelStars = clean.levelStars;
      ownedClasses = clean.ownedClasses;
      deckCards = clean.deckCards;
      updateMenuGold();
      updateBattleGold();
      updateWaveLabel();
      renderDeck();
      renderInventory();
      renderShop();
    }

    function sanitizeLevelStars(stars) {
      const clean = {};
      if (!stars || typeof stars !== 'object') return clean;
      for (let level = 1; level <= 30; level++) {
        const value = Number(stars[level]);
        if (Number.isFinite(value) && value > 0) clean[level] = Math.min(3, Math.max(1, Math.floor(value)));
      }
      return clean;
    }

    // Загружает прогресс: сначала с сервера бота, если он есть, потом из localStorage.
    async function loadProgress() {
      let progress = null;
      const tgUserId = getTelegramUserId();
      const initData = window.Telegram?.WebApp?.initData || '';

      if (tgUserId !== 'local') {
        try {
          const response = await fetch(`${SAVE_API_URL}?tgUserId=${encodeURIComponent(tgUserId)}`, {
            headers: { 'X-Telegram-Init-Data': initData }
          });
          if (response.ok) progress = await response.json();
        } catch (error) {}
      }

      if (!progress) {
        try {
          progress = JSON.parse(getStoredValue(getSaveKey(), 'null'));
        } catch (error) {
          try {
            localStorage.removeItem(getSaveKey());
          } catch (removeError) {}
        }
      }

      applyProgress(progress);
      saveReady = true;
      saveProgress();
    }

    // Сохраняет прогресс локально и отправляет на сервер бота, если он подключен.
    function saveProgress() {
      if (!saveReady) return;
      const progress = normalizeProgress(collectProgress());
      try {
        setStoredValue(getSaveKey(), JSON.stringify(progress));
      } catch (error) {}

      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        const initData = window.Telegram?.WebApp?.initData || '';
        if (getTelegramUserId() === 'local') return;
        fetch(SAVE_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Telegram-Init-Data': initData
          },
          body: JSON.stringify(progress)
        }).catch(() => {});
      }, 350);
    }

    // окно инвентаря.
    function openInventory() {
      renderInventory();
      document.getElementById('inventory-modal').style.display = 'flex';
      cancelAddToDeck();
    }

    function openLevelMenu() {
      renderLevelMenu();
      document.getElementById('level-modal').style.display = 'flex';
    }

    function closeLevelMenu() {
      document.getElementById('level-modal').style.display = 'none';
    }

    function getLevelNodePosition(level) {
      const group = Math.floor((level - 1) / 10);
      const index = (level - 1) % 10;
      const routes = [
        [
          [10, 26], [18, 18], [27, 24], [34, 15], [43, 23],
          [51, 15], [60, 24], [69, 18], [78, 26], [87, 18]
        ],
        [
          [12, 53], [21, 61], [31, 52], [40, 63], [50, 53],
          [59, 64], [68, 53], [77, 62], [86, 51], [91, 60]
        ],
        [
          [9, 82], [18, 74], [28, 83], [38, 75], [48, 84],
          [58, 76], [67, 85], [76, 77], [84, 86], [92, 78]
        ]
      ];
      return routes[group][index];
    }

    function drawLevelRoute(map) {
      const points = [];
      for (let level = 1; level <= 30; level++) points.push(getLevelNodePosition(level));
      for (let i = 0; i < points.length - 1; i++) {
        const [x1, y1] = points[i];
        const [x2, y2] = points[i + 1];
        const segment = document.createElement('div');
        const dx = x2 - x1;
        const dy = y2 - y1;
        segment.className = 'level-route-segment';
        segment.style.left = x1 + '%';
        segment.style.top = y1 + '%';
        segment.style.width = Math.hypot(dx, dy) + '%';
        segment.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
        map.appendChild(segment);
      }
    }

    function getLevelStarsText(level) {
      const stars = levelStars[level] || 0;
      return '★'.repeat(stars) + '☆'.repeat(3 - stars);
    }

    function renderLevelMenu() {
      const grid = document.getElementById('level-grid');
      grid.innerHTML = '';
      ['summer', 'snow', 'desert'].forEach(biome => {
        const island = document.createElement('div');
        island.className = `level-island ${biome}`;
        grid.appendChild(island);
      });
      drawLevelRoute(grid);
      for (let level = 1; level <= 30; level++) {
        const button = document.createElement('button');
        const locked = level > unlockedLevel;
        const [x, y] = getLevelNodePosition(level);
        button.className = `level-dot ${getBiome(level)}${locked ? ' locked' : ''}${level === currentLevel ? ' current' : ''}`;
        button.style.left = x + '%';
        button.style.top = y + '%';
        button.innerHTML = locked
          ? '<span class="level-number">🔒</span>'
          : `<span class="level-number">${level}</span><span class="level-stars">${getLevelStarsText(level)}</span>`;
        button.title = locked ? t('lockedLevel', { level: level - 1 }) : t('levelTitle', { level });
        button.onclick = () => {
          if (locked) return;
          enterBattle(level);
        };
        grid.appendChild(button);
      }
    }

    function closeInventory() {
      document.getElementById('inventory-modal').style.display = 'none';
    }

    // Открывает окно магазина. Пока это заглушка.
    function openShop() {
      renderShop();
      document.getElementById('shop-modal').style.display = 'flex';
    }

    function closeShop() {
      document.getElementById('shop-modal').style.display = 'none';
    }

    function renderInventory() {
      const grid = document.getElementById('inventory-grid');
      if (!grid) return;
      grid.innerHTML = ownedClasses.map(type => `
        <div class="inventory-card" onclick="askAddToDeck('${type}')">
          <img src="${HAMSTERS[type].img}" alt="">
          <b>${getInventoryName(type)}</b>
        </div>
      `).join('');
    }

    function renderShop() {
      const shop = document.getElementById('shop-content');
      if (!shop) return;
      shop.innerHTML = `<p class="menu-coins">🪙 ${menuGold}</p>` + Object.entries(SHOP_CLASSES).map(([type, item]) => {
        const owned = ownedClasses.includes(type);
        return `
          <div class="shop-card">
            <img src="${item.img}" alt="">
            <div>
              <h3>${t(item.nameKey)}</h3>
              <p>${t(item.textKey)}</p>
              <button onclick="buyClass('${type}')" ${owned ? 'disabled' : ''}>
                ${owned ? t('bought') : t('buyFor', { price: item.price })}
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    function buyClass(type) {
      const item = SHOP_CLASSES[type];
      if (!item || ownedClasses.includes(type)) return;
      if (menuGold < item.price) {
        alert(t('notEnoughCoins'));
        return;
      }
      menuGold -= item.price;
      ownedClasses.push(type);
      updateMenuGold();
      renderShop();
      renderInventory();
      saveProgress();
    }

    // добавить ли выбранного хомяка в колоду.
    function askAddToDeck(type) {
      if (!ownedClasses.includes(type)) return;
      pendingDeckType = type;
      document.getElementById('inventory-message').textContent = t('putInDeck', { name: getHamsterName(type) });
      document.getElementById('deck-confirm').style.display = 'grid';
    }

    // Добавляет карту хомяка в колоду, если такой карты там еще нет.
    function confirmAddToDeck() {
      if (!pendingDeckType) return;
      if (deckCards.includes(pendingDeckType)) {
        document.getElementById('inventory-message').textContent = t('alreadyInDeck', { name: getHamsterName(pendingDeckType) });
        pendingDeckType = null;
        document.getElementById('deck-confirm').style.display = 'none';
        return;
      }
      if (deckCards.length >= 5) {
        document.getElementById('inventory-message').textContent = t('deckFull');
        return;
      }
      deckCards.push(pendingDeckType);
      renderDeck();
      document.getElementById('inventory-message').textContent = t('addedToDeck', { name: getHamsterName(pendingDeckType) });
      pendingDeckType = null;
      document.getElementById('deck-confirm').style.display = 'none';
      saveProgress();
    }

    function cancelAddToDeck() {
      pendingDeckType = null;
      document.getElementById('inventory-message').textContent = t('inventoryDefault');
      document.getElementById('deck-confirm').style.display = 'none';
    }

    // Запускает бой из главного меню.
    async function enterBattle(levelNumber = currentLevel) {
      if (deckCards.length === 0) {
        alert(t('needDeck'));
        return;
      }
      if (layoutMode === 'phone') await requestGameFullscreen();
      currentLevel = levelNumber;
      wave = 1;
      battleGold = BATTLE_START_GOLD;
      applyLevelMap();
      closeLevelMenu();
      document.getElementById('main-menu').style.display = 'none';
      document.getElementById('main-menu').classList.remove('portrait-landscape');
      document.getElementById('battle-screen').style.display = 'flex';
      document.body.classList.add('battle-active');
      updateGameScale();
      buildGrid();
      resetBattle();
      updateBattleGold();
      renderDeck();
      setTimeout(updateGameScale, 350);
    }

    // Пытается открыть игру на весь экран и повернуть в landscape.
    async function requestGameFullscreen() {
      const root = document.documentElement;
      try {
        if (root.requestFullscreen && !document.fullscreenElement) {
          await root.requestFullscreen({ navigationUI: 'hide' });
        }
      } catch (error) {
        try {
          if (root.requestFullscreen && !document.fullscreenElement) {
            await root.requestFullscreen();
          }
        } catch (fallbackError) {}
      }
      await lockLandscape();
    }

    async function lockLandscape() {
      if (!screen.orientation || !screen.orientation.lock) return;
      try {
        await screen.orientation.lock('landscape-primary');
      } catch (error) {
        try {
          await screen.orientation.lock('landscape');
        } catch (fallbackError) {}
      }
    }

    // Масштабирует карту и нижнюю панель под размер экрана.
    function updateGameScale() {
      const screen = document.getElementById('battle-screen');
      const hud = document.getElementById('battle-hud');
      const viewport = getViewportSize();
      const useVirtualLandscape = shouldUsePortraitLandscape();
      const viewportWidth = useVirtualLandscape ? viewport.height : viewport.width;
      const viewportHeight = useVirtualLandscape ? viewport.width : viewport.height;
      const usePhoneLandscape = layoutMode === 'phone' && !useVirtualLandscape && viewportWidth > viewportHeight && viewportHeight <= 560 && viewportWidth <= 1180;
      const useSideHud = useVirtualLandscape || usePhoneLandscape;
      const tinyPhone = Math.min(viewport.width, viewport.height) <= 390 || viewportHeight <= 390;
      const hudWidth = useSideHud ? getMobileHudWidth(viewportWidth, viewportHeight) : 0;
      const verticalPadding = useSideHud ? (tinyPhone ? 10 : 16) : 34;

      screen.classList.toggle('virtual-landscape', useVirtualLandscape);
      screen.classList.toggle('phone-landscape', usePhoneLandscape);
      screen.classList.toggle('mobile-optimized', layoutMode === 'phone' && (useSideHud || window.innerWidth <= 760 || window.innerHeight <= 520));
      screen.classList.toggle('tiny-phone', layoutMode === 'phone' && tinyPhone);
      screen.classList.remove('portrait-landscape');
      screen.style.setProperty('--game-hud-width', hudWidth + 'px');

      const hudHeight = hud ? hud.offsetHeight + 12 : 106;
      const availableWidth = useSideHud ? viewportWidth - hudWidth - 24 : viewportWidth - 24;
      const availableHeight = useSideHud ? viewportHeight - verticalPadding : viewportHeight - verticalPadding - hudHeight;
      const scale = Math.max(0.42, Math.min(1, availableWidth / GAME.width, availableHeight / GAME.height));

      mobilePerformanceMode = screen.classList.contains('mobile-optimized') && shouldReduceEffects(scale, tinyPhone);
      screen.classList.toggle('low-effects', mobilePerformanceMode);
      screen.style.setProperty('--game-scale', scale);
      screen.style.setProperty('--game-width', GAME.width * scale + 'px');
      screen.style.setProperty('--game-height', GAME.height * scale + 'px');
    }

    // Создает клетки на всей карте и блокирует дороги/замок.
    function buildGrid() {
      const field = document.getElementById('battle-field');
      field.querySelectorAll('.slot').forEach(slot => slot.remove());
      placed = [];
      lastAtk = [];
      dragonChannels = [];

      for (let row = 0; row < GRID.rows; row++) {
        for (let col = 0; col < GRID.cols; col++) {
          const center = {
            x: col * GRID.cellW + GRID.cellW / 2,
            y: row * GRID.cellH + GRID.cellH / 2
          };
          const slotIndex = placed.length;
          const slot = document.createElement('div');
          slot.className = 'slot';
          slot.id = 'slot-' + slotIndex;
          slot.style.left = col * GRID.cellW + 'px';
          slot.style.top = row * GRID.cellH + 'px';

          if (isBlockedCell(center, col, row)) {
            slot.classList.add('road-cell');
          } else {
            slot.onclick = () => handleSlotClick(slotIndex);
          }

          field.appendChild(slot);
          placed.push(null);
          lastAtk.push(0);
          dragonChannels.push(null);
        }
      }

      SLOT_COUNT = placed.length;
    }

    function getBiome(level = currentLevel) {
      if (level <= 10) return 'summer';
      if (level <= 20) return 'snow';
      return 'desert';
    }

    function applyLevelMap() {
      const biome = getBiome();
      PATHS = LEVEL_PATHS[biome];
      const field = document.getElementById('battle-field');
      field.classList.remove('summer', 'snow', 'desert');
      field.classList.add(biome);
      renderRoads();
      renderDecorations(biome);
    }

    function renderRoads() {
      const roads = document.getElementById('roads');
      const pathData = PATHS.map(path => `M ${path.map(point => `${point.x} ${point.y}`).join(' L ')}`);
      roads.innerHTML = `
        ${pathData.map(d => `<path class="road-base" d="${d}" />`).join('')}
        ${pathData.map(d => `<path class="road-mid" d="${d}" />`).join('')}
        ${pathData.map(d => `<path class="road-edge" d="${d}" />`).join('')}
      `;
    }

    function renderDecorations(biome) {
      const layer = document.getElementById('decor-layer');
      const decor = {
        summer: [
          ['Tree1.png', 70, 286, 82], ['Tree2.png', 282, 58, 70],
          ['Rock4_1.png', 842, 418, 68], ['Rock2_3.png', 706, 42, 52]
        ],
        snow: [
          ['Rock4_1.png', 76, 342, 66], ['Rock2_3.png', 268, 72, 46],
          ['Snow_tree1.png', 830, 390, 82], ['Snow_christmass_tree1.png', 672, 38, 78]
        ],
        desert: [
          ['Rock5_2.png', 86, 330, 72], ['Palm_tree1_1.png', 245, 88, 78],
          ['Burned_tree1.png', 760, 74, 72], ['Rock4_1.png', 840, 425, 64]
        ]
      }[biome];
      layer.innerHTML = decor.map(([src, x, y, size]) =>
        `<img class="map-decor" src="${src}" alt="" loading="eager" decoding="async" style="left:${x}px;top:${y}px;width:${size}px;height:${size}px;">`
      ).join('');
    }

    // Проверяет, можно ли ставить хомяка на эту клетку.
    function isBlockedCell(center, col, row) {
      if (Math.hypot(center.x - 480, center.y - 270) < CASTLE_RADIUS) return true;
      return PATHS.some(path => pointNearPath(center, path, ROAD_RADIUS));
    }

    function pointNearPath(point, path, radius) {
      for (let i = 0; i < path.length - 1; i++) {
        if (distanceToSegment(point, path[i], path[i + 1]) < radius) return true;
      }
      return false;
    }

    function distanceToSegment(point, a, b) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSq = dx * dx + dy * dy;
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
      const x = a.x + t * dx;
      const y = a.y + t * dy;
      return Math.hypot(point.x - x, point.y - y);
    }

    // Сбрасывает волну: убирает врагов, восстанавливает HP и кнопку старта.
    function resetBattle() {
      dragonChannels.forEach((channel, slotIndex) => {
        if (channel) clearDragonChannel(slotIndex);
      });
      enemies.forEach(enemy => enemy.el.remove());
      enemies = [];
      killed = 0;
      finishedEnemies = 0;
      currentWaveFinished = 0;
      roundRewardPaid = false;
      bossSpawned = false;
      skipRewardPaid = false;
      activeWaves = 0;
      hp = 100;
      running = false;
      currentWaveTotal = getWaveConfig(wave).count + (getWaveConfig(wave).boss ? 1 : 0);
      targetKills = currentWaveTotal;
      lastSkipDisabled = false;
      document.getElementById('win-screen').style.display = 'none';
      document.querySelector('#win-screen h2').textContent = t('waveCleared');
      document.querySelector('#win-screen button').textContent = t('nextWave');
      document.getElementById('start-btn').disabled = false;
      updateHp();
      updateWaveLabel();
      updateSkipButton();
    }

    // Рисует карты в нижней колоде.
    function renderDeck() {
      for (let i = 0; i < 5; i++) {
        const card = document.getElementById('deck-card-' + i);
        const type = deckCards[i];
        card.className = 'deck-card';
        card.innerHTML = '';
        card.onpointerdown = null;
        card.onclick = null;

        if (!type) continue;
        card.classList.add('available');
        if (selectedDeckCard === i) card.classList.add('selected');
        card.innerHTML = `
          <div class="deck-card-inner">
            <div class="deck-card-face deck-card-front">
              <img class="${type === 'warrior' ? 'warrior-sprite' : ''}" src="${HAMSTERS[type].img}" alt="">
              <span>${getHamsterName(type)}</span>
            </div>
          </div>
        `;
        card.onclick = () => selectDeckCard(i);
        card.onpointerdown = event => startDeckDrag(event, i);
      }
    }

    // Выбирает карту в колоде кликом.
    function selectDeckCard(cardIndex) {
      selectedDeckCard = selectedDeckCard === cardIndex ? null : cardIndex;
      renderDeck();
    }

    // Ставит выбранного хомяка на клетку за 100 монет.
    function handleSlotClick(slotIndex) {
      if (placed[slotIndex]) {
        openUpgradePanel(slotIndex);
        return;
      }
      placeSelectedHamster(slotIndex);
    }

    function placeSelectedHamster(slotIndex) {
      if (placed[slotIndex] || selectedDeckCard === null) return;
      const type = deckCards[selectedDeckCard];
      if (!type) return;
      if (battleGold < 100) {
        alert(t('need100'));
        return;
      }
      const limitMessage = getPlacementLimitMessage(type);
      if (limitMessage) {
        alert(limitMessage);
        return;
      }
      placeHamsterOnSlot(slotIndex, type);
    }

    function placeHamsterOnSlot(slotIndex, type) {
      const slot = document.getElementById('slot-' + slotIndex);
      if (!slot || slot.classList.contains('road-cell') || placed[slotIndex]) return;
      battleGold -= 100;
      updateBattleGold();
      placed[slotIndex] = { type, level: 1 };
      slot.classList.add('placed');
      setHamsterImage(slotIndex, 'stand');
      selectedDeckCard = null;
      renderDeck();
    }

    // Проверяет лимиты: всего 13, воинов 4, лучников 4.
    function getPlacementLimitMessage(type) {
      const totalPlaced = placed.filter(Boolean).length;
      if (totalPlaced >= HAMSTER_LIMITS.total) return t('totalLimit');

      const typePlaced = placed.filter(hamster => hamster && hamster.type === type).length;
      if (typePlaced >= HAMSTER_LIMITS[type]) {
        if (type === 'archer') return t('archerLimit');
        if (type === 'mage') return t('mageLimit');
        if (type === 'dragon') return t('dragonLimit');
        if (type === 'seed') return t('seedLimit');
        return t('warriorLimit');
      }

      return '';
    }

    function getHamsterStats(hamster) {
      return HAMSTER_UPGRADES[hamster.type][hamster.level - 1];
    }

    function openUpgradePanel(slotIndex) {
      const hamster = placed[slotIndex];
      if (!hamster) return;
      selectedPlacedSlot = slotIndex;
      const panel = document.getElementById('upgrade-panel');
      const slot = document.getElementById('slot-' + slotIndex);
      const nextCost = UPGRADE_COSTS[hamster.level + 1];

      panel.style.left = Math.max(8, slot.offsetLeft - 202) + 'px';
      panel.style.top = Math.max(8, Math.min(390, slot.offsetTop - 12)) + 'px';
      panel.innerHTML = `
        <h3>${getHamsterName(hamster.type)} ${hamster.level}</h3>
        <ul>
          <li>${getUpgradePanelText(hamster)}</li>
          <li>${t('sell', { price: getHamsterSellPrice(hamster) })}</li>
        </ul>
        ${nextCost ? `<button onclick="upgradeSelectedHamster()">${t('upgradeFor', { cost: nextCost })}</button>` : ''}
        <button class="sell-hamster" onclick="sellSelectedHamster()">${t('sellFor', { price: getHamsterSellPrice(hamster) })}</button>
        <button class="close-upgrade" onclick="closeUpgradePanel()">${t('close')}</button>
      `;
      panel.style.display = 'block';
    }

    function getUpgradePanelText(hamster) {
      const nextCost = UPGRADE_COSTS[hamster.level + 1];
      if (hamster.type === 'seed') {
        const income = getHamsterStats(hamster).income;
        return nextCost ? t('seedIncome', { income }) : t('seedMaxIncome', { income });
      }
      return nextCost ? t('upgradeReady') : t('maxLevel');
    }

    function closeUpgradePanel() {
      selectedPlacedSlot = null;
      document.getElementById('upgrade-panel').style.display = 'none';
    }

    function upgradeSelectedHamster() {
      const hamster = placed[selectedPlacedSlot];
      if (!hamster || hamster.level >= 5) return;
      const cost = UPGRADE_COSTS[hamster.level + 1];
      if (battleGold < cost) {
        alert(t('notEnoughCoins'));
        return;
      }
      battleGold -= cost;
      hamster.level++;
      updateBattleGold();
      openUpgradePanel(selectedPlacedSlot);
    }

    function getHamsterSellPrice(hamster) {
      let invested = 100;
      for (let level = 2; level <= hamster.level; level++) {
        invested += UPGRADE_COSTS[level] || 0;
      }
      return Math.floor(invested / 2);
    }

    function getSeedWaveIncome() {
      return placed.reduce((total, hamster) => {
        if (!hamster || hamster.type !== 'seed') return total;
        return total + getHamsterStats(hamster).income;
      }, 0);
    }

    function getCastleStars() {
      if (hp >= 100) return 3;
      if (hp >= 50) return 2;
      return 1;
    }

    function sellSelectedHamster() {
      const slotIndex = selectedPlacedSlot;
      const hamster = placed[slotIndex];
      if (!hamster) return;
      const slot = document.getElementById('slot-' + slotIndex);
      battleGold += getHamsterSellPrice(hamster);
      placed[slotIndex] = null;
      lastAtk[slotIndex] = 0;
      clearDragonChannel(slotIndex);
      if (slot) {
        slot.classList.remove('placed');
        slot.innerHTML = '';
      }
      closeUpgradePanel();
      updateBattleGold();
    }

    // Перетаскивание карты из колоды на клетку.
    function startDeckDrag(event, cardIndex) {
      const type = deckCards[cardIndex];
      if (!type) return;

      dragGhost = document.createElement('img');
      dragGhost.className = 'drag-ghost';
      dragGhost.src = HAMSTERS[type].img;
      document.body.appendChild(dragGhost);
      moveDragGhost(event.clientX, event.clientY);

      const move = moveEvent => moveDragGhost(moveEvent.clientX, moveEvent.clientY);
      const up = upEvent => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        if (dragGhost) dragGhost.remove();
        dragGhost = null;

        const target = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
        const slot = target && target.closest ? target.closest('.slot') : null;
        if (slot && !slot.classList.contains('road-cell')) {
          selectedDeckCard = cardIndex;
          placeSelectedHamster(Number(slot.id.replace('slot-', '')));
        }
      };

      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    }

    function moveDragGhost(x, y) {
      if (!dragGhost) return;
      dragGhost.style.left = x + 'px';
      dragGhost.style.top = y + 'px';
    }

    // Меняет картинку хомяка: стоит, 1-й кадр атаки, 2-й кадр атаки.
    function setHamsterImage(slotIndex, state) {
      const hamster = placed[slotIndex];
      if (!hamster) return;
      const spriteClass = hamster.type === 'warrior' ? ' class="warrior-sprite"' : '';
      document.getElementById('slot-' + slotIndex).innerHTML = `<img${spriteClass} src="${ASSETS[hamster.type][state]}" alt="">`;
    }

    // Запускает текущую волну врагов.
    function startWave() {
      if (!placed.some(Boolean)) {
        alert(t('placeOne'));
        return;
      }

      running = true;
      closeUpgradePanel();
      targetKills = 0;
      finishedEnemies = 0;
      killed = 0;
      roundRewardPaid = false;
      bossSpawned = false;
      startWaveSpawn(wave);
      updateWaveLabel();
      document.getElementById('start-btn').disabled = true;
      updateSkipButton();
    }

    function startWaveSpawn(waveNumber) {
      const config = getWaveConfig(waveNumber);
      activeWaves++;
      currentWaveFinished = 0;
      currentWaveTotal = config.count + (config.boss ? 1 : 0);
      targetKills += currentWaveTotal;
      skipRewardPaid = false;
      let spawned = 0;
      const timer = setInterval(() => {
        if (spawned >= config.count) {
          clearInterval(timer);
          spawnTimers = spawnTimers.filter(item => item !== timer);
          if (config.boss) {
            const bossTimer = setTimeout(() => {
              bossTimers = bossTimers.filter(item => item !== bossTimer);
              if (running && !bossSpawned) spawnBoss(config);
            }, 1400);
            bossTimers.push(bossTimer);
          }
          activeWaves--;
          return;
        }
        spawnEnemy(spawned % PATHS.length, config);
        spawned++;
      }, config.spawnDelay);
      spawnTimers.push(timer);
    }

    // Создает обычного врага на одной из дорог.
    function spawnEnemy(pathIndex, config = getWaveConfig()) {
      const enemyIndex = config.enemyTypes[Math.floor(Math.random() * config.enemyTypes.length)];
      const base = ENEMIES[enemyIndex];
      const path = PATHS[pathIndex];
      const enemyHp = Math.ceil(base.hp * config.hpMult);
      const enemySpeed = Math.round(base.speed * config.speedMult);
      const enemyDmg = Math.ceil(base.dmg * config.dmgMult);
      const el = document.createElement('div');
      el.className = 'enemy';
      el.innerHTML = `<span class="enemy-hp">${enemyHp}</span><span>${base.icon}</span>`;
      document.getElementById('battle-field').appendChild(el);

      const enemy = {
        el,
        path,
        segment: 0,
        x: path[0].x,
        y: path[0].y,
        hp: enemyHp,
        maxHp: enemyHp,
        speed: enemySpeed,
        dmg: enemyDmg,
        isBoss: false,
        dead: false
      };
      enemies.push(enemy);
      positionEnemy(enemy);
    }

    // Создает босса на 5-й волне.
    function spawnBoss(config = getWaveConfig(wave)) {
      if (!config.boss) return;
      bossSpawned = true;
      const pathIndex = Math.random() < 0.5 ? 0 : 1;
      const path = PATHS[pathIndex];
      const boss = config.boss;
      const el = document.createElement('div');
      el.className = 'enemy boss';
      el.innerHTML = `<span class="enemy-hp">${boss.hp}</span><span>${boss.icon}</span>`;
      document.getElementById('battle-field').appendChild(el);

      const enemy = {
        el,
        path,
        segment: 0,
        x: path[0].x,
        y: path[0].y,
        hp: boss.hp,
        maxHp: boss.hp,
        speed: boss.speed,
        dmg: boss.dmg,
        isBoss: true,
        dead: false
      };
      enemies.push(enemy);
      positionEnemy(enemy);
    }

    // Главный игровой цикл: двигает врагов, атакует и проверяет конец волны.
    function gameLoop(now) {
      const dt = Math.min(0.04, (now - lastFrame) / 1000) * gameSpeed;
      lastFrame = now;

      if (running) {
        moveEnemies(dt);
        updateDragonChannels(now);
        attackEnemies(now);
        updateSkipButton();
        if (finishedEnemies >= targetKills && enemies.length === 0 && spawnTimers.length === 0 && bossTimers.length === 0 && activeWaves === 0) endWave();
      }

      requestAnimationFrame(gameLoop);
    }

    // Двигает врагов по точкам дороги.
    function moveEnemies(dt) {
      const movingEnemies = enemies.slice();
      movingEnemies.forEach(enemy => {
        if (enemy.dead) return;
        let remaining = enemy.speed * dt;

        while (remaining > 0 && enemy.segment < enemy.path.length - 1) {
          const next = enemy.path[enemy.segment + 1];
          const dx = next.x - enemy.x;
          const dy = next.y - enemy.y;
          const dist = Math.hypot(dx, dy);

          if (dist <= remaining) {
            enemy.x = next.x;
            enemy.y = next.y;
            enemy.segment++;
            remaining -= dist;
          } else {
            enemy.x += dx / dist * remaining;
            enemy.y += dy / dist * remaining;
            remaining = 0;
          }
        }

        if (enemy.segment >= enemy.path.length - 1) {
          damageCastle(enemy);
        } else {
          positionEnemy(enemy);
        }
      });
    }

    // Хомяки ищут врага в радиусе и атакуют.
    function attackEnemies(now) {
      placed.forEach((hamster, slotIndex) => {
        if (!hamster) return;
        const type = hamster.type;
        if (type === 'seed') return;
        if (type === 'dragon') return;
        const stats = getHamsterStats(hamster);
        const slotCenter = getSlotCenter(slotIndex);
        const range = stats.range;
        const delay = stats.delay;
        const damage = stats.damage;
        let target = null;
        let targetScore = -Infinity;

        for (const enemy of enemies) {
          const dx = enemy.x - slotCenter.x;
          const dy = enemy.y - slotCenter.y;
          if (dx * dx + dy * dy > range * range) continue;
          const progressScore = enemy.segment * 10000 - distanceToCastle(enemy);
          if (progressScore > targetScore) {
            target = enemy;
            targetScore = progressScore;
          }
        }

        if (!target || now - lastAtk[slotIndex] < delay) return;
        lastAtk[slotIndex] = now;
        animateHamster(slotIndex, type, () => {
          if (type === 'warrior') {
            showSlash(target.x, target.y);
            hitEnemy(target, damage);
          } else if (type === 'mage') {
            shootMagicArrow(slotCenter, target, stats);
          } else {
            shootArrow(slotCenter, target, damage);
          }
        });
      });
    }

    function updateDragonChannels(now) {
      placed.forEach((hamster, slotIndex) => {
        if (!hamster || hamster.type !== 'dragon') {
          clearDragonChannel(slotIndex);
          return;
        }

        const stats = getHamsterStats(hamster);
        const slotCenter = getSlotCenter(slotIndex);
        const current = dragonChannels[slotIndex];
        let target = current?.target;

        if (!isDragonTargetValid(target, slotCenter, stats.range)) {
          clearDragonChannel(slotIndex);
          target = findNearestEnemy(slotCenter, stats.range);
          if (!target) {
            setHamsterImage(slotIndex, 'stand');
            return;
          }
          dragonChannels[slotIndex] = {
            target,
            startedAt: now,
            lastTick: now,
            frame: 0,
            lastFrameAt: 0
          };
          addDragonFireMark(target, slotIndex);
        }

        const channel = dragonChannels[slotIndex];
        if (!channel) return;
        if (now - channel.lastFrameAt > 360) {
          channel.frame = channel.frame === 1 ? 2 : 1;
          channel.lastFrameAt = now;
          setHamsterImage(slotIndex, channel.frame === 1 ? 'anim1' : 'anim2');
        }
        if (now - channel.lastTick < stats.tickDelay) return;

        const elapsedSeconds = Math.floor(((now - channel.startedAt) / 1000) * stats.rampSpeed);
        const dps = getDragonRampDamage(elapsedSeconds) * stats.rampBonus;
        const tickDamage = dps * ((now - channel.lastTick) / 1000);
        channel.lastTick = now;
        hitEnemy(channel.target, tickDamage);
      });
    }

    function isDragonTargetValid(target, slotCenter, range) {
      if (!target || target.dead || !target.el.parentNode) return false;
      const dx = target.x - slotCenter.x;
      const dy = target.y - slotCenter.y;
      return dx * dx + dy * dy <= range * range;
    }

    function findNearestEnemy(slotCenter, range) {
      let target = null;
      let bestDistance = Infinity;
      const rangeSq = range * range;
      for (const enemy of enemies) {
        const dx = enemy.x - slotCenter.x;
        const dy = enemy.y - slotCenter.y;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq <= rangeSq && distanceSq < bestDistance) {
          target = enemy;
          bestDistance = distanceSq;
        }
      }
      return target;
    }

    function getDragonRampDamage(seconds) {
      const ramp = [0.35, 0.85, 1.45, 2.15, 3.0];
      if (seconds < ramp.length) return ramp[seconds];
      return 3 + (seconds - ramp.length + 1) * 0.75;
    }

    function clearDragonChannel(slotIndex) {
      const channel = dragonChannels[slotIndex];
      if (!channel) return;
      removeDragonFireMark(channel.target, slotIndex);
      dragonChannels[slotIndex] = null;
    }

    function clearDragonChannelsForEnemy(enemy) {
      dragonChannels.forEach((channel, slotIndex) => {
        if (channel?.target === enemy) clearDragonChannel(slotIndex);
      });
    }

    function addDragonFireMark(enemy, slotIndex) {
      if (!enemy) return;
      if (!enemy.fireMarkUsers) enemy.fireMarkUsers = new Set();
      enemy.fireMarkUsers.add(slotIndex);
      if (enemy.fireMark) return;
      const mark = document.createElement('div');
      mark.className = 'dragon-fire-mark';
      enemy.el.appendChild(mark);
      enemy.fireMark = mark;
    }

    function removeDragonFireMark(enemy, slotIndex) {
      if (!enemy?.fireMark) return;
      if (enemy.fireMarkUsers) {
        enemy.fireMarkUsers.delete(slotIndex);
        if (enemy.fireMarkUsers.size > 0) return;
      }
      enemy.fireMark.remove();
      enemy.fireMark = null;
      enemy.fireMarkUsers = null;
    }

    // Анимация атаки хомяка.
    function animateHamster(slotIndex, type, onHit) {
      setHamsterImage(slotIndex, 'anim1');
      setTimeout(() => {
        if (!placed[slotIndex] || placed[slotIndex].type !== type) return;
        setHamsterImage(slotIndex, 'anim2');
        onHit();
      }, 160);
      setTimeout(() => {
        if (placed[slotIndex] && placed[slotIndex].type === type) setHamsterImage(slotIndex, 'stand');
      }, 420);
    }

    // Полет стрелы лучника до врага.
    function shootArrow(from, target, damage) {
      if (mobilePerformanceMode) {
        hitEnemy(target, damage);
        return;
      }
      const arrow = document.createElement('div');
      arrow.className = 'projectile-arrow';
      arrow.style.left = from.x + 'px';
      arrow.style.top = from.y + 'px';
      arrow.style.setProperty('--arrow-angle', '0rad');
      document.getElementById('battle-field').appendChild(arrow);

      const fly = setInterval(() => {
        if (!target.el.parentNode || target.dead) {
          arrow.remove();
          clearInterval(fly);
          return;
        }
        const ax = parseFloat(arrow.style.left);
        const ay = parseFloat(arrow.style.top);
        const dx = target.x - ax;
        const dy = target.y - ay;
        const dist = Math.hypot(dx, dy);

        if (dist < 18) {
          showHit(target.x, target.y);
          hitEnemy(target, damage);
          arrow.remove();
          clearInterval(fly);
        } else {
          arrow.style.left = ax + dx / dist * 16 + 'px';
          arrow.style.top = ay + dy / dist * 16 + 'px';
          arrow.style.setProperty('--arrow-angle', Math.atan2(dy, dx) + 'rad');
        }
      }, 24);
    }

    // Магическая стрела мага: бьет цель и врагов рядом.
    function shootMagicArrow(from, target, stats) {
      if (mobilePerformanceMode) {
        const splashRadiusSq = stats.splashRadius * stats.splashRadius;
        const hitX = target.x;
        const hitY = target.y;
        enemies.slice().forEach(enemy => {
          const ex = enemy.x - hitX;
          const ey = enemy.y - hitY;
          if (ex * ex + ey * ey <= splashRadiusSq) {
            hitEnemy(enemy, enemy === target ? stats.damage : stats.splash);
          }
        });
        return;
      }
      const arrow = document.createElement('div');
      arrow.className = 'projectile-arrow magic';
      arrow.style.left = from.x + 'px';
      arrow.style.top = from.y + 'px';
      arrow.style.setProperty('--arrow-angle', '0rad');
      document.getElementById('battle-field').appendChild(arrow);

      const fly = setInterval(() => {
        if (!target.el.parentNode || target.dead) {
          arrow.remove();
          clearInterval(fly);
          return;
        }
        const ax = parseFloat(arrow.style.left);
        const ay = parseFloat(arrow.style.top);
        const dx = target.x - ax;
        const dy = target.y - ay;
        const dist = Math.hypot(dx, dy);

        if (dist < 20) {
          showMagicSplash(target.x, target.y);
          const splashRadiusSq = stats.splashRadius * stats.splashRadius;
          const hitX = target.x;
          const hitY = target.y;
          enemies.slice().forEach(enemy => {
            const ex = enemy.x - hitX;
            const ey = enemy.y - hitY;
            if (ex * ex + ey * ey <= splashRadiusSq) {
              hitEnemy(enemy, enemy === target ? stats.damage : stats.splash);
            }
          });
          arrow.remove();
          clearInterval(fly);
        } else {
          arrow.style.left = ax + dx / dist * 18 + 'px';
          arrow.style.top = ay + dy / dist * 18 + 'px';
          arrow.style.setProperty('--arrow-angle', Math.atan2(dy, dx) + 'rad');
        }
      }, 24);
    }

    // Наносит урон врагу и дает +5 монет за убийство.
    function hitEnemy(enemy, amount) {
      if (enemy.dead) return;
      enemy.hp -= amount;
      if (enemy.hp <= 0) {
        removeEnemy(enemy);
        killed++;
        finishedEnemies++;
        currentWaveFinished++;
        battleGold += 5;
        updateBattleGold();
        updateSkipButton();
      } else {
        enemy.el.querySelector('.enemy-hp').textContent = Math.ceil(enemy.hp);
      }
    }

    // Враг дошел до замка: наносит урон, а босс сразу проигрывает матч.
    function damageCastle(enemy) {
      if (enemy.isBoss) {
        removeEnemy(enemy);
        alert(t('bossLose'));
        location.reload();
        return;
      }
      hp -= enemy.dmg;
      updateHp();
      removeEnemy(enemy);
      finishedEnemies++;
      currentWaveFinished++;
      updateSkipButton();
      if (hp <= 0) {
        alert(t('castleLose'));
        location.reload();
      }
    }

    function removeEnemy(enemy) {
      if (!enemy || enemy.dead) return;
      enemy.dead = true;
      clearDragonChannelsForEnemy(enemy);
      enemy.el.remove();
      const index = enemies.indexOf(enemy);
      if (index !== -1) enemies.splice(index, 1);
    }

    // Завершает волну и выдает бонус монет за состояние замка.
    function endWave() {
      if (roundRewardPaid) return;
      running = false;
      roundRewardPaid = true;
      if (!skipRewardPaid) battleGold += (hp >= 100 ? 300 : 200) + getSeedWaveIncome();
      updateBattleGold();
      if (wave >= 5) {
        document.querySelector('#win-screen h2').textContent = t('matchCleared');
        document.querySelector('#win-screen button').textContent = t('menu');
        menuGold += LEVEL_WIN_MENU_REWARD;
        levelStars[currentLevel] = Math.max(levelStars[currentLevel] || 0, getCastleStars());
        updateMenuGold();
        if (currentLevel >= unlockedLevel && unlockedLevel < 30) {
          unlockedLevel = currentLevel + 1;
        }
        renderLevelMenu();
        saveProgress();
      }
      document.getElementById('win-screen').style.display = 'block';
    }

    // Переход на следующую волну или завершение матча после 5-й.
    function nextWave() {
      if (wave >= 5) {
        alert(t('matchAlert'));
        exitToMenu();
        return;
      }
      wave++;
      resetBattle();
    }

    function skipWave() {
      if (!canSkipWave()) return;
      skipRewardPaid = true;
      battleGold += (hp >= 100 ? 300 : 200) + getSeedWaveIncome();
      updateBattleGold();
      document.getElementById('skip-wave-btn').disabled = true;
      lastSkipDisabled = true;

      if (wave >= 5) return;
      wave++;
      startWaveSpawn(wave);
      updateWaveLabel();
    }

    function canSkipWave() {
      return running && !skipRewardPaid && wave < 5 && currentWaveFinished >= Math.ceil(currentWaveTotal / 2);
    }

    function toggleSpeed() {
      gameSpeed = gameSpeed === 1 ? 2 : 1;
      document.getElementById('speed-btn').classList.toggle('active', gameSpeed === 2);
    }

    function updateSkipButton() {
      const disabled = !canSkipWave();
      if (disabled === lastSkipDisabled) return;
      lastSkipDisabled = disabled;
      document.getElementById('skip-wave-btn').disabled = disabled;
    }

    // Возвращает из боя в главное меню.
    function exitToMenu() {
      spawnTimers.forEach(timer => clearInterval(timer));
      spawnTimers = [];
      bossTimers.forEach(timer => clearTimeout(timer));
      bossTimers = [];
      enemies.forEach(enemy => enemy.el.remove());
      enemies = [];
      running = false;
      dragonChannels.forEach((channel, slotIndex) => {
        if (channel) clearDragonChannel(slotIndex);
      });
      closeUpgradePanel();
      activeWaves = 0;
      gameSpeed = 1;
      document.getElementById('speed-btn').classList.remove('active');
      document.getElementById('skip-wave-btn').disabled = true;
      lastSkipDisabled = true;
      selectedDeckCard = null;
      if (dragGhost) dragGhost.remove();
      dragGhost = null;
      document.getElementById('win-screen').style.display = 'none';
      document.getElementById('battle-screen').style.display = 'none';
      document.getElementById('battle-screen').classList.remove('portrait-landscape');
      document.getElementById('battle-screen').classList.remove('virtual-landscape');
      document.getElementById('battle-screen').classList.remove('phone-landscape');
      document.getElementById('battle-screen').classList.remove('mobile-optimized');
      document.getElementById('battle-screen').classList.remove('tiny-phone');
      document.getElementById('main-menu').style.display = 'flex';
      document.body.classList.remove('battle-active');
      updateMenuOrientation();
      saveProgress();
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }

    // Обновляет полоску здоровья замка.
    function updateHp() {
      document.getElementById('hp-fill').style.width = Math.max(0, hp) + '%';
    }

    // Обновляет постоянные монеты меню.
    function updateMenuGold() {
      const menuCounter = document.getElementById('menu-coin-count');
      if (menuCounter) menuCounter.textContent = menuGold;
      saveProgress();
    }

    // Обновляет временные монеты текущего боя.
    function updateBattleGold() {
      document.getElementById('coin-count').textContent = battleGold;
    }

    // Обновляет надпись "Волна X/5".
    function updateWaveLabel() {
      document.getElementById('wave-label').textContent = `${t('level')} ${currentLevel} | ${t('wave')} ${wave}/5`;
      saveProgress();
    }

    function getWaveConfig(waveNumber = wave) {
      const base = WAVE_CONFIGS[Math.min(waveNumber - 1, WAVE_CONFIGS.length - 1)];
      const level = LEVEL_DIFFICULTY[Math.min(currentLevel - 1, LEVEL_DIFFICULTY.length - 1)] || LEVEL_DIFFICULTY[0];
      const config = {
        ...base,
        hpMult: base.hpMult * level.hp,
        speedMult: base.speedMult * level.speed,
        dmgMult: base.dmgMult * level.dmg,
        spawnDelay: Math.max(500, Math.round(base.spawnDelay * level.spawn))
      };
      if (base.boss) {
        config.boss = {
          ...base.boss,
          hp: Math.ceil(base.boss.hp * level.hp),
          speed: Math.round(base.boss.speed * level.speed)
        };
      }
      return config;
    }

    function positionEnemy(enemy) {
      enemy.el.style.transform = `translate3d(${enemy.x}px, ${enemy.y}px, 0) translate(-50%, -50%)`;
    }

    function getSlotCenter(slotIndex) {
      const slot = document.getElementById('slot-' + slotIndex);
      return {
        x: slot.offsetLeft + slot.offsetWidth / 2,
        y: slot.offsetTop + slot.offsetHeight / 2
      };
    }

    function distanceToCastle(enemy) {
      return Math.hypot(enemy.x - 480, enemy.y - 270);
    }

    function showSlash(x, y) {
      if (mobilePerformanceMode) return;
      const effect = document.createElement('div');
      effect.className = 'attack-effect';
      effect.style.left = x + 'px';
      effect.style.top = y + 'px';
      document.getElementById('battle-field').appendChild(effect);
      setTimeout(() => effect.remove(), 360);
    }

    function showHit(x, y) {
      if (mobilePerformanceMode) return;
      const effect = document.createElement('div');
      effect.className = 'hit-flash';
      effect.style.left = x + 'px';
      effect.style.top = y + 'px';
      document.getElementById('battle-field').appendChild(effect);
      setTimeout(() => effect.remove(), 300);
    }

    function showMagicSplash(x, y) {
      if (mobilePerformanceMode) return;
      const effect = document.createElement('div');
      effect.className = 'magic-splash';
      effect.style.left = x + 'px';
      effect.style.top = y + 'px';
      document.getElementById('battle-field').appendChild(effect);
      setTimeout(() => effect.remove(), 360);
    }

    document.getElementById('battle-field').addEventListener('click', event => {
      if (!event.target.classList.contains('slot')) selectedDeckCard = null;
      renderDeck();
    });

    window.addEventListener('resize', () => {
      updateMenuOrientation();
      updateGameScale();
    });
    window.visualViewport?.addEventListener('resize', updateGameScale);
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        updateMenuOrientation();
        updateGameScale();
      }, 350);
    });
    window.Telegram?.WebApp?.ready?.();
    window.Telegram?.WebApp?.expand?.();
    applyLanguage();
    updateMenuOrientation();
    loadProgress();
    requestAnimationFrame(gameLoop);
  

