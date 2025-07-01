import React, { useEffect, useState, useCallback, useMemo } from "react";
import axios from "axios";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  useUser,
  UserButton,
} from "@clerk/clerk-react";

import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { ExternalLink, Calendar, Code2, Trash2, MessageSquare, Clock, Activity, AlertCircle } from "lucide-react";

// --- Types ---
interface Project {
  id: number;
  name: string;
  description?: string;
  deploymentUrl?: string;
  createdAt: string;
  updatedAt?: string;
  projectType?: string;
  status?: string;
  lastSessionId?: string;
  messageCount?: number;
}

interface DbUser {
  id: number;
  clerkId: string;
  email: string;
  name: string;
  phoneNumber: string | null;  // ✅ Now allows null
  profileImage?: string;       // Optional
}


interface SessionInfo {
  sessionId: string;
  messageCount: number;
  lastActivity: string;
  hasActiveConversation: boolean;
}

// --- Constants ---
const BASE_URL = import.meta.env.VITE_BASE_URL;

// --- Memoized Components ---
const ProjectCard = React.memo(
  ({
    project,
    onProjectClick,
    onDeleteProject,
    onContinueChat,
    sessionInfo,
    hasSessionSupport,
  }: {
    project: Project;
    onProjectClick: (project: Project) => void;
    onDeleteProject: (
      projectId: number,
      e: React.MouseEvent<HTMLButtonElement>
    ) => void;
    onContinueChat: (
      project: Project,
      e: React.MouseEvent<HTMLButtonElement>
    ) => void;
    sessionInfo?: SessionInfo;
    hasSessionSupport: boolean;
  }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02, y: -5 }}
      className="bg-neutral-900/50 backdrop-blur-sm border border-neutral-700/50 rounded-xl p-4 cursor-pointer group relative overflow-hidden"
      onClick={() => onProjectClick(project)}
    >
      {/* Thumbnail */}
      <div className="w-full h-32 bg-neutral-800 rounded-lg mb-3 overflow-hidden relative">
        {project.deploymentUrl ? (
          <iframe
            src={project.deploymentUrl}
            className="w-full h-full scale-50 origin-top-left transform pointer-events-none"
            title={`${project.name} preview`}
            style={{ width: "200%", height: "200%" }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Code2 className="w-8 h-8 text-neutral-600" />
          </div>
        )}

        {/* Status Badge */}
        {project.status && (
          <div className="absolute top-2 left-2">
            <span
              className={`px-2 py-1 text-xs rounded-full font-medium ${
                project.status === "ready"
                  ? "bg-green-500/20 text-green-400 border border-green-500/30"
                  : project.status === "building"
                  ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                  : project.status === "error"
                  ? "bg-red-500/20 text-red-400 border border-red-500/30"
                  : "bg-neutral-500/20 text-neutral-400 border border-neutral-500/30"
              }`}
            >
              {project.status}
            </span>
          </div>
        )}

        {/* Activity Indicator */}
        {sessionInfo?.hasActiveConversation && (
          <div className="absolute top-2 right-2">
            <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
          </div>
        )}

        {/* Compatibility Mode Indicator */}
        {!hasSessionSupport && project.messageCount && project.messageCount > 0 && (
          <div className="absolute top-2 right-2">
            <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
          </div>
        )}

        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
          <span className="text-white text-sm font-medium">Open Project</span>
        </div>
      </div>

      {/* Project Info */}
      <div className="space-y-2">
        <div className="flex items-start justify-between">
          <h3 className="text-white font-medium text-sm truncate flex-1">
            {project.name}
          </h3>
          <button
            onClick={(e) => onDeleteProject(project.id, e)}
            className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1 hover:bg-red-500/20 rounded"
          >
            <Trash2 className="w-4 h-4 text-red-400" />
          </button>
        </div>

        {project.description && (
          <p className="text-neutral-400 text-xs line-clamp-2">
            {project.description}
          </p>
        )}

        {/* Session Info or Message Count */}
        {hasSessionSupport && sessionInfo && sessionInfo.messageCount > 0 ? (
          <div className="flex items-center gap-2 p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <MessageSquare className="w-3 h-3 text-blue-400" />
            <span className="text-xs text-blue-400">
              {sessionInfo.messageCount} messages
            </span>
            <button
              onClick={(e) => onContinueChat(project, e)}
              className="text-xs text-blue-400 hover:text-blue-300 underline ml-auto"
            >
              Continue Chat
            </button>
          </div>
        ) : !hasSessionSupport && project.messageCount && project.messageCount > 0 ? (
          <div className="flex items-center gap-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <AlertCircle className="w-3 h-3 text-yellow-400" />
            <span className="text-xs text-yellow-400">
              {project.messageCount} messages (legacy)
            </span>
            <button
              onClick={(e) => onContinueChat(project, e)}
              className="text-xs text-yellow-400 hover:text-yellow-300 underline ml-auto"
            >
              Continue
            </button>
          </div>
        ) : null}

        <div className="flex items-center justify-between text-xs text-neutral-500">
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            <span>{new Date(project.createdAt).toLocaleDateString()}</span>
          </div>

          <div className="flex items-center gap-3">
            {hasSessionSupport && sessionInfo?.lastActivity && (
              <div className="flex items-center gap-1">
                <Activity className="w-3 h-3" />
                <span>
                  {new Date(sessionInfo.lastActivity).toLocaleDateString() === 
                   new Date().toLocaleDateString() 
                    ? new Date(sessionInfo.lastActivity).toLocaleTimeString([], { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })
                    : new Date(sessionInfo.lastActivity).toLocaleDateString()
                  }
                </span>
              </div>
            )}
            
            {!hasSessionSupport && project.updatedAt && 
             new Date(project.updatedAt).getTime() !== new Date(project.createdAt).getTime() && (
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>{new Date(project.updatedAt).toLocaleDateString()}</span>
              </div>
            )}
            
            {project.deploymentUrl && (
              <div className="flex items-center gap-1">
                <ExternalLink className="w-3 h-3" />
                <span>Live</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
);

ProjectCard.displayName = "ProjectCard";

// --- Main Component ---
const Index = () => {
  const [prompt, setPrompt] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState<boolean>(false);
  const [dbUser, setDbUser] = useState<DbUser | null>(null);
  const [projectSessions, setProjectSessions] = useState<Record<number, SessionInfo>>({});
  const [loadingSessions, setLoadingSessions] = useState<boolean>(false);
  const [hasSessionSupport, setHasSessionSupport] = useState(true);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'available' | 'limited'>('checking');

  const navigate = useNavigate();
  const { user: clerkUser, isLoaded } = useUser();

  // Check backend capabilities
  const checkBackendCapabilities = useCallback(async () => {
    try {
      const response = await axios.get(`${BASE_URL}/health`);
      const features = response.data.features || [];
      
      if (features.includes('Redis stateless sessions') || features.includes('Session-based conversations')) {
        setHasSessionSupport(true);
        setBackendStatus('available');
      } else {
        setHasSessionSupport(false);
        setBackendStatus('limited');
      }
    } catch (error) {
      console.warn("Could not check backend capabilities:", error);
      setHasSessionSupport(false);
      setBackendStatus('limited');
    }
  }, []);

  // Memoized handlers to prevent unnecessary re-renders
  const handlePromptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setPrompt(e.target.value);
    },
    []
  );

  const handleProjectClick = useCallback(
    (project: Project) => {
      navigate("/chatPage", {
        state: {
          projectId: project.id,
          existingProject: true,
          sessionId: hasSessionSupport ? projectSessions[project.id]?.sessionId : project.lastSessionId,
        },
      });
    },
    [navigate, projectSessions, hasSessionSupport]
  );

  const handleContinueChat = useCallback(
    (project: Project, e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      navigate("/chatPage", {
        state: {
          projectId: project.id,
          existingProject: true,
          sessionId: hasSessionSupport ? projectSessions[project.id]?.sessionId : project.lastSessionId,
        },
      });
    },
    [navigate, projectSessions, hasSessionSupport]
  );

  const handleDeleteProject = useCallback(
    async (projectId: number, e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();

      const warningMessage = hasSessionSupport 
        ? "Are you sure you want to delete this project? This will also delete all associated chat sessions and messages."
        : "Are you sure you want to delete this project? This will also delete all associated messages.";

      if (!window.confirm(warningMessage)) return;

      try {
        // Delete project and associated data
        await axios.delete(`${BASE_URL}/api/projects/${projectId}`);
        
        // Remove from local state
        setProjects((prev) => prev.filter((p) => p.id !== projectId));
        if (hasSessionSupport) {
          setProjectSessions((prev) => {
            const newSessions = { ...prev };
            delete newSessions[projectId];
            return newSessions;
          });
        }
      } catch (error) {
        console.error("Error deleting project:", error);
        // Could add toast notification here
      }
    },
    [hasSessionSupport]
  );

  const handleSubmit = useCallback(async () => {
    if (!dbUser || !prompt.trim()) {
      console.error("User not authenticated or prompt is empty");
      return;
    }

    setIsLoading(true);

    try {
      // Create project in database with enhanced metadata
      const projectData = {
        userId: dbUser.id,
        name: `Project ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        description: prompt.length > 100 ? prompt.substring(0, 100) + "..." : prompt,
        projectType: "frontend",
        status: "pending",
      };

      let newProject;
      try {
        const projectResponse = await axios.post<Project>(
          `${BASE_URL}/api/projects`,
          projectData
        );
        newProject = projectResponse.data;
      } catch (projectError) {
        console.warn("Could not create project in database, proceeding without project ID");
        // Navigate to chat page without project ID for now
        navigate("/chatPage", {
          state: {
            prompt,
            existingProject: false,
          },
        });
        return;
      }

      // Navigate to chat page with prompt and project ID
      navigate("/chatPage", {
        state: {
          prompt,
          projectId: newProject.id,
          existingProject: false,
        },
      });
    } catch (error) {
      console.error("Error creating project:", error);
      // Could add toast notification here
    } finally {
      setIsLoading(false);
    }
  }, [dbUser, prompt, navigate]);

  // Fetch session information for projects (only if session support is available)
  const fetchProjectSessions = useCallback(async (projectIds: number[]) => {
    if (projectIds.length === 0 || !hasSessionSupport) return;

    setLoadingSessions(true);
    try {
      const sessionPromises = projectIds.map(async (projectId) => {
        try {
          // Check if there's an active session for this project
          const response = await axios.get(
            `${BASE_URL}/api/conversation/project-status?projectId=${projectId}`
          );
          return {
            projectId,
            sessionInfo: response.data as SessionInfo,
          };
        } catch (error) {
          // If no session exists for this project, that's okay
          return {
            projectId,
            sessionInfo: null,
          };
        }
      });

      const results = await Promise.all(sessionPromises);
      const sessionsMap: Record<number, SessionInfo> = {};

      results.forEach(({ projectId, sessionInfo }) => {
        if (sessionInfo) {
          sessionsMap[projectId] = sessionInfo;
        }
      });

      setProjectSessions(sessionsMap);
    } catch (error) {
      console.error("Error fetching project sessions:", error);
    } finally {
      setLoadingSessions(false);
    }
  }, [hasSessionSupport]);

  // Sync user with database and fetch projects
  useEffect(() => {
    const syncUserAndFetchProjects = async () => {
      if (!isLoaded || !clerkUser) return;

      try {
        // Create or update user in database
        const userData = {
          clerkId: clerkUser.id,
          email: clerkUser.emailAddresses[0]?.emailAddress || "",
          name: clerkUser.fullName || clerkUser.firstName || "User",
          phoneNumber: clerkUser.phoneNumbers[0]?.phoneNumber || null,
          profileImage: clerkUser.imageUrl || null,
        };

        let userResponse;
        try {
          userResponse = await axios.post<DbUser>(
            `${BASE_URL}/api/users`,
            userData
          );
        } catch (userError) {
          console.warn("Users endpoint not available, using fallback user data");
          // Create a fallback user object for development
          userResponse = {
            data: {
              id: 1, // Fallback ID
              clerkId: clerkUser.id,
              email: userData.email,
              name: userData.name,
              phoneNumber: userData.phoneNumber,
              profileImage: userData.profileImage,
            }
          };
        }

        setDbUser(userResponse.data);

        // Fetch user's projects
        setLoadingProjects(true);
        try {
          const projectsResponse = await axios.get<Project[]>(
            `${BASE_URL}/api/projects/user/${userResponse.data.id}`
          );

          const fetchedProjects = projectsResponse.data;
          setProjects(fetchedProjects);

          // Fetch session information for all projects (if session support is available)
          if (fetchedProjects.length > 0 && hasSessionSupport) {
            const projectIds = fetchedProjects.map(p => p.id);
            await fetchProjectSessions(projectIds);
          }
        } catch (projectError) {
          console.warn("Could not fetch projects:", projectError);
          setProjects([]); // Set empty array as fallback
        }

      } catch (error) {
        console.error("Error syncing user or fetching projects:", error);
      } finally {
        setLoadingProjects(false);
      }
    };

    syncUserAndFetchProjects();
  }, [clerkUser, isLoaded, fetchProjectSessions, hasSessionSupport]);

  // Check backend capabilities on load
  useEffect(() => {
    checkBackendCapabilities();
  }, [checkBackendCapabilities]);

  // Refresh session data periodically (only if session support is available)
  useEffect(() => {
    if (projects.length === 0 || !hasSessionSupport) return;

    const interval = setInterval(() => {
      const projectIds = projects.map(p => p.id);
      fetchProjectSessions(projectIds);
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [projects, fetchProjectSessions, hasSessionSupport]);

  // Memoized project cards to prevent re-rendering on prompt change
  const memoizedProjectCards = useMemo(() => {
    // Sort projects by activity or message count depending on session support
    const sortedProjects = [...projects].sort((a, b) => {
      if (hasSessionSupport) {
        const aSession = projectSessions[a.id];
        const bSession = projectSessions[b.id];
        
        // Projects with active sessions first
        if (aSession?.hasActiveConversation && !bSession?.hasActiveConversation) return -1;
        if (!aSession?.hasActiveConversation && bSession?.hasActiveConversation) return 1;
        
        // Then by last activity if both have sessions
        if (aSession?.lastActivity && bSession?.lastActivity) {
          return new Date(bSession.lastActivity).getTime() - new Date(aSession.lastActivity).getTime();
        }
        
        // Projects with sessions before those without
        if (aSession && !bSession) return -1;
        if (!aSession && bSession) return 1;
      } else {
        // Sort by message count and last update for legacy mode
        const aMessages = a.messageCount || 0;
        const bMessages = b.messageCount || 0;
        
        if (aMessages !== bMessages) {
          return bMessages - aMessages; // More messages first
        }
        
        // Then by update time
        const aTime = new Date(a.updatedAt || a.createdAt).getTime();
        const bTime = new Date(b.updatedAt || b.createdAt).getTime();
        if (aTime !== bTime) {
          return bTime - aTime; // More recent first
        }
      }
      
      // Finally by creation date (newest first)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return sortedProjects.map((project, index) => (
      <motion.div
        key={project.id}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.1 }}
      >
        <ProjectCard
          project={project}
          onProjectClick={handleProjectClick}
          onDeleteProject={handleDeleteProject}
          onContinueChat={handleContinueChat}
          sessionInfo={projectSessions[project.id]}
          hasSessionSupport={hasSessionSupport}
        />
      </motion.div>
    ));
  }, [projects, projectSessions, handleProjectClick, handleDeleteProject, handleContinueChat, hasSessionSupport]);

  // Memoized project stats
  const projectStats = useMemo(() => {
    const activeProjects = projects.filter(p => p.status === "ready").length;
    
    let projectsWithChats = 0;
    let totalMessages = 0;
    
    if (hasSessionSupport) {
      projectsWithChats = Object.keys(projectSessions).length;
      totalMessages = Object.values(projectSessions).reduce(
        (sum, session) => sum + (session?.messageCount || 0), 
        0
      );
    } else {
      projectsWithChats = projects.filter(p => (p.messageCount || 0) > 0).length;
      totalMessages = projects.reduce((sum, p) => sum + (p.messageCount || 0), 0);
    }

    return {
      count: projects.length,
      active: activeProjects,
      withChats: projectsWithChats,
      totalMessages,
      text: `${projects.length} project${projects.length !== 1 ? "s" : ""} • ${activeProjects} ready`,
      chatsText: projectsWithChats > 0 ? ` • ${projectsWithChats} with chats` : "",
      messagesText: totalMessages > 0 ? ` • ${totalMessages} messages` : "",
    };
  }, [projects, projectSessions, hasSessionSupport]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && prompt.trim()) {
        handleSubmit();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [prompt, handleSubmit]);

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
        className="bg-black min-h-screen min-w-full flex flex-col items-center justify-center relative overflow-hidden"
      >
        {/* Authentication Header */}
        <motion.header
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="absolute top-6 right-6 z-20"
        >
          <SignedOut>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <SignInButton>
                <button className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors duration-200">
                  Sign In
                </button>
              </SignInButton>
            </motion.div>
          </SignedOut>
          <SignedIn>
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "w-10 h-10",
                  userButtonPopoverCard: "bg-neutral-900 border-neutral-700",
                  userButtonPopoverText: "text-white",
                },
              }}
            />
          </SignedIn>
        </motion.header>

        {/* Backend Status Indicator */}
        {backendStatus !== 'checking' && (
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="absolute top-6 left-6 z-20"
          >
            <div className={`px-3 py-2 rounded-lg border text-xs font-medium ${
              backendStatus === 'available'
                ? 'bg-green-500/10 border-green-500/20 text-green-400'
                : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
            }`}>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  backendStatus === 'available' ? 'bg-green-500' : 'bg-yellow-500'
                }`}></div>
                {backendStatus === 'available' ? 'Full Features' : 'Basic Mode'}
              </div>
            </div>
          </motion.div>
        )}

        {/* Main Content Container */}
        <div className="relative z-10 w-full max-w-6xl mx-auto px-6">
          {/* Title */}
          <motion.h1
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{
              duration: 1.2,
              ease: "easeOut",
              delay: 0.3,
            }}
            className="text-8xl md:text-[10rem] bg-gradient-to-b tracking-tighter from-white via-white to-transparent bg-clip-text text-transparent font-bold mb-8 text-center"
          >
            <motion.span
              animate={{
                textShadow: [
                  "0 0 0px rgba(255,255,255,0)",
                  "0 0 20px rgba(255,255,255,0.1)",
                  "0 0 0px rgba(255,255,255,0)",
                ],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              Buildora
            </motion.span>
          </motion.h1>

          {/* Backend Status Message */}
          {backendStatus === 'limited' && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.8, delay: 1.0 }}
              className="mb-8 text-center"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-400 text-sm">
                <AlertCircle className="w-4 h-4" />
                Running in compatibility mode - some advanced features may be unavailable
              </div>
            </motion.div>
          )}

          {/* Content only visible when signed in */}
          <SignedIn>
            {/* Prompt Input Section */}
            <div className="flex flex-col items-center mb-12">
              <motion.textarea
                initial={{ y: 30, opacity: 0, scale: 0.9 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                transition={{
                  duration: 1,
                  ease: "easeOut",
                  delay: 1.2,
                }}
                whileFocus={{
                  scale: 1.02,
                  boxShadow: "0 0 0 2px rgba(96, 165, 250, 0.3)",
                }}
                value={prompt}
                onChange={handlePromptChange}
                placeholder="Describe your project idea... (Ctrl/Cmd + Enter to create)"
                className="mb-4 border-2 focus:outline-0 border-neutral-400 rounded-lg text-white p-3 w-full max-w-2xl h-36 bg-black/50 backdrop-blur-sm transition-all duration-300 placeholder-neutral-500"
              />

              <motion.button
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{
                  duration: 1,
                  ease: "easeOut",
                  delay: 1.5,
                }}
                whileHover={{
                  scale: 1.05,
                  boxShadow: "0 10px 25px rgba(96, 165, 250, 0.3)",
                }}
                whileTap={{ scale: 0.95 }}
                className="w-fit px-7 rounded-lg py-2 bg-blue-400 hover:bg-blue-500 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium"
                onClick={handleSubmit}
                disabled={isLoading || !prompt.trim()}
              >
                <motion.span
                  animate={
                    isLoading
                      ? {
                          opacity: [1, 0.5, 1],
                        }
                      : {}
                  }
                  transition={
                    isLoading
                      ? {
                          duration: 1,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }
                      : {}
                  }
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{
                          duration: 1,
                          repeat: Infinity,
                          ease: "linear",
                        }}
                        className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                      />
                      Creating Project...
                    </span>
                  ) : (
                    "Create New Project"
                  )}
                </motion.span>
              </motion.button>
            </div>

            {/* Projects Section */}
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{
                duration: 1,
                ease: "easeOut",
                delay: 1.8,
              }}
              className="w-full"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-semibold text-white">
                  Your Projects
                </h2>
                <div className="text-right">
                  <div className="text-neutral-400 text-sm">
                    {projectStats.text}
                    {projectStats.chatsText}
                  </div>
                  {projectStats.totalMessages > 0 && (
                    <div className="text-neutral-500 text-xs">
                      {projectStats.totalMessages} total messages
                      {!hasSessionSupport && " (legacy)"}
                    </div>
                  )}
                </div>
              </div>

              {loadingProjects ? (
                <div className="flex items-center justify-center py-12">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                    className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full"
                  />
                </div>
              ) : projects.length > 0 ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {memoizedProjectCards}
                  </div>
                  {hasSessionSupport && loadingSessions && (
                    <div className="flex items-center justify-center mt-4">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{
                          duration: 1,
                          repeat: Infinity,
                          ease: "linear",
                        }}
                        className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full mr-2"
                      />
                      <span className="text-neutral-400 text-sm">Loading chat sessions...</span>
                    </div>
                  )}
                </>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-12"
                >
                  <Code2 className="w-16 h-16 text-neutral-600 mx-auto mb-4" />
                  <h3 className="text-xl font-medium text-white mb-2">
                    No projects yet
                  </h3>
                  <p className="text-neutral-400">
                    Create your first project by entering a prompt above
                  </p>
                </motion.div>
              )}
            </motion.div>
          </SignedIn>

          {/* Message for signed out users */}
          <SignedOut>
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{
                duration: 1,
                ease: "easeOut",
                delay: 1.2,
              }}
              className="text-center"
            >
              <p className="text-neutral-400 mb-4">
                Please sign in to start building your projects
              </p>
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <SignInButton>
                  <button className="px-8 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors duration-200">
                    Get Started
                  </button>
                </SignInButton>
              </motion.div>
            </motion.div>
          </SignedOut>
        </div>
      </motion.div>
    </>
  );
};

export default Index;