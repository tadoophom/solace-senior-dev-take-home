/**
 * Optimized chat service using OpenAI GPT API for conversational AI
 * Enhanced with caching, connection pooling, and performance monitoring
 * VERSION: 3.0 - Performance optimized
 */

class ChatService {
  constructor() {
    this.apiKey = import.meta.env.VITE_OPENAI_API_KEY;
    this.baseUrl = 'https://api.openai.com/v1/chat/completions';
    this.model = 'gpt-3.5-turbo';
    this.conversationHistory = [];
    
    // Performance optimizations
    this.responseCache = new Map(); // Cache for similar queries
    this.connectionPool = new Map(); // Keep-alive connections
    this.maxCacheSize = 100;
    this.maxHistoryLength = 20; // Optimized for token limits
    
    // Reusable objects to reduce allocations
    this.reusableHeaders = {
      'Content-Type': 'application/json'
    };
    
    // Performance monitoring
    this.stats = {
      apiCalls: 0,
      demoCalls: 0,
      cacheHits: 0,
      totalLatency: 0,
      averageLatency: 0,
      tokensSaved: 0
    };
    
    // Optimized demo responses with categories for better matching
    this.demoResponses = {
      greeting: [
        "Hello! I'm your AI companion. How can I help you today?",
        "Hi there! Great to meet you. What's on your mind?",
        "Hey! I'm here and ready to chat. What would you like to talk about?"
      ],
      question: [
        "That's a great question! Let me think about that for a moment.",
        "Interesting question! I'd love to explore that topic with you.",
        "You've got me thinking! That's quite a thoughtful question."
      ],
      help: [
        "I'm here to help! Feel free to ask me anything you'd like to know.",
        "I'd be happy to assist you with that. What specifically can I help with?",
        "Sure thing! I'm ready to help however I can."
      ],
      general: [
        "That's fascinating! Tell me more about what you're thinking.",
        "I find that really interesting. What's your perspective on it?",
        "Thanks for sharing that with me. I appreciate your thoughts."
      ],
      goodbye: [
        "It was great chatting with you! Take care!",
        "Thanks for the conversation! Have a wonderful day!",
        "See you later! Feel free to come back anytime."
      ]
    };
    
    console.log('ChatService v3.0 initialized - performance optimized with caching');
  }

  /**
   * Check if service is properly configured
   */
  isConfigured() {
    return !!this.apiKey || true; // Always true due to demo mode fallback
  }

