import React, { useEffect, useState } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setJustReconnected(true);
      const timer = setTimeout(() => setJustReconnected(false), 3000);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setJustReconnected(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline && !justReconnected) return null;

  if (justReconnected) {
    return (
      <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-emerald-700/90 text-white px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur-sm border border-emerald-500/50 animate-fadeIn">
        <Wifi className="w-3.5 h-3.5 text-emerald-200" />
        <span>Back Online — Reconnected to network</span>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-amber-600/95 text-white px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur-sm border border-amber-400/50 animate-pulse">
      <WifiOff className="w-3.5 h-3.5 text-amber-200" />
      <span>Offline Mode — Cached local tools and ARM simulator active</span>
    </div>
  );
};
