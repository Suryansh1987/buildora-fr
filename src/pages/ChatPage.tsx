import React, {
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { MyContext } from "../context/FrontendStructureContext";
import axios from "axios";
import { Send, Code, Loader2, MessageSquare, History, RefreshCw, AlertCircle } from "lucide-react";
import { useLocation } from "react-router-dom";

interface LocationState {
  prompt?: string;
  projectId?: number;
  existingProject?: boolean;
  sessionId?: string;
}

interface Project {
  id: number;
  deploymentUrl?: string;
  status?: "pending" | "building" | "ready" | "error";
}

interface Message {
  id: string;
  content: string;
  type: "user" | "assistant";
  timestamp: Date;
  isStreaming?: boolean;
}

interface ConversationSummary {
  id: string;
  summary: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ContextValue {
  value: any;
  setValue: (value: any) => void;
}

interface ConversationStats {
  totalMessages: number;
  totalSummaries: number;
  oldestMessage: string;
  newestMessage: string;
  averageMessageLength: number;
}

const ChatPage: React.FC = () => {
  const { value } = useContext(MyContext) as ContextValue;
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [projectStatus, setProjectStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentSummary, setCurrentSummary] = useState<ConversationSummary | null>(null);
  const [conversationStats, setConversationStats] = useState<ConversationStats | null>(null);
  const [isStreamingResponse, setIsStreamingResponse] = useState(false);
  const [hasSessionSupport, setHasSessionSupport] = useState(true);
  const [isServerHealthy, setIsServerHealthy] = useState<boolean | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  // Refs to prevent duplicate API calls
  const hasInitialized = useRef(false);
  const isGenerating = useRef(false);
  const currentProjectId = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageCountRef = useRef(0);

  const location = useLocation();
  const {
    prompt: navPrompt,
    projectId,
    existingProject,
    sessionId: initialSessionId,
  } = (location.state as LocationState) || {};

  const baseUrl = import.meta.env.VITE_BASE_URL;

  // Auto-scroll to bottom when messages change
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Server health check
  const checkServerHealth = useCallback(async () => {
    try {
      const healthResponse = await axios.get(`${baseUrl}/health`, { 
        timeout: 5000 
      });
      console.log("✅ Server is running:", healthResponse.data);
      setIsServerHealthy(true);
      setError("");
      return true;
    } catch (error) {
      console.error("❌ Server health check failed:", error);
      setIsServerHealthy(false);
      
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK') {
          setError("Backend server is not responding. Please ensure it's running on the correct port.");
        } else {
          setError(`Server error: ${error.response?.status || 'Unknown'}`);
        }
      } else {
        setError("Cannot connect to server");
      }
      return false;
    }
  }, [baseUrl]);

  // Retry connection with loading state
  const retryConnection = useCallback(async () => {
    setIsRetrying(true);
    setError("");
    setProjectStatus("loading");
    
    try {
      const isHealthy = await checkServerHealth();
      if (isHealthy) {
        // Reset initialization and retry
        hasInitialized.current = false;
        await initializeSession();
        
        if (existingProject && projectId) {
          await fetchProjectDeploymentUrl(projectId);
        } else if (navPrompt && projectId) {
          setPrompt(navPrompt);
          await generateCode(navPrompt, projectId);
        } else {
          setProjectStatus("idle");
        }
      }
    } catch (error) {
      setError("Still cannot connect to server. Please check your backend setup.");
      setProjectStatus("error");
    } finally {
      setIsRetrying(false);
    }
  }, [checkServerHealth]);

  // Initialize or get session
  const initializeSession = useCallback(async () => {
    try {
      let currentSessionId = initialSessionId || sessionId;
      
      if (!currentSessionId) {
        try {
          const response = await axios.post(`${baseUrl}/api/session/create`, {
            projectId: projectId || null,
          });
          currentSessionId = response.data.sessionId;
          setSessionId(currentSessionId);
          setHasSessionSupport(true);
        } catch (sessionError) {
          console.warn("Session endpoint not available, using project-based messaging");
          setHasSessionSupport(false);
          // Use project-based session ID
          currentSessionId = projectId ? `project-${projectId}` : `temp-${Date.now()}`;
          setSessionId(currentSessionId);
        }
      }

      // Load existing conversation if session exists and session API is working
      if (currentSessionId && hasSessionSupport && !currentSessionId.startsWith('temp-') && !currentSessionId.startsWith('project-')) {
        try {
          await loadConversationHistory(currentSessionId);
          await loadCurrentSummary(currentSessionId);
          await loadConversationStats(currentSessionId);
        } catch (error) {
          console.warn("Could not load conversation history:", error);
        }
      } else if (projectId && hasSessionSupport) {
        // Try to load project-based messages
        try {
          await loadProjectMessages(projectId);
        } catch (error) {
          console.warn("Could not load project messages:", error);
        }
      }

      return currentSessionId;
    } catch (error) {
      console.error("Error initializing session:", error);
      setError("Failed to initialize chat session");
      return null;
    }
  }, [baseUrl, projectId, initialSessionId, sessionId, hasSessionSupport]);

  // Load conversation history
  const loadConversationHistory = useCallback(async (sessionId: string) => {
    try {
      const response = await axios.get(
        `${baseUrl}/api/conversation/conversation-with-summary?sessionId=${sessionId}`
      );
      
      const history = response.data.messages || [];
      const formattedMessages: Message[] = history.map((msg: any) => ({
        id: msg.id || Date.now().toString(),
        content: msg.content,
        type: msg.role === "user" ? "user" : "assistant",
        timestamp: new Date(msg.timestamp),
      }));

      setMessages(formattedMessages);
      messageCountRef.current = formattedMessages.length;
    } catch (error) {
      console.error("Error loading conversation history:", error);
    }
  }, [baseUrl]);

  // Load project messages (enhanced with better error handling)
  const loadProjectMessages = useCallback(async (projectId: number) => {
    try {
      const response = await axios.get(`${baseUrl}/api/messages/project/${projectId}`);
      
      // Handle the new response structure
      if (response.data.success && response.data.data) {
        const history = response.data.data;
        
        const formattedMessages: Message[] = history.map((msg: any) => ({
          id: msg.id || Date.now().toString(),
          content: msg.content,
          type: msg.role === "user" ? "user" : "assistant",
          timestamp: new Date(msg.createdAt || msg.timestamp),
        }));

        setMessages(formattedMessages);
        messageCountRef.current = formattedMessages.length;
        console.log(`✅ Loaded ${formattedMessages.length} messages for project ${projectId}`);
      } else {
        console.warn("No messages found for project:", projectId);
        setMessages([]);
      }
    } catch (error) {
      console.error("Error loading project messages:", error);
      
      // Enhanced error handling
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          console.warn(`Project ${projectId} messages not found, starting fresh`);
          setMessages([]);
        } else if (error.code === 'ERR_NETWORK') {
          setError("Cannot connect to server. Please check if the backend is running.");
        } else {
          console.warn(`Failed to load project messages: ${error.response?.data?.error || error.message}`);
          setMessages([]); // Don't show error for this, just start fresh
        }
      } else {
        setMessages([]);
      }
    }
  }, [baseUrl]);

  // Load current summary
  const loadCurrentSummary = useCallback(async (sessionId: string) => {
    try {
      const response = await axios.get(
        `${baseUrl}/api/conversation/current-summary?sessionId=${sessionId}`
      );
      setCurrentSummary(response.data.summary);
    } catch (error) {
      console.error("Error loading current summary:", error);
    }
  }, [baseUrl]);

  // Load conversation stats
  const loadConversationStats = useCallback(async (sessionId: string) => {
    try {
      const response = await axios.get(
        `${baseUrl}/api/conversation/conversation-stats?sessionId=${sessionId}`
      );
      setConversationStats(response.data);
    } catch (error) {
      console.error("Error loading conversation stats:", error);
    }
  }, [baseUrl]);

  // Check if summary should be updated (after every 5 messages)
  const checkAndUpdateSummary = useCallback(async (sessionId: string) => {
    if (!hasSessionSupport) return;
    
    const currentMessageCount = messages.length;
    if (currentMessageCount > 0 && currentMessageCount % 5 === 0 && currentMessageCount !== messageCountRef.current) {
      try {
        await axios.post(`${baseUrl}/api/conversation/messages`, {
          sessionId,
          action: "update_summary"
        });
        await loadCurrentSummary(sessionId);
        await loadConversationStats(sessionId);
        messageCountRef.current = currentMessageCount;
      } catch (error) {
        console.error("Error updating summary:", error);
      }
    }
  }, [baseUrl, messages.length, loadCurrentSummary, loadConversationStats, hasSessionSupport]);

  // Memoized function to fetch project deployment URL
  const fetchProjectDeploymentUrl = useCallback(
    async (projId: number) => {
      if (currentProjectId.current === projId && projectStatus !== "idle") {
        return;
      }
      setError("");
      setProjectStatus("loading");
      currentProjectId.current = projId;

      try {
        const res = await axios.get<Project>(
          `${baseUrl}/api/projects/${projId}`
        );
        const project = res.data;
        if (project.deploymentUrl) {
          setPreviewUrl(project.deploymentUrl);
          setProjectStatus("ready");
        } else {
          setError("Project found, but deployment is not ready.");
          setProjectStatus("error");
        }
      } catch (error) {
        console.error("Error fetching project:", error);
        if (axios.isAxiosError(error) && error.code === 'ERR_NETWORK') {
          setError("Cannot connect to server");
        } else {
          setError("Failed to load project");
        }
        setProjectStatus("error");
      }
    },
    [baseUrl, projectStatus]
  );

  // Memoized function to generate code
  const generateCode = useCallback(
    async (userPrompt: string, projId?: number) => {
      if (isGenerating.current) return;

      isGenerating.current = true;
      setError("");
      setProjectStatus("loading");

      try {
        const response = await axios.post(`${baseUrl}/api/generate`, {
          prompt: userPrompt,
          projectId: projId,
        });

        setPreviewUrl(response.data.previewUrl);
        setProjectStatus("ready");

        // Update project if needed
        if (projId && response.data.previewUrl) {
          try {
            await axios.put(`${baseUrl}/api/projects/${projId}`, {
              deploymentUrl: response.data.previewUrl,
              status: "ready",
            });
          } catch (updateError) {
            console.warn("Could not update project:", updateError);
          }
        }
      } catch (error) {
        console.error("Error generating code:", error);
        if (axios.isAxiosError(error) && error.code === 'ERR_NETWORK') {
          setError("Cannot connect to server. Please check if the backend is running.");
        } else {
          setError("Failed to generate code. Please try again.");
        }
        setProjectStatus("error");
      } finally {
        isGenerating.current = false;
      }
    },
    [baseUrl]
  );

  // Initialize component with health check
  useEffect(() => {
    if (hasInitialized.current) return;

    const initializeWithHealthCheck = async () => {
      // Check server health first
      const serverHealthy = await checkServerHealth();
      if (!serverHealthy) {
        setProjectStatus("error");
        return;
      }

      const currentSessionId = await initializeSession();
      
      if (existingProject && projectId) {
        await fetchProjectDeploymentUrl(projectId);
      } else if (navPrompt && projectId) {
        setPrompt(navPrompt);
        await generateCode(navPrompt, projectId);
      } else {
        setProjectStatus("idle");
      }
      hasInitialized.current = true;
    };

    initializeWithHealthCheck();
  }, [checkServerHealth, initializeSession, fetchProjectDeploymentUrl, generateCode, existingProject, projectId, navPrompt]);

  // Handle streaming response
  const handleStreamingResponse = useCallback(async (
    currentPrompt: string, 
    currentSessionId: string
  ) => {
    try {
      setIsStreamingResponse(true);
      
      // Add streaming message placeholder
      const streamingMessage: Message = {
        id: `streaming-${Date.now()}`,
        content: "",
        type: "assistant",
        timestamp: new Date(),
        isStreaming: true,
      };
      
      setMessages((prev) => [...prev, streamingMessage]);

      const response = await fetch(`${baseUrl}/api/modify/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: currentPrompt,
          sessionId: currentSessionId,
          projectId: projectId,
          projectStructure: value,
        }),
      });

      if (!response.ok) {
        throw new Error('Streaming request failed');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      let accumulatedContent = '';
      
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;

        const text = new TextDecoder().decode(chunk);
        const lines = text.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                accumulatedContent += data.content;
                
                // Update the streaming message
                setMessages((prev) => 
                  prev.map((msg) => 
                    msg.id === streamingMessage.id 
                      ? { ...msg, content: accumulatedContent }
                      : msg
                  )
                );
              }
            } catch (e) {
              // Ignore parsing errors for non-JSON lines
            }
          }
        }
      }

      // Finalize the streaming message
      setMessages((prev) => 
        prev.map((msg) => 
          msg.id === streamingMessage.id 
            ? { ...msg, isStreaming: false }
            : msg
        )
      );

    } catch (error) {
      console.error("Error in streaming response:", error);
      
      // Remove streaming message and add error message
      setMessages((prev) => 
        //@ts-ignore
        prev.filter((msg) => msg.id !== streamingMessage.id)
      );
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: "Sorry, I encountered an error while processing your request.",
        type: "assistant",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsStreamingResponse(false);
    }
  }, [baseUrl, value, projectId]);

  // Save message to backend (enhanced)
  const saveMessage = useCallback(async (content: string, role: 'user' | 'assistant') => {
    if (!projectId) return;

    try {
      if (hasSessionSupport && sessionId && !sessionId.startsWith('temp-') && !sessionId.startsWith('project-')) {
        // Use session-based messaging
        await axios.post(`${baseUrl}/api/conversation/messages`, {
          sessionId,
          message: {
            role,
            content,
          },
        });
      } else {
        // Use project-based messaging with the new API structure
        await axios.post(`${baseUrl}/api/messages`, {
          projectId,
          role,
          content,
          sessionId,
          metadata: {
            projectId,
            sessionId,
            timestamp: new Date().toISOString()
          }
        });
      }
    } catch (error) {
      console.warn("Could not save message:", error);
      
      // Don't throw error, just log it since message saving is not critical for UI
      if (axios.isAxiosError(error)) {
        console.warn(`Save message failed: ${error.response?.data?.error || error.message}`);
      }
    }
  }, [baseUrl, projectId, sessionId, hasSessionSupport]);

  // Handle user prompt for code changes
  const handleSubmit = useCallback(async () => {
    if (!prompt.trim() || isLoading) return;

    setIsLoading(true);
    setError("");

    const newMessage: Message = {
      id: Date.now().toString(),
      content: prompt,
      type: "user",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, newMessage]);
    const currentPrompt = prompt;
    setPrompt("");

    // Save user message
    await saveMessage(currentPrompt, 'user');

    try {
      if (hasSessionSupport && sessionId && !sessionId.startsWith('temp-')) {
        // Use streaming response for better UX
        await handleStreamingResponse(currentPrompt, sessionId);
        
        // Check if summary needs to be updated
        await checkAndUpdateSummary(sessionId);
      } else {
        // Fall back to the non-streaming modification approach
        await handleNonStreamingSubmit(currentPrompt);
      }
    } catch (error) {
      console.error("Error handling submit:", error);
      setError("Failed to apply changes");

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: "Sorry, I encountered an error while applying the changes.",
        type: "assistant",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);
      await saveMessage(errorMessage.content, 'assistant');
    } finally {
      setIsLoading(false);
    }
  }, [prompt, isLoading, sessionId, hasSessionSupport, saveMessage, handleStreamingResponse, checkAndUpdateSummary]);

  // Non-streaming submit handler (enhanced)
  const handleNonStreamingSubmit = useCallback(async (currentPrompt: string) => {
    try {
      // Use the new API endpoint instead of legacy /modify
      const response = await axios.post(`${baseUrl}/api/modify`, {
        prompt: currentPrompt,
        sessionId: sessionId,
        projectId: projectId,
        projectStructure: value,
      });

      let responseContent = "Changes applied successfully!";
      
      // Try to extract meaningful response from the API
      if (response.data && response.data.content) {
        if (typeof response.data.content === 'string') {
          responseContent = response.data.content;
        } else if (Array.isArray(response.data.content) && response.data.content.length > 0) {
          responseContent = response.data.content[0].text || responseContent;
        }
      } else if (response.data && response.data.message) {
        responseContent = response.data.message;
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: responseContent,
        type: "assistant",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      await saveMessage(assistantMessage.content, 'assistant');
      
    } catch (error) {
      console.error("Error in non-streaming modification:", error);
      
      // Try to provide helpful error information
      let errorMessage = "Sorry, I encountered an error while applying the changes.";
      
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 501) {
          errorMessage = "This feature is currently unavailable. The modification service needs to be configured.";
        } else if (error.response?.data?.message) {
          errorMessage = `Error: ${error.response.data.message}`;
        } else if (error.code === 'ERR_NETWORK') {
          errorMessage = "Cannot connect to server. Please check your connection.";
        }
      }
      
      const assistantErrorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: errorMessage,
        type: "assistant",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantErrorMessage]);
      await saveMessage(assistantErrorMessage.content, 'assistant');
      
      throw error;
    }
  }, [value, baseUrl, saveMessage, sessionId, projectId]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handlePromptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setPrompt(e.target.value);
    },
    []
  );

  // Clear conversation (enhanced)
  const clearConversation = useCallback(async () => {
    if (!sessionId) return;
    
    try {
      if (hasSessionSupport && !sessionId.startsWith('temp-') && !sessionId.startsWith('project-')) {
        await axios.delete(`${baseUrl}/api/conversation/conversation?sessionId=${sessionId}`);
      } else if (projectId) {
        await axios.delete(`${baseUrl}/api/messages/project/${projectId}`);
      }
      
      setMessages([]);
      setCurrentSummary(null);
      setConversationStats(null);
      messageCountRef.current = 0;
    } catch (error) {
      console.error("Error clearing conversation:", error);
      setError("Failed to clear conversation");
    }
  }, [baseUrl, sessionId, projectId, hasSessionSupport]);

  return (
    <div className="w-full bg-gradient-to-br from-black via-neutral-950 to-black h-screen flex">
      {/* Chat Section - 25% width */}
      <div className="w-1/4 flex flex-col border-r border-slate-700/50">
        {/* Header */}
        <div className="bg-slate-black/50 backdrop-blur-sm border-b border-slate-700/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <a href="/" className="text-xl font-semibold text-white">
                Buildora
              </a>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={clearConversation}
                className="p-1.5 text-slate-400 hover:text-white transition-colors"
                title="Clear conversation"
              >
                <History className="w-4 h-4" />
              </button>
              {isServerHealthy === false && (
                <button
                  onClick={retryConnection}
                  disabled={isRetrying}
                  className="p-1.5 text-red-400 hover:text-red-300 transition-colors"
                  title="Retry connection"
                >
                  {isRetrying ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Summary Section */}
        {currentSummary && (
          <div className="bg-slate-800/30 border-b border-slate-700/50 p-3">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-medium text-blue-400">SUMMARY</span>
            </div>
            <p className="text-xs text-slate-300 line-clamp-3">
              {currentSummary.summary}
            </p>
            {conversationStats && (
              <div className="mt-2 text-xs text-slate-400">
                {conversationStats.totalMessages} messages • {conversationStats.totalSummaries} summaries
              </div>
            )}
          </div>
        )}

        {/* Session Status */}
        {!hasSessionSupport && (
          <div className="bg-yellow-500/10 border-b border-yellow-500/20 p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
              <span className="text-xs font-medium text-yellow-400">COMPATIBILITY MODE</span>
            </div>
            <p className="text-xs text-yellow-300">
              Using project-based messaging (advanced features unavailable)
            </p>
          </div>
        )}

        {/* Server Status */}
        {isServerHealthy === false && (
          <div className="bg-red-500/10 border-b border-red-500/20 p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="w-4 h-4 text-red-400" />
              <span className="text-xs font-medium text-red-400">SERVER OFFLINE</span>
            </div>
            <p className="text-xs text-red-300">
              Cannot connect to backend server
            </p>
          </div>
        )}

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <p className="text-red-400 text-sm">{error}</p>
              {error.includes("Cannot connect") && (
                <button
                  onClick={retryConnection}
                  disabled={isRetrying}
                  className="mt-2 px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs rounded transition-colors disabled:opacity-50"
                >
                  {isRetrying ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
                      Retrying...
                    </>
                  ) : (
                    "Retry Connection"
                  )}
                </button>
              )}
            </div>
          )}

          {messages.length === 0 && projectStatus === "loading" ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="p-4 bg-slate-800/30 rounded-full mb-4">
                <Loader2 className="w-8 h-8 text-white animate-spin" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">
                {existingProject ? "Loading Project" : "Generating Code"}
              </h3>
              <p className="text-slate-400 max-w-sm text-sm">
                {existingProject
                  ? "Loading your project preview..."
                  : "We are generating code files please wait"}
              </p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="p-4 bg-slate-800/30 rounded-full mb-4">
                <Code className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">
                Ready to Chat
              </h3>
              <p className="text-slate-400 max-w-sm text-sm">
                Start describing changes you'd like to make to your project
              </p>
            </div>
          ) : (
            <>
              {messages
                .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
                .map((message) => (
                  <div
                    key={message.id}
                    className={`p-3 rounded-lg ${
                      message.type === "user"
                        ? "bg-blue-600/20 ml-4"
                        : "bg-slate-800/30 mr-4"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <p className="text-white text-sm flex-1">
                        {message.content}
                        {message.isStreaming && (
                          <span className="inline-block w-2 h-4 bg-blue-500 ml-1 animate-pulse"></span>
                        )}
                      </p>
                      {message.isStreaming && (
                        <Loader2 className="w-3 h-3 text-slate-400 animate-spin mt-0.5" />
                      )}
                    </div>
                    <span className="text-xs text-slate-400 mt-1 block">
                      {message.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 bg-black/30 backdrop-blur-sm border-t border-slate-700/50">
          <div className="relative">
            <textarea
              className="w-full bg-black/50 border border-slate-600/50 rounded-xl text-white p-3 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 resize-none transition-all duration-200 placeholder-slate-400 text-sm"
              value={prompt}
              onChange={handlePromptChange}
              onKeyPress={handleKeyPress}
              placeholder={isServerHealthy === false ? "Server offline..." : "Describe changes..."}
              rows={2}
              disabled={isLoading || projectStatus === "loading" || isStreamingResponse || isServerHealthy === false}
              maxLength={1000}
            />
            <button
              onClick={handleSubmit}
              disabled={
                !prompt.trim() || 
                isLoading || 
                projectStatus === "loading" || 
                isStreamingResponse || 
                isServerHealthy === false
              }
              className="absolute bottom-2 right-2 p-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg transition-colors duration-200"
            >
              {isLoading || isStreamingResponse ? (
                <Loader2 className="w-4 h-4 text-white animate-spin" />
              ) : (
                <Send className="w-4 h-4 text-white" />
              )}
            </button>
          </div>
          <div className="flex items-center justify-between mt-2 text-xs text-slate-400">
            <span>
              {isServerHealthy === false 
                ? "Server offline - check connection" 
                : "Enter to send, Shift+Enter for new line"
              }
            </span>
            <span>{prompt.length}/1000</span>
          </div>
        </div>
      </div>

      {/* Preview Section - 75% width */}
      <div className="w-3/4 flex flex-col bg-slate-900/50">
        {/* Preview Header */}
        <div className="bg-black/50 backdrop-blur-sm border-b border-slate-700/50 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Live Preview</h2>
            <div className="flex items-center gap-4">
              {sessionId && (
                <span className="text-xs text-slate-400">
                  Session: {sessionId.slice(0, 8)}...
                </span>
              )}
              {projectId && (
                <span className="text-xs text-slate-400">
                  Project: {projectId}
                </span>
              )}
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full ${
                    isServerHealthy === false
                      ? "bg-red-500"
                      : projectStatus === "ready"
                      ? "bg-green-500"
                      : projectStatus === "loading"
                      ? "bg-yellow-500"
                      : projectStatus === "error"
                      ? "bg-red-500"
                      : "bg-gray-500"
                  }`}
                ></div>
                <span className="text-xs text-slate-400 capitalize">
                  {isServerHealthy === false ? "offline" : projectStatus}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Preview Content */}
        <div className="flex-1 p-4">
          <div className="w-full h-full bg-white rounded-lg shadow-2xl overflow-hidden">
            {previewUrl && isServerHealthy !== false ? (
              <iframe
                src={previewUrl}
                className="w-full h-full"
                title="Live Preview"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                onError={(e) => {
                  console.error("Iframe load error:", e);
                  setError("Failed to load preview. The deployment might not be ready yet.");
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-50">
                <div className="text-center max-w-md">
                  <div className="w-16 h-16 bg-slate-200 rounded-lg mx-auto mb-4 flex items-center justify-center">
                    {isServerHealthy === false ? (
                      <AlertCircle className="w-8 h-8 text-red-400" />
                    ) : isGenerating.current || projectStatus === "loading" ? (
                      <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
                    ) : (
                      <Code className="w-8 h-8 text-slate-400" />
                    )}
                  </div>
                  <p className="text-slate-600 mb-4">
                    {isServerHealthy === false
                      ? "Server is offline - cannot load preview"
                      : isGenerating.current
                      ? existingProject
                        ? "Loading preview..."
                        : "Generating preview..."
                      : projectStatus === "error"
                      ? "Failed to load preview"
                      : "Preview will appear here"}
                  </p>
                  {isServerHealthy === false && (
                    <button
                      onClick={retryConnection}
                      disabled={isRetrying}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white rounded-lg transition-colors text-sm"
                    >
                      {isRetrying ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                          Reconnecting...
                        </>
                      ) : (
                        "Retry Connection"
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;