/**
 * Enhanced logging utility for production monitoring and debugging
 * VERSION: 1.0 - Production ready
 */

class Logger {
  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development';
    this.sessionId = this.generateSessionId();
    this.logs = [];
    this.maxLogSize = 1000; // Keep last 1000 logs in memory
    
    // Performance monitoring
    this.performanceMarks = new Map();
    this.performanceMetrics = {
      apiCalls: 0,
      cacheHits: 0,
      errors: 0,
      warnings: 0
    };
    
    console.log(`🔍 Logger initialized - Session: ${this.sessionId}`);
  }

  generateSessionId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // Core logging methods
  log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      data,
      sessionId: this.sessionId,
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    // Add to memory store
    this.logs.push(logEntry);
    if (this.logs.length > this.maxLogSize) {
      this.logs.shift();
    }

    // Update metrics
    if (level === 'error') this.performanceMetrics.errors++;
    if (level === 'warn') this.performanceMetrics.warnings++;

    // Console output with styling
    if (this.isDevelopment) {
      this.consoleLog(level, message, data);
    }

    // Send to monitoring service in production
    if (!this.isDevelopment && (level === 'error' || level === 'warn')) {
      this.sendToMonitoring(logEntry);
    }
  }

  consoleLog(level, message, data) {
    const styles = {
      info: 'color: #3498db; font-weight: bold;',
      warn: 'color: #f39c12; font-weight: bold;',
      error: 'color: #e74c3c; font-weight: bold;',
      debug: 'color: #9b59b6; font-weight: bold;',
      performance: 'color: #2ecc71; font-weight: bold;'
    };

    const style = styles[level] || styles.info;
    const prefix = `[${level.toUpperCase()}]`;
    
    if (Object.keys(data).length > 0) {
      console.log(`%c${prefix} ${message}`, style, data);
    } else {
      console.log(`%c${prefix} ${message}`, style);
    }
  }

  // Convenience methods
  info(message, data = {}) {
    this.log('info', message, data);
  }

  warn(message, data = {}) {
    this.log('warn', message, data);
  }

  error(message, data = {}) {
    this.log('error', message, data);
  }

  debug(message, data = {}) {
    if (this.isDevelopment) {
      this.log('debug', message, data);
    }
  }

  // Performance monitoring
  startPerformanceTimer(name) {
    const mark = `${name}-start`;
    performance.mark(mark);
    this.performanceMarks.set(name, { startMark: mark, startTime: performance.now() });
  }

  endPerformanceTimer(name) {
    const timerData = this.performanceMarks.get(name);
    if (!timerData) {
      this.warn(`Performance timer '${name}' not found`);
      return;
    }

    const endTime = performance.now();
    const duration = endTime - timerData.startTime;
    
    // Clean up
    this.performanceMarks.delete(name);
    
    // Log performance
    this.log('performance', `${name} completed`, {
      duration: `${duration.toFixed(2)}ms`,
      startTime: timerData.startTime,
      endTime
    });

    return duration;
  }

  // API call tracking
  logApiCall(service, method, duration, success = true) {
    this.performanceMetrics.apiCalls++;
    
    this.log('info', `API Call: ${service}.${method}`, {
      service,
      method,
      duration: `${duration.toFixed(2)}ms`,
      success,
      timestamp: new Date().toISOString()
    });
  }

  // Cache tracking
  logCacheHit(service, key) {
    this.performanceMetrics.cacheHits++;
    
    this.debug(`Cache hit: ${service}`, { key });
  }

  // Error tracking with context
  logError(error, context = {}) {
    const errorData = {
      message: error.message,
      stack: error.stack,
      name: error.name,
      context,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    this.error('Application Error', errorData);
    
    // Send to error tracking service
    this.sendErrorToTracking(errorData);
  }

  // User action tracking
  logUserAction(action, details = {}) {
    this.info(`User Action: ${action}`, {
      action,
      details,
      timestamp: new Date().toISOString()
    });
  }

  // Service status tracking
  logServiceStatus(serviceName, status, details = {}) {
    this.info(`Service Status: ${serviceName}`, {
      service: serviceName,
      status,
      details,
      timestamp: new Date().toISOString()
    });
  }

  // Get performance summary
  getPerformanceSummary() {
    return {
      ...this.performanceMetrics,
      sessionId: this.sessionId,
      sessionDuration: Date.now() - parseInt(this.sessionId, 36),
      totalLogs: this.logs.length,
      cacheHitRate: this.performanceMetrics.cacheHits / Math.max(1, this.performanceMetrics.apiCalls)
    };
  }

  // Export logs for debugging
  exportLogs() {
    const exportData = {
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      logs: this.logs,
      metrics: this.performanceMetrics,
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `solace-logs-${this.sessionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Send to monitoring service (placeholder)
  sendToMonitoring(logEntry) {
    // In production, send to monitoring service like DataDog, New Relic, etc.
    // fetch('/api/monitoring/logs', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(logEntry)
    // });
  }

  // Send to error tracking service (placeholder)
  sendErrorToTracking(errorData) {
    // In production, send to error tracking service like Sentry, Bugsnag, etc.
    // if (window.Sentry) {
    //   window.Sentry.captureException(new Error(errorData.message), {
    //     extra: errorData
    //   });
    // }
  }

  // Clear logs (for memory management)
  clearLogs() {
    this.logs = [];
    this.performanceMetrics = {
      apiCalls: 0,
      cacheHits: 0,
      errors: 0,
      warnings: 0
    };
    this.info('Logs cleared');
  }
}

// Create singleton instance
const logger = new Logger();

export default logger; 