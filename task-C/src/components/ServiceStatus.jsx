/**
 * Service Status component showing health of all services
 */

import React from 'react';

const ServiceStatus = ({ services, isMinimized, onToggle }) => {
  const getStatusClass = (isConfigured, isWorking) => {
    if (!isConfigured) return 'warning';
    if (isWorking === null) return 'warning';
    return isWorking ? '' : 'error';
  };

  const getStatusText = (isConfigured, isWorking) => {
    if (!isConfigured) return 'Not configured';
    if (isWorking === null) return 'Checking...';
    return isWorking ? 'Ready' : 'Error';
  };

  return (
    <div className={`service-status ${isMinimized ? 'minimized' : ''}`}>
      <button className="service-toggle" onClick={onToggle}>
        {isMinimized ? 'S' : 'Service Status'}
      </button>
      
      {!isMinimized && (
        <div className="service-list">
          {services.map((service, index) => (
            <div key={index} className="service-item">
              <span className="service-name">{service.name}</span>
              <div className={`service-status-indicator ${getStatusClass(service.isConfigured, service.isWorking)}`}></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ServiceStatus; 