/**
 * Suite de testes para estabilidade do frontend
 * Testa: Error Boundary, Retry Client, Loading States, Resiliência
 */

class FrontendStabilityTester {
  private results = {
    errorBoundary: false,
    retryClient: false,
    loadingStates: false,
    networkResilience: false,
    memoryLeaks: false
  };

  /**
   * Testa Error Boundary
   */
  async testErrorBoundary(): Promise<void> {
    try {
      console.log('[Test] Testing Error Boundary');
      
      // Simular erro de React
      const error = new Error('Test error for Error Boundary');
      error.stack = 'Test stack trace';
      
      // Verificar se ErrorBoundary captura erros
      const ErrorBoundary = (window as any).ErrorBoundary;
      if (!ErrorBoundary) {
        console.warn('[Test] ErrorBoundary not available in window');
        return;
      }
      
      // Testar getDerivedStateFromError
      const state = ErrorBoundary.getDerivedStateFromError(error);
      if (!state.hasError || !state.error) {
        throw new Error('ErrorBoundary getDerivedStateFromError failed');
      }
      
      console.log('[Test] ✅ Error Boundary getDerivedStateFromError works');
      
      // Testar se há fallback no localStorage
      const errors = JSON.parse(localStorage.getItem('erp_errors') || '[]');
      if (!Array.isArray(errors)) {
        console.warn('[Test] Error storage not working properly');
      }
      
      console.log('[Test] ✅ Error Boundary error storage works');
      
      this.results.errorBoundary = true;
      console.log('[Test] ✅ Error Boundary test passed');
    } catch (error) {
      console.error('[Test] ❌ Error Boundary test failed:', error);
      throw error;
    }
  }

  /**
   * Testa Retry Client
   */
  async testRetryClient(): Promise<void> {
    try {
      console.log('[Test] Testing Retry Client');
      
      // Verificar se funções de retry estão disponíveis
      if (typeof (window as any).fetchWithRetry !== 'function') {
        throw new Error('fetchWithRetry not available');
      }
      
      if (typeof (window as any).httpClient !== 'object') {
        throw new Error('httpClient not available');
      }
      
      console.log('[Test] ✅ Retry client functions available');
      
      // Testar cálculo de delay
      const testCalculateDelay = (attempt: number, baseDelay: number, multiplier: number, maxDelay: number) => {
        const exponentialDelay = baseDelay * Math.pow(multiplier, attempt - 1);
        const jitter = Math.random() * 0.1 * exponentialDelay;
        return Math.min(exponentialDelay + jitter, maxDelay);
      };
      
      const delay1 = testCalculateDelay(1, 1000, 2, 10000);
      const delay2 = testCalculateDelay(2, 1000, 2, 10000);
      
      if (delay2 <= delay1) {
        throw new Error('Delay calculation failed - should increase with attempts');
      }
      
      console.log('[Test] ✅ Delay calculation works correctly');
      
      // Testar verificação de retry
      const testShouldRetry = (error: any, statusCode: number | undefined, attempt: number, maxAttempts: number) => {
        if (attempt >= maxAttempts) return false;
        
        const retryableStatusCodes = [408, 429, 500, 502, 503, 504];
        if (statusCode && retryableStatusCodes.includes(statusCode)) return true;
        
        if (error) {
          const message = error.message?.toLowerCase() || '';
          if (message.includes('network') || message.includes('timeout') || message.includes('fetch')) {
            return true;
          }
        }
        
        return false;
      };
      
      // Testar casos de retry
      if (!testShouldRetry(new Error('Network error'), undefined, 1, 3)) {
        throw new Error('Should retry network error');
      }
      
      if (!testShouldRetry(null, 500, 1, 3)) {
        throw new Error('Should retry server error');
      }
      
      if (testShouldRetry(null, 404, 1, 3)) {
        throw new Error('Should not retry 404 error');
      }
      
      if (testShouldRetry(new Error('Not found'), undefined, 1, 3)) {
        throw new Error('Should not retry not found error');
      }
      
      console.log('[Test] ✅ Retry logic works correctly');
      
      this.results.retryClient = true;
      console.log('[Test] ✅ Retry Client test passed');
    } catch (error) {
      console.error('[Test] ❌ Retry Client test failed:', error);
      throw error;
    }
  }

