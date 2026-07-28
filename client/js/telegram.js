telegram_js = '''const tg = window.Telegram.WebApp;

function initTelegram() {
  tg.ready();
  tg.expand();
  tg.setHeaderColor(tg.themeParams.bg_color || '#1a1a2e');
  tg.setBackgroundColor(tg.themeParams.bg_color || '#1a1a2e');
}

function getUserData() {
  return tg.initDataUnsafe?.user || {};
}

function showAlert(message) {
  tg.showAlert(message);
}

function showPopup(title, message) {
  tg.showPopup({ title, message });
}

function hapticFeedback(type = 'light') {
  if (tg.HapticFeedback) {
    tg.HapticFeedback.impactOccurred(type);
  }
}

document.addEventListener('DOMContentLoaded', initTelegram);'''

with open(f"{base_dir}/client/js/telegram.js", "w") as f:
    f.write(telegram_js)
