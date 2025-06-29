import React, {
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { MyContext } from "../context/FrontendStructureContext";
import axios from "axios";
import { Send, Code, Loader2 } from "lucide-react";
import { useLocation } from "react-router-dom";

interface LocationState {
  prompt?: string;
  projectId?: number;
  existingProject?: boolean;
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
}

interface ContextValue {
  value: any;
  setValue: (value: any) => void;
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

  // Refs to prevent duplicate API calls
  const hasInitialized = useRef(false);
  const isGenerating = useRef(false);
  const currentProjectId = useRef<number | null>(null);

  const location = useLocation();
  const {
    prompt: navPrompt,
    projectId,
    existingProject,
  } = (location.state as LocationState) || {};
  console.log(navPrompt, projectId, existingProject);
  const baseUrl = import.meta.env.VITE_BASE_URL;

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
          // This case might mean the project exists but the build failed previously
          // Or it's still pending. You might want more granular status from backend.
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
        const response = await axios.post(`${baseUrl}/api/projects/generate`, {
          prompt: userPrompt,
          projectId: projId,
        });

        setPreviewUrl(response.data.previewUrl);
        if (projId && response.data.previewUrl) {
          await axios.put(`${baseUrl}/api/projects/${projId}`, {
            deploymentUrl: response.data.previewUrl,
            status: "ready",
          });
        }
        setProjectStatus("ready");

        // REMOVED: The axios.put call. The backend is now responsible for
        // updating its own database with the new deployment URL.
      } catch (error) {
        console.error("Error generating code:", error);
        setError("Failed to generate code. Please try again.");
        setProjectStatus("error");
      } finally {
        isGenerating.current = false;
      }
    },
    [baseUrl] // REMOVED: `setValue` is no longer a dependency
  );
  // Initialize component only once
  useEffect(() => {
    if (hasInitialized.current) return;

    const initializeProject = async () => {
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

    initializeProject();
  }, []); // Empty dependency array - runs only once

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

    try {
      const analysisPrompt = `You are analyzing a Vite React project structure that uses Tailwind CSS for styling. Based on the user's requirement and the provided project structure, identify which files need to be modified to implement the requested changes.

RESPONSE FORMAT:
Return a JSON object with this exact structure:
{
  "files_to_modify": ["array of existing file paths that need changes"],
  "files_to_create": ["array of new file paths that need to be created"],
  "reasoning": "brief explanation of why these files were selected",
  "dependencies": ["array of npm packages that might need to be installed"],
  "notes": "additional implementation notes or considerations"
}

PROJECT STRUCTURE: ${JSON.stringify(value, null, 2)}
USER REQUIREMENT: ${currentPrompt}`;

      const res = await axios.post(`${baseUrl}/generateChanges`, {
        prompt: analysisPrompt,
      });

      const analysisResult = res.data.content[0].text;

      const filesToChange = await axios.post(
        `${baseUrl}/extractFilesToChange`,
        {
          pwd: "/Users/manmindersingh/Desktop/code /ai-webisite-builder/react-base-temp",
          analysisResult,
        }
      );

      const updatedFile = await axios.post(`${baseUrl}/modify`, {
        files: filesToChange.data.files,
        prompt: currentPrompt,
      });

      const parsedData = JSON.parse(updatedFile.data.content[0].text);
      const result = parsedData.map((item: any) => ({
        path: item.path,
        content: item.content,
      }));

      await axios.post(`${baseUrl}/write-files`, {
        baseDir:
          "/Users/manmindersingh/Desktop/code /ai-webisite-builder/react-base-temp",
        files: result,
      });

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: "Changes applied successfully!",
        type: "assistant",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
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
  }, [prompt, isLoading, value, baseUrl]);

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

  return (
    <div className="w-full bg-gradient-to-br from-black via-neutral-950 to-black h-screen flex">
      {/* Chat Section - 25% width */}
      <div className="w-1/4 flex flex-col border-r border-slate-700/50">
        {/* Header */}
        <div className="bg-slate-black/50 backdrop-blur-sm border-b border-slate-700/50 p-4">
          <div className="flex items-center gap-3">
            <div>
              <a href="/" className="text-xl font-semibold text-white">
                Buildora
              </a>
            </div>
          </div>
        </div>

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
            messages.map((message) => (
              <div
                key={message.id}
                className={`p-3 rounded-lg ${
                  message.type === "user"
                    ? "bg-blue-600/20 ml-4"
                    : "bg-slate-800/30 mr-4"
                }`}
              >
                <p className="text-white text-sm">{message.content}</p>
                <span className="text-xs text-slate-400 mt-1 block">
                  {message.timestamp.toLocaleTimeString()}
                </span>
              </div>
            ))
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
              disabled={isLoading || projectStatus === "loading"}
              maxLength={1000}
            />
            <button
              onClick={handleSubmit}
              disabled={
                !prompt.trim() || isLoading || projectStatus === "loading"
              }
              className="absolute bottom-2 right-2 p-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg transition-colors duration-200"
            >
              {isLoading ? (
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
