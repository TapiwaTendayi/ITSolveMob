import { useContext, useState, useEffect } from 'react';
import { NotificationContext } from '../context/NotificationContext';

export default function Notification() {
  const { notifications, removeNotification, soundEnabled, toggleSound } = useContext(NotificationContext);
  const [showToggle, setShowToggle] = useState(false);

  // Function to get color based on notification type
  const getBgColor = (type) => {
    switch(type) {
      case 'success': return 'bg-green-500';
      case 'error': return 'bg-red-500';
      case 'info': return 'bg-blue-500';
      case 'warning': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  // Function to get icon based on type
  const getIcon = (type) => {
    switch(type) {
      case 'success': return '✓';
      case 'error': return '✗';
      case 'warning': return '⚠';
      case 'info': return 'ℹ';
      default: return '•';
    }
  };

  if (notifications.length === 0 && !showToggle) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {/* Sound Toggle Button */}
      <button
        onClick={() => toggleSound()}
        className="absolute -left-12 bg-gray-800 text-white p-2 rounded-lg hover:bg-gray-700 transition-colors"
        title={soundEnabled ? 'Mute sounds' : 'Unmute sounds'}
      >
        {soundEnabled ? '🔊' : '🔇'}
      </button>

      {notifications.map(notification => (
        <div
          key={notification.id}
          className={`${getBgColor(notification.type)} text-white p-4 rounded-lg shadow-lg max-w-sm transform transition-all duration-300 hover:scale-105 animate-slideIn`}
        >
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold">{getIcon(notification.type)}</span>
                <p className="font-medium">{notification.message}</p>
              </div>
              <p className="text-xs opacity-75 mt-1 flex items-center gap-2">
                <span>{notification.createdAt}</span>
                {notification.type === 'info' && soundEnabled && (
                  <span className="inline-block w-2 h-2 bg-white rounded-full animate-pulse" />
                )}
              </p>
            </div>
            <button
              onClick={() => removeNotification(notification.id)}
              className="ml-4 text-white hover:text-gray-200 text-xl"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}