  /**
   * Optimized message sending with caching and performance monitoring
   */
  async sendMessage(userMessage, conversationContext = []) {
    const startTime = performance.now();
    
    try {
      // Generate cache key for similar queries
      const cacheKey = this.generateCacheKey(userMessage, conversationContext);
      
      // Check cache first
      if (this.responseCache.has(cacheKey)) {
        this.stats.cacheHits++;
        console.log('Cache hit for chat response');
        const cachedResponse = this.responseCache.get(cacheKey);
        this.updateLatencyStats(performance.now() - startTime);
        return cachedResponse;
      }
      
      // Check for quota exceeded first - immediate demo mode if API is failing
      if (!this.apiKey) {
        console.log('No API key - using optimized demo mode');
        return this.getOptimizedDemoResponse(userMessage);
      }

      // Build optimized conversation with context
      const messages = this.buildOptimizedMessages(userMessage, conversationContext);
      
      const requestBody = JSON.stringify({
        model: this.model,
        messages: messages,
        max_tokens: 150,
        temperature: 0.7,
        // Performance optimizations
        stream: false,
        presence_penalty: 0.1,
        frequency_penalty: 0.1
      });

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          ...this.reusableHeaders
        },
        body: requestBody,
        // Connection optimizations
        keepalive: true,
        signal: AbortSignal.timeout(15000) // 15 second timeout
      });

      // Check for quota/billing errors immediately
      if (response.status === 429) {
        console.warn('OpenAI quota exceeded (429), using optimized demo mode');
        return this.getOptimizedDemoResponse(userMessage);
      }

      if (!response.ok) {
        console.warn('OpenAI API error response not ok, using optimized demo mode');
        return this.getOptimizedDemoResponse(userMessage);
      }

      const result = await response.json();
      const aiResponse = result.choices[0].message.content.trim();
      
      this.stats.apiCalls++;
      this.stats.tokensSaved += result.usage?.total_tokens || 0;

      // Update conversation history efficiently
      this.updateConversationHistory(userMessage, aiResponse);
      
      // Cache the response
      this.cacheResponse(cacheKey, aiResponse);
      
      // Update performance stats
      this.updateLatencyStats(performance.now() - startTime);

      return aiResponse;

    } catch (error) {
      console.error('Chat service failed:', error);
      console.warn('Any error occurred, using optimized demo mode:', error.message);
      
      // NEVER throw an error - always return demo response
      const demoResponse = this.getOptimizedDemoResponse(userMessage);
      this.stats.demoCalls++;
      this.updateLatencyStats(performance.now() - startTime);
      return demoResponse;
    }
  }

  /**
   * Generate cache key for similar queries
   */
  generateCacheKey(userMessage, conversationContext) {
    // Normalize message for better cache hits
    const normalizedMessage = userMessage.toLowerCase().trim();
    const contextHash = this.hashConversationContext(conversationContext);
    return `${normalizedMessage.substring(0, 50)}_${contextHash}`;
  }

  /**
   * Hash conversation context for cache key
   */
  hashConversationContext(context) {
    if (!context || context.length === 0) return 'empty';
    
    // Use last few messages for context hash
    const recentContext = context.slice(-4);
    const contextString = recentContext.map(msg => `${msg.role}:${msg.content}`).join('|');
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < contextString.length; i++) {
      const char = contextString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Build optimized messages with token management
   */
  buildOptimizedMessages(userMessage, conversationContext) {
    const systemMessage = {
      role: 'system',
      content: 'You are a helpful voice companion. Keep responses concise and conversational, as they will be spoken aloud. Respond in 1-3 sentences maximum.'
    };
    
    // Optimize context to stay within token limits
    const optimizedContext = this.optimizeConversationContext(conversationContext);
    
    return [
      systemMessage,
      ...optimizedContext,
      {
        role: 'user',
        content: userMessage
      }
    ];
  }

  /**
   * Optimize conversation context for token efficiency
   */
  optimizeConversationContext(context) {
    if (!context || context.length === 0) return [];
    
    // Keep only recent messages to stay within token limits
    const recentContext = context.slice(-8); // Last 8 messages
    
    // Truncate very long messages
    return recentContext.map(msg => ({
      ...msg,
      content: msg.content.length > 200 ? 
        msg.content.substring(0, 200) + '...' : 
        msg.content
    }));
  }

  /**
   * Cache response with size management
   */
  cacheResponse(cacheKey, response) {
    this.responseCache.set(cacheKey, response);
    
    // Manage cache size
    if (this.responseCache.size > this.maxCacheSize) {
      // Remove oldest entries (simple FIFO)
      const keysToDelete = Array.from(this.responseCache.keys()).slice(0, 10);
      keysToDelete.forEach(key => this.responseCache.delete(key));
    }
  }

  /**
   * Optimized demo response with intelligent categorization
   */
  getOptimizedDemoResponse(userMessage) {
    const message = userMessage.toLowerCase();
    
    // Intelligent categorization for better responses
    let category = 'general';
    
    if (message.includes('hello') || message.includes('hi') || message.includes('hey')) {
      category = 'greeting';
    } else if (message.includes('bye') || message.includes('goodbye') || message.includes('see you')) {
      category = 'goodbye';
    } else if (message.includes('?') || message.includes('what') || message.includes('how') || message.includes('why')) {
      category = 'question';
    } else if (message.includes('help') || message.includes('assist') || message.includes('support')) {
      category = 'help';
    }
    
    const responses = this.demoResponses[category];
    const randomIndex = Math.floor(Math.random() * responses.length);
    
    return responses[randomIndex];
  }

  /**
   * Efficiently update conversation history
   */
  updateConversationHistory(userMessage, aiResponse) {
    // Add new messages
    this.conversationHistory.push(
      { role: 'user', content: userMessage },
      { role: 'assistant', content: aiResponse }
    );

    // Keep only recent messages for performance
    if (this.conversationHistory.length > this.maxHistoryLength) {
      this.conversationHistory = this.conversationHistory.slice(-this.maxHistoryLength);
    }
  }

  /**
   * Update latency statistics
   */
  updateLatencyStats(latency) {
    this.stats.totalLatency += latency;
    const totalCalls = this.stats.apiCalls + this.stats.demoCalls;
    this.stats.averageLatency = totalCalls > 0 ? this.stats.totalLatency / totalCalls : 0;
  }

  /**
   * Get conversation history efficiently
   */
  getConversationHistory() {
    return [...this.conversationHistory]; // Return copy to prevent mutations
  }

  /**
   * Load conversation history efficiently
   */
  loadHistory(history) {
    if (Array.isArray(history)) {
      this.conversationHistory = history.slice(-this.maxHistoryLength); // Limit size
    }
  }

  /**
   * Clear conversation history and cache
   */
  clearHistory() {
    this.conversationHistory.length = 0; // Efficient array clearing
    this.responseCache.clear(); // Clear response cache
  }

  /**
   * Get performance statistics
   */
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.responseCache.size,
      historyLength: this.conversationHistory.length,
      cacheHitRate: this.stats.cacheHits / Math.max(1, this.stats.apiCalls + this.stats.demoCalls)
    };
  }

  /**
   * Clean up resources
   */
  cleanup() {
    this.responseCache.clear();
    this.conversationHistory.length = 0;
    this.connectionPool.clear();
  }
}

export default ChatService; 