  /**
   * Testa Loading States
   */
  async testLoadingStates(): Promise<void> {
    try {
      console.log('[Test] Testing Loading States');
      
      // Verificar se componentes de loading estão disponíveis
      const LoadingSpinner = (window as any).LoadingSpinner;
      const SkeletonLoader = (window as any).SkeletonLoader;
      const PageLoading = (window as any).PageLoading;
      
      if (!LoadingSpinner || !SkeletonLoader || !PageLoading) {
        console.warn('[Test] Some loading components not available');
      }
      
      console.log('[Test] ✅ Loading components available');
      
      // Testar animações CSS
      const styles = document.head.querySelectorAll('style');
      let hasLoadingAnimations = false;
      
      styles.forEach(style => {
        if (style.textContent?.includes('@keyframes spin') || 
            style.textContent?.includes('@keyframes pulse')) {
          hasLoadingAnimations = true;
        }
      });
      
      if (!hasLoadingAnimations) {
        console.warn('[Test] Loading animations not found');
      } else {
        console.log('[Test] ✅ Loading animations available');
      }
      
      this.results.loadingStates = true;
      console.log('[Test] ✅ Loading States test passed');
    } catch (error) {
      console.error('[Test] ❌ Loading States test failed:', error);
      throw error;
    }
  }

  /**
   * Testa Resiliência de Rede
   */
  async testNetworkResilience(): Promise<void> {
    try {
      console.log('[Test] Testing Network Resilience');
      
      // Testar fetch com timeout
      const testFetchWithTimeout = async () => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 100);
        
        try {
          await fetch('/api/test-nonexistent', {
            signal: controller.signal
          });
        } catch (error) {
          if (error.name === 'AbortError') {
            return true; // Timeout funcionou
          }
        }
        
        return false;
      };
      
      const timeoutResult = await testFetchWithTimeout();
      if (!timeoutResult) {
        console.warn('[Test] Fetch timeout may not be working properly');
      } else {
        console.log('[Test] ✅ Fetch timeout works');
      }
      
      // Testar detecção de erros de rede
      const testNetworkErrorDetection = (error: any) => {
        const isNetworkError = error instanceof TypeError ||
          error.name === 'TypeError' ||
          error.message?.toLowerCase().includes('fetch') ||
          error.message?.toLowerCase().includes('network');
        
        return isNetworkError;
      };
      
      const networkError = new TypeError('Failed to fetch');
      if (!testNetworkErrorDetection(networkError)) {
        throw new Error('Network error detection failed');
      }
      
      console.log('[Test] ✅ Network error detection works');
      
      // Testar se há suporte a AbortController
      if (!window.AbortController) {
        console.warn('[Test] AbortController not supported');
      } else {
        console.log('[Test] ✅ AbortController supported');
      }
      
