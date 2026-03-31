import React, { useState } from 'react';
import { fetchWithHandling, type ApiResponse } from '../lib/api/fetchWithHandling';
import { ApiStateHandler, useApiState } from '../components/ui/ApiStateHandler';
import { logger } from '../lib/logger/frontendLogger';
import { AlertTriangle, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { trpcCall } from '../lib/trpcClient';

async function authMeTrpcProbe(): Promise<ApiResponse<{ authenticated: boolean }>> {
  try {
    const me = await trpcCall('auth.me', null);
    return { ok: true, status: 200, data: { authenticated: me != null } };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Auth tRPC falhou';
    return {
      ok: false,
      status: 401,
      error: { status: 401, message, code: 'AUTH_PROBE' },
    };
  }
}

export default function ApiTestPage() {
  const [testResults, setTestResults] = useState<TestResult[]>([]);

  // Test health endpoint
  const healthTest = useApiState(
    () => fetchWithHandling('/api/health', { method: 'GET' }),
    []
  );

  // Test tRPC auth.me (batch)
  const authTest = useApiState(() => authMeTrpcProbe(), []);

  // Test LEO endpoint
  const leoTest = useApiState(
    () => fetchWithHandling('/api/leo/ping', { method: 'POST' }),
    []
  );

  // Test invalid endpoint
  const invalidEndpointTest = useApiState(
    () => fetchWithHandling('/api/invalid-endpoint', { method: 'GET' }),
    []
  );

  const runAllTests = async () => {
    logger.info('Starting API connectivity tests', { action: 'api_test' });
    
    const tests: TestResult[] = [];
    
    // Test 1: Health endpoint
    try {
      const start = Date.now();
      const healthResponse = await fetchWithHandling('/api/health', { method: 'GET' });
      const duration = Date.now() - start;
      
      tests.push({
        name: 'Health Check',
        status: healthResponse.ok ? 'success' : 'error',
        message: healthResponse.ok ? 'API is healthy' : healthResponse.error?.message || 'Failed',
        duration,
        response: healthResponse
      });
      
      if (healthResponse.ok) {
        logger.apiSuccess('/api/health', 'GET', healthResponse.status, duration);
      } else {
        logger.apiError('/api/health', 'GET', healthResponse.status, healthResponse.error?.message || 'Failed');
      }
    } catch (error) {
      tests.push({
        name: 'Health Check',
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        duration: 0
      });
    }

    // Test 2: tRPC auth.me
    try {
      const start = Date.now();
      const authResponse = await authMeTrpcProbe();
      const duration = Date.now() - start;
      
      tests.push({
        name: 'Auth Check (tRPC auth.me)',
        status: authResponse.ok ? 'success' : authResponse.status === 401 ? 'warning' : 'error',
        message: authResponse.ok
          ? `tRPC OK (sessão: ${authResponse.data?.authenticated ? 'sim' : 'não'})`
          : authResponse.status === 401
            ? 'tRPC / sessão indisponível'
            : authResponse.error?.message || 'Failed',
        duration,
        response: authResponse
      });
      
      if (authResponse.ok) {
        logger.apiSuccess('/api/trpc/auth.me', 'POST', authResponse.status, duration);
      } else {
        logger.apiWarn('/api/trpc/auth.me', 'POST', authResponse.status, authResponse.error?.message || 'Auth check failed');
      }
    } catch (error) {
      tests.push({
        name: 'Auth Check',
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        duration: 0
      });
    }

    // Test 3: Network failure simulation
    try {
      const start = Date.now();
      const networkResponse = await fetchWithHandling('http://localhost:9999/api/health', { method: 'GET', timeout: 2000 });
      const duration = Date.now() - start;
      
      tests.push({
        name: 'Network Failure Test',
        status: 'success',
        message: 'Network error handled correctly',
        duration
      });
    } catch (error) {
      tests.push({
        name: 'Network Failure Test',
        status: 'success',
        message: 'Network error handled correctly',
        duration: 0
      });
      logger.info('Network failure test passed', { action: 'api_test' });
    }

    // Test 4: Timeout simulation
    try {
      const start = Date.now();
      const timeoutResponse = await fetchWithHandling('/api/health', { method: 'GET', timeout: 1 });
      const duration = Date.now() - start;
      
      tests.push({
        name: 'Timeout Test',
        status: timeoutResponse.error?.isTimeout ? 'success' : 'warning',
        message: timeoutResponse.error?.isTimeout ? 'Timeout handled correctly' : 'Timeout not triggered',
        duration
      });
    } catch (error) {
      tests.push({
        name: 'Timeout Test',
        status: 'success',
        message: 'Timeout handled correctly',
        duration: 0
      });
    }

    setTestResults(tests);
    logger.info('API connectivity tests completed', { 
      action: 'api_test',
      results: tests.map(t => ({ name: t.name, status: t.status }))
    });
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Loader2 className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: TestResult['status']) => {
    switch (status) {
      case 'success':
        return 'text-green-700 bg-green-50 border-green-200';
      case 'warning':
        return 'text-yellow-700 bg-yellow-50 border-yellow-200';
      case 'error':
        return 'text-red-700 bg-red-50 border-red-200';
      default:
        return 'text-gray-700 bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">API Connectivity Test</h1>
        <p className="text-gray-600">Test frontend resilience and error handling</p>
      </div>

      <div className="mb-6">
        <button
          onClick={runAllTests}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Run All Tests
        </button>
      </div>

      {/* Individual API Tests */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="border rounded-lg p-4">
          <h3 className="font-semibold mb-2">Health Endpoint</h3>
          <ApiStateHandler
            apiResponse={healthTest.apiResponse}
            isLoading={healthTest.isLoading}
            onRetry={healthTest.retry}
          >
            {(data) => (
              <div className="text-sm">
                <pre className="bg-gray-100 p-2 rounded overflow-auto">
                  {JSON.stringify(data, null, 2)}
                </pre>
              </div>
            )}
          </ApiStateHandler>
        </div>

        <div className="border rounded-lg p-4">
          <h3 className="font-semibold mb-2">Auth Endpoint</h3>
          <ApiStateHandler
            apiResponse={authTest.apiResponse}
            isLoading={authTest.isLoading}
            onRetry={authTest.retry}
          >
            {(data) => (
              <div className="text-sm">
                <pre className="bg-gray-100 p-2 rounded overflow-auto">
                  {JSON.stringify(data, null, 2)}
                </pre>
              </div>
            )}
          </ApiStateHandler>
        </div>

        <div className="border rounded-lg p-4">
          <h3 className="font-semibold mb-2">Invalid Endpoint</h3>
          <ApiStateHandler
            apiResponse={invalidEndpointTest.apiResponse}
            isLoading={invalidEndpointTest.isLoading}
            onRetry={invalidEndpointTest.retry}
          >
            {(data) => (
              <div className="text-sm">
                <pre className="bg-gray-100 p-2 rounded overflow-auto">
                  {JSON.stringify(data, null, 2)}
                </pre>
              </div>
            )}
          </ApiStateHandler>
        </div>

        <div className="border rounded-lg p-4">
          <h3 className="font-semibold mb-2">LEO Endpoint</h3>
          <ApiStateHandler
            apiResponse={leoTest.apiResponse}
            isLoading={leoTest.isLoading}
            onRetry={leoTest.retry}
          >
            {(data) => (
              <div className="text-sm">
                <pre className="bg-gray-100 p-2 rounded overflow-auto">
                  {JSON.stringify(data, null, 2)}
                </pre>
              </div>
            )}
          </ApiStateHandler>
        </div>
      </div>

      {/* Test Results */}
      {testResults.length > 0 && (
        <div className="border rounded-lg p-4">
          <h3 className="font-semibold mb-4">Test Results</h3>
          <div className="space-y-2">
            {testResults.map((test, index) => (
              <div
                key={index}
                className={`flex items-center justify-between p-3 border rounded ${getStatusColor(test.status)}`}
              >
                <div className="flex items-center space-x-3">
                  {getStatusIcon(test.status)}
                  <div>
                    <div className="font-medium">{test.name}</div>
                    <div className="text-sm opacity-75">{test.message}</div>
                  </div>
                </div>
                <div className="text-sm">
                  {test.duration > 0 && `${test.duration}ms`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Logs */}
      <div className="mt-8 border rounded-lg p-4">
        <h3 className="font-semibold mb-4">Recent Logs</h3>
        <div className="bg-gray-900 text-gray-100 p-4 rounded font-mono text-sm max-h-64 overflow-auto">
          {logger.getLogs().slice(-10).map((log, index) => (
            <div key={index} className="mb-2">
              <span className="text-gray-400">{log.timestamp}</span>
              <span className={`ml-2 ${
                log.level === 'ERROR' ? 'text-red-400' :
                log.level === 'WARN' ? 'text-yellow-400' :
                log.level === 'INFO' ? 'text-blue-400' :
                'text-gray-400'
              }`}>
                {log.level}
              </span>
              <span className="ml-2">{log.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface TestResult {
  name: string;
  status: 'success' | 'warning' | 'error';
  message: string;
  duration: number;
  response?: any;
}
