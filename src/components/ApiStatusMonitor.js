import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export default function ApiStatusMonitor({ onStatusChange }) {
  const [isOnline, setIsOnline] = useState(true); // Default true until proven otherwise

  useEffect(() => {
    const checkStatus = async () => {
      try {
        await axios.get(`${API_URL}/health`, { timeout: 2000 });
        if (!isOnline) {
          setIsOnline(true);
          onStatusChange(true);
        }
      } catch (error) {
        if (isOnline) {
          setIsOnline(false);
          onStatusChange(false);
        }
      }
    };

    // Initial check
    checkStatus();

    // Poll every 5 seconds
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, [isOnline, onStatusChange]);

  return (
    <div className="fixed top-4 right-4 z-[9999] flex items-center gap-2 bg-[#10131a]/80 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/5 shadow-lg">
      <div className={`w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)] ${isOnline ? 'bg-green-500 shadow-green-500/50' : 'bg-red-500 shadow-red-500/50 animate-pulse'}`}></div>
      <span className={`text-[10px] font-mono font-bold tracking-widest ${isOnline ? 'text-green-500' : 'text-red-500'}`}>
        {isOnline ? 'ONLINE' : 'SERVER OFFLINE'}
      </span>
    </div>
  );
}
