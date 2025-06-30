import React, {
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { MyContext } from "../context/FrontendStructureContext";
import axios from "axios";
import { Send, Code, Loader2, MessageSquare, History } from "lucide-react";
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

  // Initialize or get session
  const initializeSession = useCallback(async () => {
    try {
      let currentSessionId = initialSessionId || sessionId;
      
      if (!currentSessionId) {
        const response = await axios.post(`${baseUrl}/api/session/create`, {
          projectId: projectId || null,
        });
        currentSessionId = response.data.sessionId;
        setSessionId(currentSessionId);
      }

      // Load existing conversation if session exists
      if (currentSessionId) {
        await loadConversationHistory(currentSessionId);
        await loadCurrentSummary(currentSessionId);
        await loadConversationStats(currentSessionId);
      }

      return currentSessionId;
    } catch (error) {
      console.error("Error initializing session:", error);
      setError("Failed to initialize chat session");
      return null;
    }
  }, [baseUrl, projectId, initialSessionId, sessionId]);

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
  }, [baseUrl, messages.length, loadCurrentSummary, loadConversationStats]);

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
        setError("Failed to load project");
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
          sessionId: sessionId,
        });

        setPreviewUrl(response.data.previewUrl);
        if (projId && response.data.previewUrl) {
          await axios.put(`${baseUrl}/api/projects/${projId}`, {
            deploymentUrl: response.data.previewUrl,
            status: "ready",
          });
        }
        setProjectStatus("ready");
      } catch (error) {
        console.error("Error generating code:", error);
        setError("Failed to generate code. Please try again.");
        setProjectStatus("error");
      } finally {
        isGenerating.current = false;
      }
    },
    [baseUrl, sessionId]
  );

  // Initialize component only once
  useEffect(() => {
    if (hasInitialized.current) return;

    const initializeProject = async () => {
      const currentSessionId = await initializeSession();
      
      if (existingProject && projectId) {
        await fetchProjectDeploymentUrl(projectId);
      } else if (navPrompt && projectId && currentSessionId) {
        setPrompt(navPrompt);
        await generateCode(navPrompt, projectId);
      } else {
        setProjectStatus("idle");
      }
      hasInitialized.current = true;
    };

    initializeProject();
  }, []);

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
        prev.filter((msg) => msg.id !== `streaming-${Date.now()}`)
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
  }, [baseUrl, value]);

  // Handle user prompt for code changes
  const handleSubmit = useCallback(async () => {
    if (!prompt.trim() || isLoading || !sessionId) return;

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

    try {
      // Save user message to conversation
      await axios.post(`${baseUrl}/api/conversation/messages`, {
        sessionId,
        message: {
          role: "user",
          content: currentPrompt,
        },
      });

      // Use streaming response for better UX
      await handleStreamingResponse(currentPrompt, sessionId);

      // Check if summary needs to be updated
      await checkAndUpdateSummary(sessionId);

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
    } finally {
      setIsLoading(false);
    }
  }, [prompt, isLoading, sessionId, baseUrl, checkAndUpdateSummary, handleStreamingResponse]);

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

  // Clear conversation
  const clearConversation = useCallback(async () => {
    if (!sessionId) return;
    
    try {
      await axios.delete(`${baseUrl}/api/conversation/conversation?sessionId=${sessionId}`);
      setMessages([]);
      setCurrentSummary(null);
      setConversationStats(null);
      messageCountRef.current = 0;
    } catch (error) {
      console.error("Error clearing conversation:", error);
      setError("Failed to clear conversation");
    }
  }, [baseUrl, sessionId]);

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

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <p className="text-red-400 text-sm">{error}</p>
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
              placeholder="Describe changes..."
              rows={2}
              disabled={isLoading || projectStatus === "loading" || isStreamingResponse}
              maxLength={1000}
            />
            <button
              onClick={handleSubmit}
              disabled={
                !prompt.trim() || isLoading || projectStatus === "loading" || isStreamingResponse
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
            <span>Enter to send, Shift+Enter for new line</span>
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
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full ${
                    projectStatus === "ready"
                      ? "bg-green-500"
                      : projectStatus === "loading"
                      ? "bg-yellow-500"
                      : projectStatus === "error"
                      ? "bg-red-500"
                      : "bg-gray-500"
                  }`}
                ></div>
                <span className="text-xs text-slate-400 capitalize">
                  {projectStatus}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Preview Content */}
        <div className="flex-1 p-4">
          <div className="w-full h-full bg-white rounded-lg shadow-2xl overflow-hidden">
            {previewUrl ? (
              <iframe
                src={previewUrl}
                className="w-full h-full"
                title="Live Preview"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-50">
                <div className="text-center">
                  <div className="w-16 h-16 bg-slate-200 rounded-lg mx-auto mb-4 flex items-center justify-center">
                    {isGenerating.current ? (
                      <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
                    ) : (
                      <Code className="w-8 h-8 text-slate-400" />
                    )}
                  </div>
                  <p className="text-slate-600">
                    {isGenerating.current
                      ? existingProject
                        ? "Loading preview..."
                        : "Generating preview..."
                      : projectStatus === "error"
                      ? "Failed to load preview"
                      : "Preview will appear here"}
                  </p>
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