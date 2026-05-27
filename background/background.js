chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== 'focustab-tick') return;

  chrome.storage.local.get(['timerRemaining', 'timerRunning', 'timerMode'], (result) => {
    if (!result.timerRunning) return;

    const remaining = (result.timerRemaining || 0) - 1;

    if (remaining <= 0) {
      // Timer finished
      chrome.storage.local.set({ timerRemaining: 0, timerRunning: false });
      chrome.alarms.clear('focustab-tick');

      // Fire notification
      const isBreak = result.timerMode !== 'focus';
      chrome.notifications.create(`focustab-done-${Date.now()}`, {
        type:    'basic',
        iconUrl: 'icons/icon48.png',
        title:   isBreak ? '☀ Break over!' : '🍅 Focus session complete!',
        message: isBreak
          ? 'Time to get back to work. Start a new focus session!'
          : 'Great work! Take a short or long break.',
      });

      // Increment session count if it was a focus session
      if (!isBreak) {
        chrome.storage.local.get('sessionsToday', (r) => {
          const today  = new Date().toDateString();
          const stored = r.sessionsToday || { date: today, count: 0 };
          const count  = stored.date === today ? stored.count + 1 : 1;
          chrome.storage.local.set({ sessionsToday: { date: today, count } });
        });
      }

    } else {
      // Still ticking
      chrome.storage.local.set({ timerRemaining: remaining });
    }
  });
});
