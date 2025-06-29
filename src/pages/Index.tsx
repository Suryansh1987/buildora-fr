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
import { ExternalLink, Calendar, Code2, Trash2 } from "lucide-react";

// --- Types ---
interface Project {
  id: number;
  name: string;
  description?: string;
  deploymentUrl?: string;
  createdAt: string;
  projectType?: string;
  status?: string;
}

interface DbUser {
  id: number;
  clerkId: string;
  email: string;
  name: string;
  phoneNumber?: string;
  profileImage?: string;
}

// --- Constants ---
const BASE_URL = import.meta.env.VITE_BASE_URL;

// --- Memoized Components ---
const ProjectCard = React.memo(
  ({
    project,
    onProjectClick,
    onDeleteProject,
  }: {
    project: Project;
    onProjectClick: (project: Project) => void;
    onDeleteProject: (
      projectId: number,
      e: React.MouseEvent<HTMLButtonElement>
    ) => void;
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

        <div className="flex items-center justify-between text-xs text-neutral-500">
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            <span>{new Date(project.createdAt).toLocaleDateString()}</span>
          </div>

          {project.deploymentUrl && (
            <div className="flex items-center gap-1">
              <ExternalLink className="w-3 h-3" />
              <span>Live</span>
            </div>
          )}
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

  const navigate = useNavigate();
  const { user: clerkUser, isLoaded } = useUser();

  // Memoized handlers to prevent unnecessary re-renders
  const handlePromptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setPrompt(e.target.value);
    },
    []
  );
  console.log(BASE_URL, "base url");

  const handleProjectClick = useCallback(
    (project: Project) => {
      navigate("/chatPage", {
        state: {
          projectId: project.id,
          existingProject: true,
        },
      });
    },
    [navigate]
  );

  const handleDeleteProject = useCallback(
    async (projectId: number, e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();

      if (!window.confirm("Are you sure you want to delete this project?"))
        return;

      try {
        await axios.delete(`${BASE_URL}/api/projects/${projectId}`);
        setProjects((prev) => prev.filter((p) => p.id !== projectId));
      } catch (error) {
        console.error("Error deleting project:", error);
      }
    },
    []
  );

  const handleSubmit = useCallback(async () => {
    if (!dbUser || !prompt.trim()) {
      console.error("User not authenticated or prompt is empty");
      return;
    }

    setIsLoading(true);

    try {
      // Create project in database
      const projectData = {
        userId: dbUser.id,
        name: `Project ${new Date().toLocaleDateString()}`,
        description: prompt,
        projectType: "frontend",
      };

      const projectResponse = await axios.post<Project>(
        `${BASE_URL}/api/projects`,
        projectData
      );
      const newProject = projectResponse.data;

      // Navigate to chat page with prompt and project ID
      navigate("/chatPage", {
        state: {
          prompt,
          projectId: newProject.id,
        },
      });
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  }, [dbUser, prompt, navigate]);

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

        const userResponse = await axios.post<DbUser>(
          `${BASE_URL}/api/users`,
          userData
        );
        console.log(userResponse.data);

        setDbUser(userResponse.data);

        // Fetch user's projects
        setLoadingProjects(true);
        const projectsResponse = await axios.get<Project[]>(
          `${BASE_URL}/api/projects/user/${userResponse.data.id}`
        );
        console.log(projectsResponse.data);

        setProjects(projectsResponse.data);
      } catch (error) {
        console.error("Error syncing user or fetching projects:", error);
      } finally {
        setLoadingProjects(false);
      }
    };

    syncUserAndFetchProjects();
  }, [clerkUser, isLoaded]);

  // Memoized project cards to prevent re-rendering on prompt change
  const memoizedProjectCards = useMemo(() => {
    return projects.map((project, index) => (
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
        />
      </motion.div>
    ));
  }, [projects, handleProjectClick, handleDeleteProject]);

  // Memoized project stats
  const projectStats = useMemo(
    () => ({
      count: projects.length,
      text: `${projects.length} project${projects.length !== 1 ? "s" : ""}`,
    }),
    [projects.length]
  );

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
                placeholder="Enter your prompt here..."
                className="mb-4 border-2 focus:outline-0 border-neutral-400 rounded-lg text-neutral-500 p-3 w-full max-w-2xl h-36 bg-black/50 backdrop-blur-sm transition-all duration-300"
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
                className="w-fit px-7 rounded-lg py-2 bg-blue-400 hover:bg-blue-500 transition-all duration-300 disabled:opacity-50"
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

            {/* Projects Section - Memoized to prevent re-renders */}
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
                <span className="text-neutral-400 text-sm">
                  {projectStats.text}
                </span>
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {memoizedProjectCards}
                </div>
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
