// SupabaseConfigForm.tsx
import React, { useState, useCallback, useEffect } from 'react';
import { 
  Database, 
  Key, 
  Eye,
  EyeOff,
  Info,
  CheckCircle,
  AlertCircle,
  X,
  Save
} from 'lucide-react';

interface SupabaseConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseToken: string;
  databaseUrl: string;
}

interface SupabaseConfigFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (config: SupabaseConfig) => void;
  initialConfig?: Partial<SupabaseConfig>;
}

interface FormErrors {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseToken?: string;
  databaseUrl?: string;
}

const SupabaseConfigForm: React.FC<SupabaseConfigFormProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialConfig = {}
}) => {
  const [config, setConfig] = useState<SupabaseConfig>({
    supabaseUrl: initialConfig.supabaseUrl || '',
    supabaseAnonKey: initialConfig.supabaseAnonKey || '',
    supabaseToken: initialConfig.supabaseToken || '',
    databaseUrl: initialConfig.databaseUrl || ''
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [showSecrets, setShowSecrets] = useState({
    supabaseToken: false,
    supabaseAnonKey: false,
    databaseUrl: false
  });

  // Load from localStorage on mount
  useEffect(() => {
    if (isOpen) {
      const stored = localStorage.getItem('supabaseConfig');
      if (stored) {
        try {
          const parsedConfig = JSON.parse(stored);
          setConfig(prev => ({
            ...prev,
            ...parsedConfig
          }));
        } catch (error) {
          console.warn('Failed to load stored Supabase config');
        }
      }
    }
  }, [isOpen]);

  // Validation functions
  const validateUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const validateSupabaseUrl = (url: string): boolean => {
    return url.includes('supabase.co') && validateUrl(url);
  };

  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    if (!config.supabaseUrl.trim()) {
      newErrors.supabaseUrl = 'Supabase URL is required';
    } else if (!validateSupabaseUrl(config.supabaseUrl)) {
      newErrors.supabaseUrl = 'Please enter a valid Supabase URL (e.g., https://xxx.supabase.co)';
    }

    if (!config.supabaseAnonKey.trim()) {
      newErrors.supabaseAnonKey = 'Supabase Anon Key is required';
    } else if (config.supabaseAnonKey.length < 20) {
      newErrors.supabaseAnonKey = 'Supabase Anon Key appears to be too short';
    }

    if (!config.supabaseToken.trim()) {
      newErrors.supabaseToken = 'Supabase Service Role Token is required';
    } else if (config.supabaseToken.length < 20) {
      newErrors.supabaseToken = 'Service Role Token appears to be too short';
    }

    if (!config.databaseUrl.trim()) {
      newErrors.databaseUrl = 'Database URL is required';
    } else if (!config.databaseUrl.startsWith('postgresql://') && !config.databaseUrl.startsWith('postgres://')) {
      newErrors.databaseUrl = 'Please enter a valid PostgreSQL connection string';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [config]);

  const handleInputChange = useCallback((field: keyof SupabaseConfig, value: string) => {
    setConfig(prev => ({
      ...prev,
      [field]: value
    }));

    // Clear field error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: undefined
      }));
    }
  }, [errors]);

  const toggleSecretVisibility = useCallback((field: keyof typeof showSecrets) => {
    setShowSecrets(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    // Save to localStorage
    localStorage.setItem('supabaseConfig', JSON.stringify(config));
    
    // Submit to parent
    onSubmit(config);
    onClose();
  }, [config, validateForm, onSubmit, onClose]);

  const loadExampleData = useCallback(() => {
    setConfig({
      supabaseUrl: 'https://your-project.supabase.co',
      supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      supabaseToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      databaseUrl: 'postgresql://postgres:[password]@db.your-project.supabase.co:5432/postgres'
    });
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-600/20 rounded-lg">
              <Database className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Supabase Configuration</h2>
              <p className="text-sm text-slate-400">Configure your backend connection</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Supabase URL */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Supabase Project URL *
            </label>
            <input
              type="url"
              value={config.supabaseUrl}
              onChange={(e) => handleInputChange('supabaseUrl', e.target.value)}
              placeholder="https://your-project.supabase.co"
              className={`w-full bg-black/30 border rounded-lg text-white p-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all duration-200 placeholder-slate-400 ${
                errors.supabaseUrl ? 'border-red-500/50' : 'border-slate-600/50'
              }`}
            />
            {errors.supabaseUrl && (
              <p className="text-red-400 text-sm mt-1">{errors.supabaseUrl}</p>
            )}
          </div>

          {/* Anon Key */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Anon Key (Public) *
            </label>
            <div className="relative">
              <input
                type={showSecrets.supabaseAnonKey ? 'text' : 'password'}
                value={config.supabaseAnonKey}
                onChange={(e) => handleInputChange('supabaseAnonKey', e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIs..."
                className={`w-full bg-black/30 border rounded-lg text-white p-3 pr-10 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all duration-200 placeholder-slate-400 ${
                  errors.supabaseAnonKey ? 'border-red-500/50' : 'border-slate-600/50'
                }`}
              />
              <button
                type="button"
                onClick={() => toggleSecretVisibility('supabaseAnonKey')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
              >
                {showSecrets.supabaseAnonKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.supabaseAnonKey && (
              <p className="text-red-400 text-sm mt-1">{errors.supabaseAnonKey}</p>
            )}
          </div>

          {/* Service Role Token */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Service Role Token *
            </label>
            <div className="relative">
              <input
                type={showSecrets.supabaseToken ? 'text' : 'password'}
                value={config.supabaseToken}
                onChange={(e) => handleInputChange('supabaseToken', e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIs..."
                className={`w-full bg-black/30 border rounded-lg text-white p-3 pr-10 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all duration-200 placeholder-slate-400 ${
                  errors.supabaseToken ? 'border-red-500/50' : 'border-slate-600/50'
                }`}
              />
              <button
                type="button"
                onClick={() => toggleSecretVisibility('supabaseToken')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
              >
                {showSecrets.supabaseToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.supabaseToken && (
              <p className="text-red-400 text-sm mt-1">{errors.supabaseToken}</p>
            )}
          </div>

          {/* Database URL */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Database Connection URL *
            </label>
            <div className="relative">
              <input
                type={showSecrets.databaseUrl ? 'text' : 'password'}
                value={config.databaseUrl}
                onChange={(e) => handleInputChange('databaseUrl', e.target.value)}
                placeholder="postgresql://postgres:[password]@db.your-project.supabase.co:5432/postgres"
                className={`w-full bg-black/30 border rounded-lg text-white p-3 pr-10 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all duration-200 placeholder-slate-400 ${
                  errors.databaseUrl ? 'border-red-500/50' : 'border-slate-600/50'
                }`}
              />
              <button
                type="button"
                onClick={() => toggleSecretVisibility('databaseUrl')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
              >
                {showSecrets.databaseUrl ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.databaseUrl && (
              <p className="text-red-400 text-sm mt-1">{errors.databaseUrl}</p>
            )}
          </div>

          {/* Help Text */}
          <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-400 mt-0.5" />
              <div className="text-sm text-blue-300">
                <p className="font-medium mb-1">Where to find these values:</p>
                <ul className="space-y-1 text-xs">
                  <li>• Go to your Supabase project dashboard</li>
                  <li>• Navigate to Settings → API</li>
                  <li>• Copy the Project URL and anon public key</li>
                  <li>• For Service Role key, use the service_role secret key</li>
                  <li>• Database URL is in Settings → Database</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={loadExampleData}
              className="px-4 py-2 bg-slate-700/50 hover:bg-slate-700/70 text-slate-300 rounded-lg transition-all duration-200 border border-slate-600/50"
            >
              Load Example
            </button>
            
            <div className="flex gap-3 flex-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-slate-700/50 hover:bg-slate-700/70 text-slate-300 rounded-lg transition-all duration-200 border border-slate-600/50"
              >
                Cancel
              </button>
              
              <button
                type="submit"
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-lg transition-all duration-200 font-medium"
              >
                <Save className="w-4 h-4" />
                Save Configuration
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SupabaseConfigForm;