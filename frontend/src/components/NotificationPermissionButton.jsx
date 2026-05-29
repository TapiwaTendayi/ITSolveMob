// components/NotificationPermissionButton.jsx
// Clickable toggle — user can enable OR disable desktop notifications at will.
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

export default function NotificationPermissionButton() {
  const [permission, setPermission] = useState(
    'Notification' in window ? Notification.permission : 'unsupported'
  );
  // Track user's own preference (even when browser grants, they may want to mute)
  const [userEnabled, setUserEnabled] = useState(() => {
    return localStorage.getItem('notif-user-pref') !== 'disabled';
  });
  const [isRequesting, setIsRequesting] = useState(false);

  useEffect(() => {
    if ('Notification' in window) setPermission(Notification.permission);
  }, []);

  if (!('Notification' in window)) {
    return (
      <div className="flex items-center gap-2 bg-gray-100 border border-gray-200 text-gray-500 px-3 py-2 rounded text-sm">
        <span>🔕</span>
        <span>Desktop notifications not supported in this browser</span>
      </div>
    );
  }

  // Browser has blocked notifications — show instructions, no toggle
  if (permission === 'denied') {
    return (
      <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 px-3 py-2 rounded text-sm">
        <p className="font-medium">🔕 Notifications are blocked by your browser</p>
        <p className="text-xs mt-1 text-yellow-700">
          To enable them, click the 🔒 lock icon in your browser's address bar → Site settings → Notifications → Allow.
        </p>
      </div>
    );
  }

  const handleToggle = async () => {
    if (permission === 'granted' && userEnabled) {
      // User wants to disable — store preference
      localStorage.setItem('notif-user-pref', 'disabled');
      setUserEnabled(false);
      toast('🔕 Desktop notifications turned off', { icon: '🔕' });
      return;
    }

    if (permission === 'granted' && !userEnabled) {
      // User wants to re-enable
      localStorage.setItem('notif-user-pref', 'enabled');
      setUserEnabled(true);
      toast.success('🔔 Desktop notifications turned on!');
      new Notification('Notifications Enabled', {
        body: 'You will now receive alerts for new requests and updates.',
        icon: '/icon-192.png'
      });
      return;
    }

    // permission === 'default' — need to ask the browser
    setIsRequesting(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm === 'granted') {
        localStorage.setItem('notif-user-pref', 'enabled');
        setUserEnabled(true);
        toast.success('🔔 Notifications enabled!');
        new Notification('Notifications Enabled', {
          body: 'You will now receive alerts for new requests and updates.',
          icon: '/icon-192.png'
        });
      } else if (perm === 'denied') {
        toast.error('Notifications were blocked. You can unblock them in your browser settings.');
      } else {
        toast('Notification request dismissed. You can try again any time.', { icon: '🔔' });
      }
    } catch (err) {
      toast.error('Could not request notification permission. Please try again.');
    } finally {
      setIsRequesting(false);
    }
  };

  const isOn = permission === 'granted' && userEnabled;

  return (
    <button
      onClick={handleToggle}
      disabled={isRequesting}
      title={isOn ? 'Click to disable desktop notifications' : 'Click to enable desktop notifications'}
      className={`flex items-center gap-2 px-3 py-2 rounded border text-sm font-medium transition-all ${
        isRequesting
          ? 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed'
          : isOn
          ? 'bg-green-50 border-green-300 text-green-800 hover:bg-green-100'
          : 'bg-gray-50 border-gray-300 text-gray-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700'
      }`}
    >
      {isRequesting ? (
        <>
          <span className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-transparent"></span>
          <span>Requesting...</span>
        </>
      ) : isOn ? (
        <>
          <span>🔔</span>
          <span>Notifications On</span>
          <span className="ml-1 w-2 h-2 rounded-full bg-green-500 inline-block"></span>
        </>
      ) : (
        <>
          <span>🔕</span>
          <span>Notifications Off</span>
          <span className="ml-1 w-2 h-2 rounded-full bg-gray-400 inline-block"></span>
        </>
      )}
    </button>
  );
}
