/**
 * Service Status component showing health of all services
 */

import React from 'react';

const ServiceStatus = ({ services, isMinimized, onToggle }) => {
  const getStatusIcon = (isConfigured, isWorking) => {
    if (!isConfigured) return '⚠️';
    if (isWorking === null) return '⏳';
    return isWorking ? '✅' : '❌';
  };

  const getStatusText = (isConfigured, isWorking) => {
    if (!isConfigured) return 'Not configured';
    if (isWorking === null) return 'Checking...';
    return isWorking ? 'Ready' : 'Error';
  };

  const getStatusClass = (isConfigured, isWorking) => {
    if (!isConfigured) return 'status-warning';
    if (isWorking === null) return 'status-pending';
    return isWorking ? 'status-ready' : 'status-error';
  };

  if (isMinimized) {
    return (
      <div className="service-status-minimized" onClick={onToggle}>
        <span className="status-indicator">
          {services.every(s => s.isConfigured && s.isWorking) ? '✅' : '⚠️'}
        </span>
        <span>Services</span>
      </div>
    );
  }

  return (
    <div className="service-status-panel">
      <div className="status-header">
        <h4>Service Status</h4>
        <button className="minimize-btn" onClick={onToggle}>−</button>
      </div>
      
      <div className="status-list">
        {services.map((service, index) => (
          <div key={index} className={`status-item ${getStatusClass(service.isConfigured, service.isWorking)}`}>
            <span className="status-icon">
              {getStatusIcon(service.isConfigured, service.isWorking)}
            </span>
            <div className="status-info">
              <div className="service-name">{service.name}</div>
              <div className="service-status">{getStatusText(service.isConfigured, service.isWorking)}</div>
            </div>
          </div>
        ))}
      </div>
      
      <div className="status-legend">
        <small>
          ✅ Ready • ⚠️ Not configured • ❌ Error • ⏳ Checking
        </small>
      </div>
    </div>
  );
};

export default ServiceStatus; 