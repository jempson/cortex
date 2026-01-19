// Low-Bandwidth Mode: Network Detection Hook (v2.10.0)
// Uses Network Information API with fallback latency measurement

import { useState, useEffect, useCallback, useRef } from 'react';

// Thresholds for determining slow connection
const SLOW_EFFECTIVE_TYPES = ['slow-2g', '2g'];
const SLOW_DOWNLINK_THRESHOLD = 1.5; // Mbps
const SLOW_RTT_THRESHOLD = 500; // ms
const LATENCY_MEASUREMENT_INTERVAL = 60000; // Re-measure every 60 seconds

export function useNetworkStatus() {
  const [status, setStatus] = useState(() => getInitialStatus());
  const latencyMeasurementRef = useRef(null);
  const lastMeasuredLatencyRef = useRef(null);

  // Get initial status from Network Information API if available
  function getInitialStatus() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

    if (connection) {
      return {
        effectiveType: connection.effectiveType || '4g',
        downlink: connection.downlink || 10,
        rtt: connection.rtt || 50,
        saveData: connection.saveData || false,
        isSlowConnection: isSlowFromConnection(connection),
        source: 'network-info-api',
      };
    }

    // No Network Information API - use defaults until we measure
    return {
      effectiveType: 'unknown',
      downlink: null,
      rtt: null,
      saveData: false,
      isSlowConnection: false, // Assume fast until proven otherwise
      source: 'default',
    };
  }

  // Determine if connection is slow based on Network Information API
  function isSlowFromConnection(connection) {
    if (!connection) return false;

    // Check save data preference
    if (connection.saveData) return true;

    // Check effective type
    if (SLOW_EFFECTIVE_TYPES.includes(connection.effectiveType)) return true;

    // Check downlink speed
    if (connection.downlink && connection.downlink < SLOW_DOWNLINK_THRESHOLD) return true;

    // Check round-trip time
    if (connection.rtt && connection.rtt > SLOW_RTT_THRESHOLD) return true;

    return false;
  }

  // Measure actual latency by timing a small request
  const measureLatency = useCallback(async () => {
    try {
      const start = performance.now();
      // Use a tiny endpoint - HEAD request to avoid body parsing
      const response = await fetch('/api/health', {
        method: 'HEAD',
        cache: 'no-store',
      });
      const end = performance.now();
      const measuredRtt = Math.round(end - start);

      lastMeasuredLatencyRef.current = measuredRtt;

      // Update status with measured latency
      setStatus(prev => {
        const isSlowByLatency = measuredRtt > SLOW_RTT_THRESHOLD;
        const isSlowConnection = prev.isSlowConnection || isSlowByLatency;

        return {
          ...prev,
          measuredRtt,
          isSlowConnection,
          source: prev.source === 'default' ? 'latency-measurement' : prev.source,
        };
      });

      return measuredRtt;
    } catch (error) {
      console.warn('[useNetworkStatus] Failed to measure latency:', error.message);
      return null;
    }
  }, []);

  // Handle Network Information API changes
  useEffect(() => {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

    if (connection) {
      const handleChange = () => {
        setStatus({
          effectiveType: connection.effectiveType || '4g',
          downlink: connection.downlink || 10,
          rtt: connection.rtt || 50,
          saveData: connection.saveData || false,
          isSlowConnection: isSlowFromConnection(connection),
          source: 'network-info-api',
        });
      };

      connection.addEventListener('change', handleChange);
      return () => connection.removeEventListener('change', handleChange);
    }
  }, []);

  // For browsers without Network Information API, measure latency periodically
  useEffect(() => {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

    // Only measure if we don't have Network Information API
    if (!connection) {
      // Measure on mount (with delay to not block initial load)
      const initialTimeout = setTimeout(measureLatency, 3000);

      // Re-measure periodically
      latencyMeasurementRef.current = setInterval(measureLatency, LATENCY_MEASUREMENT_INTERVAL);

      return () => {
        clearTimeout(initialTimeout);
        if (latencyMeasurementRef.current) {
          clearInterval(latencyMeasurementRef.current);
        }
      };
    }
  }, [measureLatency]);

  // Handle online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setStatus(prev => ({ ...prev, isOffline: false }));
      // Re-measure latency when coming back online
      measureLatency();
    };

    const handleOffline = () => {
      setStatus(prev => ({ ...prev, isOffline: true, isSlowConnection: true }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [measureLatency]);

  return {
    ...status,
    isOnline: navigator.onLine,
    measureLatency, // Expose for manual measurement
  };
}

// Hook for components that just need the slow connection boolean
export function useIsSlowConnection() {
  const { isSlowConnection } = useNetworkStatus();
  return isSlowConnection;
}

export default useNetworkStatus;
