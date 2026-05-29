// src/context/NotificationContext.jsx
// src/context/NotificationContext.jsx
import React, { createContext, useState, useEffect, useCallback, useRef } from 'react';
import notificationSound from '../utils/sound';

export const NotificationContext = createContext();

// Show a native browser notification — only when browser has granted AND user has not disabled
const showBrowserNotification = (title, options = {}) => {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  // Respect the user-level toggle stored by NotificationPermissionButton
  if (localStorage.getItem('notif-user-pref') === 'disabled') return;

  try {
    new Notification(title, { silent: false, ...options });
  } catch (error) {
    console.warn('Failed to show browser notification:', error);
  }
};

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Keep a ref to soundEnabled so the addNotification callback never goes stale
  const soundEnabledRef = useRef(soundEnabled);
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  // Read the current user preference live (localStorage is synchronous — safe here)
  const isNotificationsEnabled = () =>
    localStorage.getItem('notif-user-pref') !== 'disabled';

  // Main function to add notifications
  const addNotification = useCallback((message, type = 'info') => {
    // ── Respect the user's notification toggle ──────────────────────────────
    // If the user has disabled notifications via the bell button, silently drop
    // in-app toasts and native browser notifications.  Sound follows soundEnabled.
    if (!isNotificationsEnabled()) {
      console.log('🔕 Notification suppressed (user preference: disabled)');
      return;
    }

    const newNotification = {
      id: crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      message,
      type,
      createdAt: new Date().toLocaleTimeString()
    };

    setNotifications(prev => [...prev, newNotification]);

    // Play sound only if both master sound toggle AND user preference are on
    if (soundEnabledRef.current) {
      notificationSound.play(type);
    }

    // Auto-remove after 1 minute
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== newNotification.id));
    }, 60000);

    // Native browser notification (also gated inside showBrowserNotification)
    if (Notification.permission === 'granted') {
      let title = 'ITSolve';
      if (type === 'new-request')       title = '📢 New Request';
      else if (type === 'assigned-request') title = '🎯 Task Assigned';
      else if (type === 'task-picked')  title = '🔧 Technician On The Way';

      showBrowserNotification(title, {
        body: message,
        tag: newNotification.id,
      });
    }
  }, []); // no deps — reads prefs live via localStorage + ref

  // Remove a single notification manually
  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Toggle the in-app sound (🔊/🔇 button in Notifications.jsx)
  const toggleSound = useCallback(() => {
    const newState = notificationSound.toggle();
    setSoundEnabled(newState);
    return newState;
  }, []);

  // Clear all notifications
  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  // Keep the notificationSound helper in sync
  useEffect(() => {
    notificationSound.setEnabled(soundEnabled);
  }, [soundEnabled]);

  return (
    <NotificationContext.Provider value={{
      notifications,
      addNotification,
      removeNotification,
      clearAllNotifications,
      soundEnabled,
      toggleSound
    }}>
      {children}
    </NotificationContext.Provider>
  );
};
