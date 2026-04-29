/**
 * Centralized exports for all integrations
 * 
 * This module provides a unified interface to all external service integrations
 * used by the ERP system and LEO agent.
 */

// Brazilian APIs
export * from './brasilapi.service.js';
export * from './viacep.service.js';

// Communication Services
export * from './telegram.service.js';
export * from './whatsapp.service.js';

// Logistics & Shipping
export * from './freight.service.js';
export * from './superfrete.service.js';
export * from './tracking.service.js';

// Utilities
export * from './currency.service.js';
export * from './weather.service.js';
export * from './maps.service.js';
export * from './qr.service.js';
export * from './ocr.service.js';
export * from './chart.service.js';

// Integration Registry - provides metadata about available integrations
export const INTEGRATION_REGISTRY = {
  // Brazilian Services
  brasilapi: {
    name: 'BrasilAPI',
    description: 'Brazilian API for CNPJ, DDD, and holidays',
    baseUrl: 'https://brasilapi.com.br/api',
    features: ['cnpj_validation', 'ddd_info', 'national_holidays'],
    rateLimit: 'unlimited',
    authentication: 'none'
  },
  
  viacep: {
    name: 'ViaCEP',
    description: 'Brazilian ZIP code lookup service',
    baseUrl: 'https://viacep.com.br/ws',
    features: ['zipcode_lookup', 'address_info'],
    rateLimit: 'unlimited',
    authentication: 'none'
  },

  // Communication
  telegram: {
    name: 'Telegram Bot',
    description: 'Telegram bot integration for notifications',
    baseUrl: 'https://api.telegram.org',
    features: ['send_messages', 'send_files', 'bot_commands'],
    rateLimit: '30 requests/second',
    authentication: 'bot_token'
  },

  whatsapp: {
    name: 'WhatsApp Business',
    description: 'WhatsApp Business API for customer communication',
    baseUrl: 'https://graph.facebook.com',
    features: ['send_messages', 'send_media', 'customer_support'],
    rateLimit: '80 messages/second',
    authentication: 'oauth_token'
  },

  // Logistics
  freight: {
    name: 'Freight Calculator',
    description: 'Generic freight calculation service',
    baseUrl: 'various',
    features: ['calculate_freight', 'shipping_options', 'delivery_time'],
    rateLimit: 'varies',
    authentication: 'api_key'
  },

  superfrete: {
    name: 'SuperFreight',
    description: 'Brazilian freight calculation platform',
    baseUrl: 'https://api.superfrete.com',
    features: ['calculate_freight', 'track_shipments', 'shipping_labels'],
    rateLimit: '100 requests/minute',
    authentication: 'api_key'
  },

  tracking: {
    name: 'Package Tracking',
    description: 'Universal package tracking service',
    baseUrl: 'various',
    features: ['track_packages', 'delivery_status', 'notifications'],
    rateLimit: 'varies',
    authentication: 'api_key'
  },

  // Utilities
  currency: {
    name: 'Currency Exchange',
    description: 'Real-time currency exchange rates',
    baseUrl: 'various',
    features: ['exchange_rates', 'currency_conversion', 'historical_data'],
    rateLimit: 'varies',
    authentication: 'api_key'
  },

  weather: {
    name: 'Weather Service',
    description: 'Weather information and forecasts',
    baseUrl: 'various',
    features: ['current_weather', 'forecast', 'weather_alerts'],
    rateLimit: '1000 requests/day',
    authentication: 'api_key'
  },

  maps: {
    name: 'Maps Service',
    description: 'Maps and geolocation services',
    baseUrl: 'various',
    features: ['geocoding', 'routing', 'distance_calculation'],
    rateLimit: 'varies',
    authentication: 'api_key'
  },

  qr: {
    name: 'QR Code Generator',
    description: 'QR code generation service',
    baseUrl: 'internal',
    features: ['generate_qr', 'custom_designs', 'batch_generation'],
    rateLimit: 'unlimited',
    authentication: 'none'
  },

  ocr: {
    name: 'OCR Service',
    description: 'Optical Character Recognition for document processing',
    baseUrl: 'internal',
    features: ['text_extraction', 'document_analysis', 'image_processing'],
    rateLimit: 'depends_on_provider',
    authentication: 'api_key'
  },

  chart: {
    name: 'Chart Generator',
    description: 'Chart and graph generation service',
    baseUrl: 'internal',
    features: ['generate_charts', 'data_visualization', 'export_options'],
    rateLimit: 'unlimited',
    authentication: 'none'
  }
} as const;

export type IntegrationName = keyof typeof INTEGRATION_REGISTRY;

/**
 * Get integration metadata by name
 */
export function getIntegrationInfo(name: IntegrationName) {
  return INTEGRATION_REGISTRY[name];
}

/**
 * List all available integrations
 */
export function listIntegrations() {
  return Object.keys(INTEGRATION_REGISTRY) as IntegrationName[];
}

/**
 * Get integrations by category
 */
export function getIntegrationsByCategory(category: 'brazilian' | 'communication' | 'logistics' | 'utilities') {
  const categories: Record<string, IntegrationName[]> = {
    brazilian: ['brasilapi', 'viacep'],
    communication: ['telegram', 'whatsapp'],
    logistics: ['freight', 'superfrete', 'tracking'],
    utilities: ['currency', 'weather', 'maps', 'qr', 'ocr', 'chart']
  };

  return categories[category].map((name) => {
    const integration = INTEGRATION_REGISTRY[name];
    return integration;
  });
}

/**
 * Check if integration requires authentication
 */
export function requiresAuthentication(name: IntegrationName): boolean {
  const integration = INTEGRATION_REGISTRY[name];
  return integration.authentication !== 'none';
}

/**
 * Get integrations that require API keys
 */
export function getApiKeyIntegrations(): IntegrationName[] {
  return Object.entries(INTEGRATION_REGISTRY)
    .filter(([_, info]) => info.authentication === 'api_key')
    .map(([name]) => name as IntegrationName);
}
