import React, {
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { MyContext } from "../context/FrontendStructureContext";
import axios from "axios";
import { Send, Code, Loader2, MessageSquare, History, RefreshCw, AlertCircle, ExternalLink, Zap, FileText, Palette, Globe, CheckCircle } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

type ProjectInfo = {
  id: number | null;
  name: string | null;
  matchReason: string | null;
  isVerified: boolean;
};

interface LocationState {
  prompt?: string;
  projectId?: number;
  existingProject?: boolean;
  sessionId?: string;
}

interface Project {
  id: number;
  name?: string;
  description?: string;
  deploymentUrl?: string;
  status?: "pending" | "building" | "ready" | "error";
  createdAt?: string;
  updatedAt?: string;
}

interface Message {
  id: string;
  content: string;
  type: "user" | "assistant" | "system";
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

interface BuildStep {
  id: number;
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  completed: boolean;
  inProgress: boolean;
}

const ChatPage: React.FC = () => {
  const context = useContext(MyContext);
  const { value } = context as ContextValue;
  const navigate = useNavigate();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [projectStatus, setProjectStatus] = useState<
    "idle" | "loading" | "ready" | "error" | "fetching"
  >("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentSummary, setCurrentSummary] = useState<ConversationSummary | null>(null);
  const [conversationStats, setConversationStats] = useState<ConversationStats | null>(null);
  const [isStreamingResponse, setIsStreamingResponse] = useState(false);
  const [hasSessionSupport, setHasSessionSupport] = useState(true);
  const [isServerHealthy, setIsServerHealthy] = useState<boolean | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  
  // NEW: Build progress states
  const [buildSteps, setBuildSteps] = useState<BuildStep[]>([
    { id: 1, title: "Analyzing Requirements", description: "Understanding your prompt and requirements", icon: FileText, completed: false, inProgress: false },
    { id: 2, title: "Generating Code", description: "Creating React components and logic", icon: Code, completed: false, inProgress: false },
    { id: 3, title: "Styling Interface", description: "Applying beautiful designs and layouts", icon: Palette, completed: false, inProgress: false },
    { id: 4, title: "Optimizing Performance", description: "Enhancing speed and responsiveness", icon: Zap, completed: false, inProgress: false },
    { id: 5, title: "Deploying Project", description: "Making your app live and accessible", icon: Globe, completed: false, inProgress: false }
  ]);
  const [currentBuildStep, setCurrentBuildStep] = useState(0);
  const [showBuildProgress, setShowBuildProgress] = useState(false);
  
  // NEW: Project matching state
  const [currentProjectInfo, setCurrentProjectInfo] = useState<ProjectInfo>({
    id: null,
    name: null,
    matchReason: null,
    isVerified: false,
  });

  // Refs to prevent duplicate API calls
  const hasInitialized = useRef(false);
  const isGenerating = useRef(false);
  const currentProjectId = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageCountRef = useRef(0);
  const sessionInitialized = useRef(false);
  const projectLoaded = useRef(false);
  const healthCheckDone = useRef(false);
  const buildProgressInterval = useRef<NodeJS.Timeout | null>(null);

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

  // NEW: Build progress simulation
  const startBuildProgress = useCallback(() => {
    setShowBuildProgress(true);
    setCurrentBuildStep(0);
    
    // Reset all steps
    setBuildSteps(prev => prev.map(step => ({ ...step, completed: false, inProgress: false })));
    
    // Add initial system message
    const buildStartMessage: Message = {
      id: `build-start-${Date.now()}`,
      content: "🐕 CodePup is starting to build your project! Woof woof! Let me work my magic...",
      type: "system",
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, buildStartMessage]);

    let stepIndex = 0;
    
    buildProgressInterval.current = setInterval(() => {
      if (stepIndex < buildSteps.length) {
        // Mark current step as in progress
        setBuildSteps(prev => prev.map((step, index) => ({
          ...step,
          inProgress: index === stepIndex,
          completed: index < stepIndex
        })));
        
        setCurrentBuildStep(stepIndex);
        
        // Add step message
        const stepMessage: Message = {
          id: `build-step-${stepIndex}-${Date.now()}`,
          content: `🔨 ${buildSteps[stepIndex].title}: ${buildSteps[stepIndex].description}`,
          type: "system",
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, stepMessage]);
        
        stepIndex++;
      } else {
        // Complete all steps
        setBuildSteps(prev => prev.map(step => ({ ...step, completed: true, inProgress: false })));
        
        const completionMessage: Message = {
          id: `build-complete-${Date.now()}`,
          content: "✨ Build complete! Your project is ready to preview. CodePup did a great job! 🎉",
          type: "system",
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, completionMessage]);
        
        if (buildProgressInterval.current) {
          clearInterval(buildProgressInterval.current);
          buildProgressInterval.current = null;
        }
        
        // Hide progress after a short delay
        setTimeout(() => {
          setShowBuildProgress(false);
        }, 30000);
      }
    }, 30000); // 2 seconds per step
  }, [buildSteps]);

  const stopBuildProgress = useCallback(() => {
    if (buildProgressInterval.current) {
      clearInterval(buildProgressInterval.current);
      buildProgressInterval.current = null;
    }
    setShowBuildProgress(false);
    setBuildSteps(prev => prev.map(step => ({ ...step, completed: true, inProgress: false })));
  }, []);

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (buildProgressInterval.current) {
        clearInterval(buildProgressInterval.current);
      }
    };
  }, []);

  // NEW: Get deployed app URL from current context
  const getDeployedAppUrl = useCallback((): string | undefined => {
    // Priority 1: Use preview URL if it's a deployed URL
    if (previewUrl && !previewUrl.includes('localhost')) {
      return previewUrl;
    }
    
    // Priority 2: Check if current page is on a deployed domain
    const hostname = window.location.hostname;
    
    if (hostname.includes('azurestaticapps.net') || 
        hostname.includes('ashy-') || // Azure Static Web Apps pattern
        hostname.includes('netlify.app') ||
        hostname.includes('vercel.app') ||
        !hostname.includes('localhost')) {
      return window.location.origin;
    }
    
    // Priority 3: Check stored project data
    const storedProject = sessionStorage.getItem('currentProject');
    if (storedProject) {
      try {
        const project = JSON.parse(storedProject);
        return project.deploymentUrl;
      } catch (e) {
        console.warn('Failed to parse stored project data');
      }
    }
    
    // Priority 4: Check URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const deployedUrl = urlParams.get('deployedUrl');
    if (deployedUrl) {
      return deployedUrl;
    }
    
    return undefined;
  }, [previewUrl]);

  // NEW: Get current user ID (replace with your actual auth logic)
  const getCurrentUserId = useCallback((): number => {
    // TODO: Replace with your actual authentication system
    const storedUserId = localStorage.getItem('userId');
    if (storedUserId && !isNaN(parseInt(storedUserId))) {
      return parseInt(storedUserId);
    }
    return 1;
  }, []);
  
  const getprojectId = useCallback((): number|null => {
    // TODO: Replace with your actual authentication system
    const storedProjectId = localStorage.getItem('projectId');
    if (storedProjectId && !isNaN(parseInt(storedProjectId))) {
      return parseInt(storedProjectId);
    }
    return null;
  }, []);

  // NEW: Verify project by URL
 const verifyProjectByUrl = useCallback(async (): Promise<{
  hasMatch: boolean;
  project: any | null;
  matchReason: string;
}> => {
  const deployedUrl = getDeployedAppUrl();
  const projectId = getprojectId();

  if (!deployedUrl || !projectId) {
    return {
      hasMatch: false,
      project: null,
      matchReason: 'no_deployed_url'
    };
  }

  try {
    console.log(`🔍 Verifying project for URL: ${deployedUrl}`);
    const userId = getCurrentUserId();

    const response = await axios.get(
      `${baseUrl}/api/modify/stream/verify-url/${userId}?url=${encodeURIComponent(deployedUrl)}&projectId=${projectId}`,
      { timeout: 5000 }
    );

    const result = response.data;

    if (result.success && result.data.hasMatch) {
      console.log('✅ Project verified for current URL:', result.data.project.name);
      setCurrentProjectInfo({
        id: result.data.project.id,
        name: result.data.project.name,
        matchReason: 'url_match',
        isVerified: true
      });

      return {
        hasMatch: true,
        project: result.data.project,
        matchReason: 'url_match'
      };
    } else {
      console.log('⚠️ No project found for current URL');
      setCurrentProjectInfo({
        id: null,
        name: null,
        matchReason: 'no_url_match',
        isVerified: true
      });

      return {
        hasMatch: false,
        project: null,
        matchReason: 'no_url_match'
      };
    }
  } catch (error) {
    console.error('❌ Failed to verify project by URL:', error);
    setCurrentProjectInfo({
      id: null,
      name: null,
      matchReason: 'verification_error',
      isVerified: false
    });

    return {
      hasMatch: false,
      project: null,
      matchReason: 'verification_error'
    };
  }
}, [baseUrl, getDeployedAppUrl, getCurrentUserId]);

  // Server health check
  const checkServerHealth = useCallback(async () => {
    if (healthCheckDone.current) {
      return isServerHealthy;
    }

    try {
      console.log("🔍 Checking server health...");
      const healthResponse = await axios.get(`${baseUrl}/health`, { 
        timeout: 5000 
      });
      console.log("✅ Server is running:", healthResponse.data);
      setIsServerHealthy(true);
      setError("");
      healthCheckDone.current = true;
      return true;
    } catch (error) {
      console.error("❌ Server health check failed:", error);
      setIsServerHealthy(false);
      healthCheckDone.current = true;
      
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
  }, [baseUrl, isServerHealthy]);

  // Enhanced function to fetch project details and deployment URL
  const fetchReadyProject = useCallback(
    async (projId: number) => {
      if (currentProjectId.current === projId && projectStatus !== "idle") {
        return;
      }
      
      setError("");
      setProjectStatus("fetching");
      currentProjectId.current = projId;

      try {
        console.log(`🔍 Fetching project details for ID: ${projId}`);
        
        const res = await axios.get<Project>(`${baseUrl}/api/projects/${projId}`);
        const project = res.data;
        
        console.log("📋 Project details:", project);
        setCurrentProject(project);

        // Check project status and handle accordingly
        if (project.status === "ready" && project.deploymentUrl) {
          console.log("✅ Project is ready with deployment URL:", project.deploymentUrl);
          setPreviewUrl(project.deploymentUrl);
          setProjectStatus("ready");
          stopBuildProgress();
        } else if (project.status === "building") {
          console.log("🔨 Project is still building, will poll for updates");
          setProjectStatus("loading");
          startBuildProgress();
          // Start polling for project readiness
          await pollProjectStatus(projId);
        } else if (project.status === "pending") {
          console.log("⏳ Project is pending, waiting for build to start");
          setProjectStatus("loading");
          startBuildProgress();
          await pollProjectStatus(projId);
        } else if (project.status === "error") {
          // NEW: Check if there's no deployed URL - means build failed on first go
          if (!project.deploymentUrl) {
            console.log("❌ Build failed on first attempt - no deployed URL found, redirecting to index");
            stopBuildProgress();
            navigate("/");
            return;
          }
          setError("Project build failed. Please try regenerating the project.");
          setProjectStatus("error");
          stopBuildProgress();
        } else {
          // Project exists but no deployment URL yet
          console.log("📝 Project found but deployment not ready, starting build...");
          
          // Try to trigger a build if there's a prompt available
          if (navPrompt) {
            console.log("🚀 Triggering build with navigation prompt");
            startBuildProgress();
            await generateCode(navPrompt, projId);
          } else {
            setError("Project found, but deployment is not ready and no prompt available to rebuild.");
            setProjectStatus("error");
            stopBuildProgress();
          }
        }
      } catch (error) {
        console.error("❌ Error fetching project:", error);
        stopBuildProgress();
        
        if (axios.isAxiosError(error)) {
          if (error.response?.status === 404) {
            setError(`Project with ID ${projId} not found.`);
          } else if (error.code === 'ERR_NETWORK') {
            setError("Cannot connect to server");
          } else {
            setError(`Failed to load project: ${error.response?.data?.message || error.message}`);
          }
        } else {
          setError("Failed to load project due to an unexpected error");
        }
        setProjectStatus("error");
      }
    },
    [baseUrl, projectStatus, navPrompt, navigate, startBuildProgress, stopBuildProgress]
  );

  // Poll project status until it's ready
  const pollProjectStatus = useCallback(
    async (projId: number, maxAttempts: number = 30) => {
      let attempts = 0;
      
      const poll = async (): Promise<void> => {
        try {
          attempts++;
          console.log(`🔄 Polling project status (attempt ${attempts}/${maxAttempts})`);
          
          const res = await axios.get<Project>(`${baseUrl}/api/projects/${projId}`);
          const project = res.data;
          
          setCurrentProject(project);
          
          if (project.status === "ready" && project.deploymentUrl) {
            console.log("✅ Project is now ready!");
            setPreviewUrl(project.deploymentUrl);
            setProjectStatus("ready");
            stopBuildProgress();
            return;
          } else if (project.status === "error") {
            // NEW: Check if there's no deployed URL during polling - means build failed
            if (!project.deploymentUrl) {
              console.log("❌ Build failed during polling - no deployed URL found, redirecting to index");
              stopBuildProgress();
              navigate("/");
              return;
            }
            setError("Project build failed during polling.");
            setProjectStatus("error");
            stopBuildProgress();
            return;
          } else if (attempts >= maxAttempts) {
            setError("Project is taking too long to build. Please check back later.");
            setProjectStatus("error");
            stopBuildProgress();
            return;
          }
          
          // Continue polling
          setTimeout(poll, 3000); // Poll every 3 seconds
        } catch (error) {
          console.error("Error during polling:", error);
          if (attempts >= maxAttempts) {
            setError("Failed to check project status");
            setProjectStatus("error");
            stopBuildProgress();
          } else {
            setTimeout(poll, 5000); // Retry with longer interval
          }
        }
      };
      
      poll();
    },
    [baseUrl, navigate, stopBuildProgress]
  );

  // Initialize or get session
  const initializeSession = useCallback(async () => {
    if (sessionInitialized.current) {
      console.log("🔄 Session already initialized, skipping...");
      return sessionId;
    }

    try {
      console.log("🚀 Initializing session...");
      let currentSessionId = initialSessionId || sessionId;
      
      if (!currentSessionId) {
        try {
          console.log("📡 Creating new session...");
          const response = await axios.post(`${baseUrl}/api/session/create`, {
            projectId: projectId || null,
          });
          currentSessionId = response.data.sessionId;
          setSessionId(currentSessionId);
          setHasSessionSupport(true);
          console.log("✅ Session created:", currentSessionId);
        } catch (sessionError) {
          console.warn("⚠️ Session endpoint not available, using project-based messaging");
          setHasSessionSupport(false);
          // Use project-based session ID
          currentSessionId = projectId ? `project-${projectId}` : `temp-${Date.now()}`;
          setSessionId(currentSessionId);
        }
      }

      sessionInitialized.current = true;

      // Load existing conversation if session exists and session API is working
      if (currentSessionId && hasSessionSupport && !currentSessionId.startsWith('temp-') && !currentSessionId.startsWith('project-')) {
        try {
          console.log("📚 Loading conversation history...");
          await loadConversationHistory(currentSessionId);
          await loadCurrentSummary(currentSessionId);
          await loadConversationStats(currentSessionId);
        } catch (error) {
          console.warn("Could not load conversation history:", error);
        }
      } else if (projectId && !projectLoaded.current) {
        // Try to load project-based messages - ONLY ONCE
        try {
          console.log("📋 Loading project messages...");
          await loadProjectMessages(projectId);
          projectLoaded.current = true;
        } catch (error) {
          console.warn("Could not load project messages:", error);
          projectLoaded.current = true; // Mark as attempted even if failed
        }
      }

      return currentSessionId;
    } catch (error) {
      console.error("Error initializing session:", error);
      setError("Failed to initialize chat session");
      sessionInitialized.current = true; // Mark as attempted
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
      console.log(`✅ Loaded ${formattedMessages.length} conversation messages`);
    } catch (error) {
      console.error("Error loading conversation history:", error);
    }
  }, [baseUrl]);

  // Load project messages (enhanced with better error handling)
  const loadProjectMessages = useCallback(async (projectId: number) => {
    if (projectLoaded.current) {
      console.log("🔄 Project messages already loaded, skipping...");
      return;
    }

    try {
      console.log(`📋 Loading messages for project ${projectId}...`);
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
        console.log(`✅ Loaded ${formattedMessages.length} project messages`);
      } else {
        console.log("📭 No messages found for project:", projectId);
        setMessages([]);
      }
      projectLoaded.current = true;
    } catch (error) {
      console.error("Error loading project messages:", error);
      projectLoaded.current = true; // Mark as attempted even if failed
      
      // Enhanced error handling
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          console.log(`📭 Project ${projectId} messages not found, starting fresh`);
          setMessages([]);
        } else if (error.code === 'ERR_NETWORK') {
          console.error("🔌 Network error loading project messages");
        } else {
          console.warn(`⚠️ Failed to load project messages: ${error.response?.data?.error || error.message}`);
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

  // Memoized function to generate code
  const generateCode = useCallback(
    async (userPrompt: string, projId?: number) => {
      if (isGenerating.current) {
        console.log("🔄 Code generation already in progress, skipping...");
        return;
      }

      isGenerating.current = true;
      setError("");
      setProjectStatus("loading");
      startBuildProgress();

      try {
        console.log(`🎨 Generating code for prompt: "${userPrompt}"`);
        const response = await axios.post(`${baseUrl}/api/generate`, {
          prompt: userPrompt,
          projectId: projId,
        });

        setPreviewUrl(response.data.previewUrl);
        setProjectStatus("ready");
        stopBuildProgress();
        console.log("✅ Code generated successfully:", response.data.previewUrl);

        // Update project if needed
        if (projId && response.data.previewUrl) {
          try {
            await axios.put(`${baseUrl}/api/projects/${projId}`, {
              deploymentUrl: response.data.previewUrl,
              status: "ready",
            });
            
            // Refresh project details
            const updatedProject = await axios.get<Project>(`${baseUrl}/api/projects/${projId}`);
            setCurrentProject(updatedProject.data);
          } catch (updateError) {
            console.warn("Could not update project:", updateError);
          }
        }
      } catch (error) {
        console.error("Error generating code:", error);
        stopBuildProgress();
        
        if (axios.isAxiosError(error) && error.code === 'ERR_NETWORK') {
          setError("Cannot connect to server. Please check if the backend is running.");
        } else {
          setError("Failed to generate code. Please try again.");
        }
        setProjectStatus("error");
        
        // NEW: If code generation fails and there's no existing deployed URL, redirect to index
        if (projId) {
          try {
            const res = await axios.get<Project>(`${baseUrl}/api/projects/${projId}`);
            if (!res.data.deploymentUrl) {
              console.log("❌ Code generation failed and no deployed URL exists, redirecting to index");
              navigate("/");
              return;
            }
          } catch (fetchError) {
            console.log("❌ Could not fetch project after generation failure, redirecting to index");
            navigate("/");
            return;
          }
        }
      } finally {
        isGenerating.current = false;
      }
    },
    [baseUrl, navigate, startBuildProgress, stopBuildProgress]
  );

  // Check if we should run initialization
  const shouldInitialize = useCallback(() => {
    return !hasInitialized.current && (navPrompt || existingProject);
  }, [navPrompt, existingProject]);

  // Retry connection with loading state
  const retryConnection = useCallback(async () => {
    setIsRetrying(true);
    setError("");
    setProjectStatus("loading");
    
    // Reset all refs
    healthCheckDone.current = false;
    sessionInitialized.current = false;
    projectLoaded.current = false;
    hasInitialized.current = false;
    
    try {
      const isHealthy = await checkServerHealth();
      if (isHealthy) {
        // Retry initialization
        await initializeSession();
        
        if (existingProject && projectId) {
          await fetchReadyProject(projectId);
        } else if (navPrompt && projectId) {
          setPrompt(navPrompt);
          await generateCode(navPrompt, projectId);
        } else {
          setProjectStatus("idle");
        }
        hasInitialized.current = true;
      }
    } catch (error) {
      setError("Still cannot connect to server. Please check your backend setup.");
      setProjectStatus("error");
    } finally {
      setIsRetrying(false);
    }
  }, [checkServerHealth, initializeSession, fetchReadyProject, generateCode, existingProject, projectId, navPrompt]);

  // MAIN INITIALIZATION
  useEffect(() => {
    if (!shouldInitialize()) {
      console.log("🔄 Skipping initialization - no new generation or existing project load needed");
      
      // If we have projectId but no navPrompt and not existingProject, just load the existing preview
      if (projectId && !navPrompt && !existingProject && !hasInitialized.current) {
        console.log("🔍 Loading existing project preview only...");
        hasInitialized.current = true;
        
        const loadExistingPreview = async () => {
          const serverHealthy = await checkServerHealth();
          if (serverHealthy) {
            await initializeSession();
            await fetchReadyProject(projectId);
            
            // Verify if this matches current URL
            await verifyProjectByUrl();
          }
        };
        
        loadExistingPreview();
      }
      
      return;
    }

    hasInitialized.current = true;
    
    const initializeWithHealthCheck = async () => {
      console.log("🚀 Starting ChatPage initialization...");
      
      // Check server health first
      const serverHealthy = await checkServerHealth();
      if (!serverHealthy) {
        setProjectStatus("error");
        return;
      }

      // Initialize session
      await initializeSession();
      
      // Verify project by URL before loading
      const urlVerification = await verifyProjectByUrl();
      
      // Handle project loading with URL context
      if (existingProject && projectId) {
        console.log("📂 Loading existing project...");
        await fetchReadyProject(projectId);
        
        // Check if loaded project matches URL
        if (!urlVerification.hasMatch && urlVerification.matchReason === 'no_url_match') {
          console.warn("⚠️ Loaded project doesn't match current URL context");
        }
      } else if (navPrompt && projectId) {
        console.log("🎨 Generating new project...");
        setPrompt(navPrompt);
        await generateCode(navPrompt, projectId);
      } else {
        console.log("⭐ Ready for user input");
        setProjectStatus("idle");
      }
      
      console.log("✅ ChatPage initialization complete");
    };

    initializeWithHealthCheck();
  }, [shouldInitialize, checkServerHealth, initializeSession, fetchReadyProject, generateCode, existingProject, projectId, navPrompt, verifyProjectByUrl]);

  // Refresh preview URL after modifications
  const refreshPreviewUrl = useCallback(async () => {
    if (!projectId) return;
    
    try {
      console.log("🔄 Refreshing preview URL...");
      const res = await axios.get<Project>(`${baseUrl}/api/projects/${projectId}`);
      const project = res.data;
      
      if (project.deploymentUrl && project.deploymentUrl !== previewUrl) {
        console.log("🔄 Preview URL updated:", project.deploymentUrl);
        setPreviewUrl(project.deploymentUrl);
        setCurrentProject(project);
        
        // Add a small delay to ensure the new deployment is ready
        setTimeout(() => {
          const iframe = document.querySelector('iframe');
          if (iframe) {
            iframe.src = iframe.src; // Force refresh iframe
          }
        }, 1000);
      }
    } catch (error) {
      console.warn("Could not refresh preview URL:", error);
    }
  }, [baseUrl, projectId, previewUrl]);

  // Enhanced streaming response with URL context
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

      // Include URL context in request
      const deployedUrl = getDeployedAppUrl();
      const userId = getCurrentUserId();
      
      console.log('🚀 Sending modification request with URL context:', {
        prompt: currentPrompt.substring(0, 50) + '...',
        sessionId: currentSessionId,
        userId: userId,
        projectId: currentProjectInfo.id || projectId,
        currentUrl: window.location.href,
        deployedUrl: deployedUrl
      });

      const response = await fetch(`${baseUrl}/api/modify/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: currentPrompt,
          sessionId: currentSessionId,
          userId: userId,
          projectId: currentProjectInfo.id || projectId,
          currentUrl: window.location.href,
          deployedUrl: deployedUrl,
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
      let lastProjectInfo: any = null;
      
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;

        const text = new TextDecoder().decode(chunk);
        const lines = text.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              // Handle progress events with project info
              if (data.message && data.projectId) {
                lastProjectInfo = {
                  id: data.projectId,
                  name: data.projectName,
                  matchReason: data.matchReason
                };
              }
              
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

      // Update project info if we got it from the response
      if (lastProjectInfo) {
        setCurrentProjectInfo({
          id: lastProjectInfo.id,
          name: lastProjectInfo.name,
          matchReason: lastProjectInfo.matchReason,
          isVerified: true
        });
      }

      // Finalize the streaming message
      setMessages((prev) => 
        prev.map((msg) => 
          msg.id === streamingMessage.id 
            ? { ...msg, isStreaming: false }
            : msg
        )
      );

      // Refresh preview after streaming completes
      await refreshPreviewUrl();

    } catch (error) {
      console.error("Error in streaming response:", error);
      
      // Remove streaming message and add error message
      setMessages((prev) => 
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
  }, [baseUrl, value, projectId, currentProjectInfo.id, refreshPreviewUrl, getDeployedAppUrl, getCurrentUserId]);

  // Save message to backend
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

  // Enhanced non-streaming submit with URL context
  const handleNonStreamingSubmit = useCallback(
    async (currentPrompt: string) => {
      try {
        const deployedUrl = getDeployedAppUrl();
        const userId = getCurrentUserId();

        console.log('🚀 Sending non-streaming modification request with URL context:', {
          prompt: currentPrompt.substring(0, 50) + '...',
          sessionId,
          userId,
          projectId: currentProjectInfo?.id || projectId,
          currentUrl: window.location.href,
          deployedUrl
        });

        const response = await axios.post(`${baseUrl}/api/modify`, {
          prompt: currentPrompt,
          sessionId,
          userId,
          projectId: currentProjectInfo?.id || projectId,
          currentUrl: window.location.href,
          deployedUrl,
          projectStructure: value,
        });

        let responseContent = "Changes applied successfully!";

        if (response.data && response.data.data) {
          const data = response.data.data;

          if (data.projectId && data.projectAction) {
            setCurrentProjectInfo((prev: ProjectInfo) => ({
              id: data.projectId,
              name: data.projectName || prev?.name,
              matchReason: data.projectMatchReason || data.projectAction,
              isVerified: true,
            }));
          }
        }

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

        // Refresh preview after modifications
        await refreshPreviewUrl();

      } catch (error: any) {
        console.error("❌ Error in non-streaming submission:", error.message || error);
        
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
    },
    [sessionId, currentProjectInfo, projectId, value, baseUrl, getDeployedAppUrl, getCurrentUserId, saveMessage, refreshPreviewUrl]
  );

  // Handle user prompt for code changes
  const handleSubmit = useCallback(async () => {
    if (!prompt.trim() || isLoading) return;

    setIsLoading(true);
    setError("");
    startBuildProgress();

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
      stopBuildProgress();
    }
  }, [prompt, isLoading, sessionId, hasSessionSupport, saveMessage, handleStreamingResponse, checkAndUpdateSummary, handleNonStreamingSubmit, startBuildProgress, stopBuildProgress]);

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

  // Function to refresh project details
  const refreshProject = useCallback(async () => {
    if (!projectId) return;
    
    setError("");
    await fetchReadyProject(projectId);
  }, [projectId, fetchReadyProject]);

  // NEW: CodePup Loading Component
  const CodePupLoading = () => (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <div className="relative mb-6">
        {/* Animated CodePup */}
        <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center relative animate-bounce">
          <div className="text-white text-lg font-bold">🐕</div>
          <div className="absolute -top-2 -right-2 w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center animate-pulse">
            <Code className="w-3 h-3 text-yellow-800" />
          </div>
        </div>
        
        {/* Floating particles */}
        <div className="absolute top-0 left-0 w-full h-full">
          <div className="absolute top-2 left-2 w-2 h-2 bg-blue-400 rounded-full animate-ping"></div>
          <div className="absolute bottom-2 right-2 w-2 h-2 bg-purple-400 rounded-full animate-ping animation-delay-300"></div>
          <div className="absolute top-4 right-4 w-1 h-1 bg-green-400 rounded-full animate-ping animation-delay-500"></div>
        </div>
      </div>
      
    <h3 className="text-2xl font-bold text-slate-800 mb-2">CodePup is Building! 🚀</h3>
<p className="text-slate-700 mb-4 max-w-sm text-lg">
        Your friendly coding companion is working hard to create something amazing for you!
      </p>
      
      {/* Animated typing dots */}
      <div className="flex items-center space-x-1 mb-6">
        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce animation-delay-200"></div>
        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce animation-delay-400"></div>
      </div>
      
      {/* Progress bar */}
      <div className="w-full max-w-sm bg-slate-700 rounded-full h-2 mb-4">
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full animate-pulse" style={{width: '70%'}}></div>
      </div>
      
      <p className="text-base text-slate-600 font-medium">
        Woof woof! Almost there... 🐾
      </p>
    </div>
  );

  return (
    <div className="w-full bg-gradient-to-br from-black via-neutral-950 to-black h-screen flex">
      {/* Chat Section - 25% width */}
      <div className="w-1/4 flex flex-col border-r border-slate-700/50">
        {/* Header */}
        <div className="bg-slate-black/50 backdrop-blur-sm border-b border-slate-700/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <a href="/" className="text-xl font-semibold text-white">
                CodePup
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
              {projectId && (
                <button
                  onClick={refreshProject}
                  className="p-1.5 text-slate-400 hover:text-white transition-colors"
                  title="Refresh project"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              )}
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

        {/* Project Info Section - Enhanced with URL verification */}
        {(currentProject || currentProjectInfo.isVerified) && (
          <div className="bg-slate-800/30 border-b border-slate-700/50 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Code className="w-4 h-4 text-green-400" />
              <span className="text-xs font-medium text-green-400">PROJECT</span>
              {currentProjectInfo.isVerified && (
                <div className={`w-2 h-2 rounded-full ${
                  currentProjectInfo.matchReason === 'url_match' ? 'bg-green-500' : 'bg-yellow-500'
                }`} title={`URL match: ${currentProjectInfo.matchReason}`}></div>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-sm text-white font-medium">
                {currentProject?.name || currentProjectInfo.name || `Project ${currentProject?.id || currentProjectInfo.id}`}
              </p>
              {currentProject?.description && (
                <p className="text-xs text-slate-300 line-clamp-2">
                  {currentProject.description}
                </p>
              )}
              {currentProjectInfo.matchReason && (
                <p className="text-xs text-slate-400">
                  Context: {currentProjectInfo.matchReason === 'url_match' ? 'URL verified' : 'No URL match'}
                </p>
              )}
              <div className="flex items-center justify-between">
                <span className={`text-xs px-2 py-1 rounded-full ${
                  currentProject?.status === 'ready' 
                    ? 'bg-green-500/20 text-green-400' 
                    : currentProject?.status === 'building'
                    ? 'bg-yellow-500/20 text-yellow-400'
                    : currentProject?.status === 'error'
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-gray-500/20 text-gray-400'
                }`}>
                  {currentProject?.status || 'unknown'}
                </span>
                {(currentProject?.deploymentUrl || previewUrl) && (
                  <a
                    href={currentProject?.deploymentUrl || previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 text-slate-400 hover:text-white transition-colors"
                    title="Open in new tab"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* NEW: Build Progress Section */}
        {showBuildProgress && (
          <div className="bg-blue-900/20 border-b border-blue-700/50 p-3">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-4 h-4 bg-blue-500 rounded-full animate-pulse"></div>
              <span className="text-xs font-medium text-blue-400">BUILDING PROJECT</span>
            </div>
            <div className="space-y-2">
              {buildSteps.map((step, index) => {
                const IconComponent = step.icon;
                return (
                  <div key={step.id} className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                      step.completed 
                        ? 'bg-green-500' 
                        : step.inProgress 
                        ? 'bg-blue-500 animate-pulse' 
                        : 'bg-slate-600'
                    }`}>
                      {step.completed ? (
                        <CheckCircle className="w-3 h-3 text-white" />
                      ) : step.inProgress ? (
                        <Loader2 className="w-3 h-3 text-white animate-spin" />
                      ) : (
                        <IconComponent className="w-3 h-3 text-slate-400" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className={`text-xs font-medium ${
                        step.completed 
                          ? 'text-green-400' 
                          : step.inProgress 
                          ? 'text-blue-400' 
                          : 'text-slate-500'
                      }`}>
                        {step.title}
                      </p>
                      <p className={`text-xs ${
                        step.completed 
                          ? 'text-green-300' 
                          : step.inProgress 
                          ? 'text-blue-300' 
                          : 'text-slate-600'
                      }`}>
                        {step.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 bg-slate-700 rounded-full h-2">
              <div 
                className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${((currentBuildStep + 1) / buildSteps.length) * 100}%` }}
              ></div>
            </div>
          </div>
        )}

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

          {messages.length === 0 && (projectStatus === "loading" || projectStatus === "fetching") ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="p-4 bg-slate-800/30 rounded-full mb-4">
                <Loader2 className="w-8 h-8 text-white animate-spin" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">
                {projectStatus === "fetching" 
                  ? "Fetching Project" 
                  : existingProject 
                    ? "Loading Project" 
                    : "CodePup is Building"}
              </h3>
              <p className="text-slate-400 max-w-sm text-sm">
                {projectStatus === "fetching"
                  ? "Fetching project details and deployment status..."
                  : existingProject
                    ? "Loading your project preview..."
                    : "Your friendly coding companion is generating code files"}
              </p>
              {currentProject && (
                <div className="mt-3 text-xs text-slate-500">
                  Project ID: {currentProject.id} • Status: {currentProject.status}
                </div>
              )}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="p-4 bg-slate-800/30 rounded-full mb-4">
                <div className="text-2xl">🐕</div>
              </div>
              <h3 className="text-lg font-medium text-white mb-2">
                CodePup is Ready!
              </h3>
              <p className="text-slate-400 max-w-sm text-sm">
                {currentProject && currentProject.status === 'ready' 
                  ? "Your project is ready! Start describing changes you'd like to make."
                  : "Start describing changes you'd like to make to your project"}
              </p>
              {(currentProject || currentProjectInfo.id) && (
                <div className="mt-3 text-xs text-slate-500">
                  Project: {currentProject?.name || currentProjectInfo.name || currentProject?.id || currentProjectInfo.id}
                </div>
              )}
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
                        : message.type === "system"
                        ? "bg-purple-600/20 mr-4"
                        : "bg-slate-800/30 mr-4"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {message.type === "system" && (
                        <div className="w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center mt-0.5">
                          <div className="text-xs">🐕</div>
                        </div>
                      )}
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
              placeholder={
                isServerHealthy === false 
                  ? "Server offline..." 
                  : currentProject?.status !== 'ready'
                    ? "Project not ready..."
                    : showBuildProgress
                    ? "CodePup is building..."
                    : "Describe changes..."
              }
              rows={2}
              disabled={
                isLoading || 
                projectStatus === "loading" || 
                projectStatus === "fetching" ||
                isStreamingResponse || 
                isServerHealthy === false ||
                showBuildProgress ||
                (currentProject && currentProject.status !== 'ready')
              }
              maxLength={1000}
            />
            <button
              onClick={handleSubmit}
              disabled={
                !prompt.trim() || 
                isLoading || 
                projectStatus === "loading" || 
                projectStatus === "fetching" ||
                isStreamingResponse || 
                isServerHealthy === false ||
                showBuildProgress ||
                (currentProject && currentProject.status !== 'ready')
              }
              className="absolute bottom-2 right-2 p-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg transition-colors duration-200"
            >
              {isLoading || isStreamingResponse || showBuildProgress ? (
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
                : currentProject?.status !== 'ready'
                  ? "Project not ready for modifications"
                  : showBuildProgress
                  ? "CodePup is building your project..."
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
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-white">Live Preview</h2>
              {showBuildProgress && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-blue-400">CodePup Building...</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              {sessionId && (
                <span className="text-xs text-slate-400">
                  Session: {sessionId.slice(0, 8)}...
                </span>
              )}
              {(projectId || currentProjectInfo.id) && (
                <span className="text-xs text-slate-400">
                  Project: {projectId || currentProjectInfo.id}
                </span>
              )}
              {previewUrl && (
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  Open in new tab
                </a>
              )}
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full ${
                    isServerHealthy === false
                      ? "bg-red-500"
                      : projectStatus === "ready"
                      ? "bg-green-500"
                      : projectStatus === "loading" || projectStatus === "fetching"
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
            {previewUrl && isServerHealthy !== false && !showBuildProgress ? (
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
                {showBuildProgress ? (
                  <CodePupLoading />
                ) : (
                  <div className="text-center max-w-md">
                    <div className="w-16 h-16 bg-slate-200 rounded-lg mx-auto mb-4 flex items-center justify-center">
                      {isServerHealthy === false ? (
                        <AlertCircle className="w-8 h-8 text-red-400" />
                      ) : isGenerating.current || projectStatus === "loading" || projectStatus === "fetching" ? (
                        <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
                      ) : (
                        <div className="text-2xl">🐕</div>
                      )}
                    </div>
                   <p className="text-slate-800 mb-4 text-lg font-medium">
                      {isServerHealthy === false
                        ? "Server is offline - cannot load preview"
                        : projectStatus === "fetching"
                        ? "Fetching project details..."
                        : isGenerating.current
                        ? existingProject
                          ? "Loading preview..."
                          : "CodePup is generating preview..."
                        : projectStatus === "error"
                        ? "Failed to load preview"
                        : currentProject?.status === 'building'
                        ? "CodePup is building your project - please wait..."
                        : currentProject?.status === 'pending'
                        ? "Project build is pending..."
                        : "Preview will appear here"}
                    </p>
                    {currentProject && currentProject.status && currentProject.status !== 'ready' && (
                    <div className="text-sm text-slate-700 mb-4 font-medium">
                        Project Status: {currentProject.status}
                        {currentProject.status === 'building' && (
                          <div className="mt-2">
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div className="bg-blue-600 h-2 rounded-full animate-pulse" style={{width: '60%'}}></div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {(isServerHealthy === false || projectStatus === "error") && (
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
                    {currentProject && currentProject.status !== 'ready' && currentProject.status !== 'error' && isServerHealthy !== false && (
                      <button
                        onClick={refreshProject}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm"
                      >
                        <RefreshCw className="w-4 h-4 inline mr-2" />
                        Refresh Status
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;