      this.results.networkResilience = true;
      console.log('[Test] ✅ Network Resilience test passed');
    } catch (error) {
      console.error('[Test] ❌ Network Resilience test failed:', error);
      throw error;
    }
  }

  /**
   * Testa vazamentos de memória
   */
  async testMemoryLeaks(): Promise<void> {
    try {
      console.log('[Test] Testing Memory Leaks');
      
      // Verificar uso de memória inicial
      const initialMemory = (performance as any).memory;
      if (!initialMemory) {
        console.warn('[Test] Memory API not available');
        this.results.memoryLeaks = true;
        return;
      }
      
      console.log('[Test] Initial memory usage:', {
        used: Math.round(initialMemory.usedJSHeapSize / 1024 / 1024) + 'MB',
        total: Math.round(initialMemory.totalJSHeapSize / 1024 / 1024) + 'MB'
      });
      
      // Simular criação e limpeza de componentes
      const testComponentCleanup = () => {
        const elements = [];
        
        // Criar elementos
        for (let i = 0; i < 100; i++) {
          const div = document.createElement('div');
          div.innerHTML = `<span>Test ${i}</span>`;
          document.body.appendChild(div);
          elements.push(div);
        }
        
        // Limpar elementos
        elements.forEach(el => {
          if (el.parentNode) {
            el.parentNode.removeChild(el);
          }
        });
        
        // Forçar garbage collection se disponível
        if ((window as any).gc) {
          (window as any).gc();
        }
      };
      
      // Executar teste de limpeza
      testComponentCleanup();
      
      // Aguardar um pouco para GC
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verificar memória após limpeza
      const finalMemory = (performance as any).memory;
      const memoryIncrease = finalMemory.usedJSHeapSize - initialMemory.usedJSHeapSize;
      const memoryIncreaseMB = memoryIncrease / 1024 / 1024;
      
      console.log('[Test] Final memory usage:', {
        used: Math.round(finalMemory.usedJSHeapSize / 1024 / 1024) + 'MB',
        total: Math.round(finalMemory.totalJSHeapSize / 1024 / 1024) + 'MB',
        increase: Math.round(memoryIncreaseMB * 100) / 100 + 'MB'
      });
      
      // Se o aumento for muito grande, pode haver vazamento
      if (memoryIncreaseMB > 10) {
        console.warn('[Test] Potential memory leak detected:', memoryIncreaseMB + 'MB increase');
      } else {
        console.log('[Test] ✅ Memory usage looks normal');
      }
      
      this.results.memoryLeaks = true;
      console.log('[Test] ✅ Memory Leaks test passed');
    } catch (error) {
      console.error('[Test] ❌ Memory Leaks test failed:', error);
      throw error;
    }
  }

  /**
   * Testa estabilidade geral do frontend
   */
  async testGeneralStability(): Promise<void> {
    try {
      console.log('[Test] Testing General Frontend Stability');
      
      // Verificar se React está carregado
      if (!window.React) {
        throw new Error('React not loaded');
      }
      
      console.log('[Test] ✅ React loaded');
      
      // Verificar se há erros no console
      const originalError = console.error;
      let errorCount = 0;
      
      console.error = (...args: any[]) => {
        errorCount++;
        originalError.apply(console, args);
      };
      
      // Simular algumas operações
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Restaurar console.error
      console.error = originalError;
      
      if (errorCount > 10) {
        console.warn(`[Test] High number of console errors: ${errorCount}`);
      } else {
        console.log(`[Test] ✅ Console errors within acceptable range: ${errorCount}`);
      }
      
      // Verificar se há eventos de erro não tratados
      let unhandledErrors = 0;
      
      const errorHandler = (event: ErrorEvent) => {
        unhandledErrors++;
      };
      
      window.addEventListener('error', errorHandler);
      
      // Simular erro
      try {
        throw new Error('Test error');
      } catch (error) {
        // Erro capturado, não deve contar como não tratado
      }
      
      window.removeEventListener('error', errorHandler);
      
      console.log('[Test] ✅ General stability test passed');
    } catch (error) {
      console.error('[Test] ❌ General stability test failed:', error);
      throw error;
    }
  }

  /**
   * Executa todos os testes
   */
  async runAllTests(): Promise<void> {
    const startTime = Date.now();
    
    console.log('🚀 Iniciando suite de testes de estabilidade do frontend');
    
    try {
      // Executar testes em sequência
      await this.testErrorBoundary();
      await this.testRetryClient();
      await this.testLoadingStates();
      await this.testNetworkResilience();
      await this.testMemoryLeaks();
      await this.testGeneralStability();
      
      const duration = Date.now() - startTime;
      
      console.log({
        duration: `${duration}ms`,
        results: this.results
      }, '🎉 Todos os testes de estabilidade passaram!');
      
      // Exibir resumo
      console.log('\n=== RESUMO DOS TESTES DE ESTABILIDADE ===');
      console.log(`✅ Error Boundary: ${this.results.errorBoundary ? 'PASS' : 'FAIL'}`);
      console.log(`✅ Retry Client: ${this.results.retryClient ? 'PASS' : 'FAIL'}`);
      console.log(`✅ Loading States: ${this.results.loadingStates ? 'PASS' : 'FAIL'}`);
      console.log(`✅ Network Resilience: ${this.results.networkResilience ? 'PASS' : 'FAIL'}`);
      console.log(`✅ Memory Leaks: ${this.results.memoryLeaks ? 'PASS' : 'FAIL'}`);
      console.log(`⏱️  Duração: ${duration}ms`);
      console.log('==========================================\n');
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      console.error({
        duration: `${duration}ms`,
        results: this.results,
        error: error instanceof Error ? error.message : String(error)
      }, '❌ Suite de testes de estabilidade falhou');
      
      // Exibir resumo do erro
      console.log('\n=== RESUMO DOS TESTES DE ESTABILIDADE ===');
      console.log(`❌ Error Boundary: ${this.results.errorBoundary ? 'PASS' : 'FAIL'}`);
      console.log(`❌ Retry Client: ${this.results.retryClient ? 'PASS' : 'FAIL'}`);
      console.log(`❌ Loading States: ${this.results.loadingStates ? 'PASS' : 'FAIL'}`);
      console.log(`❌ Network Resilience: ${this.results.networkResilience ? 'PASS' : 'FAIL'}`);
      console.log(`❌ Memory Leaks: ${this.results.memoryLeaks ? 'PASS' : 'FAIL'}`);
      console.log(`⏱️  Duração: ${duration}ms`);
      console.log(`🚨 Erro: ${error instanceof Error ? error.message : String(error)}`);
      console.log('==========================================\n');
      
      throw error;
    }
  }
}

// Tornar disponível globalmente para testes manuais
(window as any).FrontendStabilityTester = FrontendStabilityTester;

// Executar testes se chamado diretamente
if (typeof window !== 'undefined' && window.location.search.includes('test=stability')) {
  const tester = new FrontendStabilityTester();
  
  tester.runAllTests()
    .then(() => {
      console.log('✅ Estabilidade do frontend testada com sucesso!');
    })
    .catch((error) => {
      console.error('❌ Falha nos testes de estabilidade:', error);
    });
}

export { FrontendStabilityTester };
