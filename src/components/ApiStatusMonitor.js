import React, { useState, useEffect } from 'react';
import apiClient from '../lib/axios';

export default function ApiStatusMonitor({ onStatusChange }) {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        await apiClient.get('/health');
        if (!isOnline) {
          setIsOnline(true);
          if (onStatusChange) onStatusChange(true);
        }
      } catch (error) {
        if (isOnline) {
          setIsOnline(false);
          if (onStatusChange) onStatusChange(false);
        }
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, [isOnline, onStatusChange]);

  if (isOnline) return null; // Hide floating badge when server is online to keep UI clean

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex items-center gap-2 bg-red-500/20 backdrop-blur-md px-3 py-1.5 rounded-full border border-red-500/40 shadow-xl font-mono">
      <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-ping" />
      <span className="text-[10px] font-bold tracking-wider text-red-400">
        SERVER CONNECTION LOST — RECONNECTING...
      </span>
    </div>
  );
}
