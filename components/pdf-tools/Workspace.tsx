import { useEffect, useState, useRef } from 'react';
import { PDFTool, WorkflowStep } from './data';
import { UploadZone } from './UploadZone';
import { ProgressCard } from './ProgressCard';
import { ResultCard } from './ResultCard';
import { ErrorCard } from './ErrorCard';
import { ArrowLeft } from 'lucide-react';

interface WorkspaceProps {
  tool: PDFTool;
  step: WorkflowStep;
  setStep: (step: WorkflowStep) => void;
  onBack: () => void;
}

export function Workspace({ tool, step, setStep, onBack }: WorkspaceProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Dynamic options state
  const [optionsState, setOptionsState] = useState<Record<string, string>>({});
  
  // Progress states: 'preparing', 'uploading', 'processing', 'downloading', 'complete'
  const [progressStage, setProgressStage] = useState('preparing');
  const [resultFilename, setResultFilename] = useState<string | null>(null);

  useEffect(() => {
    // When tool changes, reset state
    setSelectedFiles([]);
    setResultBlob(null);
    setResultFilename(null);
    setErrorMsg(null);
    setStep('upload');
    
    // Initialize default options
    const initialOptions: Record<string, string> = {};
    if (tool.capabilities?.options) {
      tool.capabilities.options.forEach(opt => {
        if (opt.defaultValue) {
          initialOptions[opt.id] = opt.defaultValue;
        }
      });
    }
    setOptionsState(initialOptions);
  }, [tool, setStep]);

  const handleFilesSelected = (files: File[]) => {
    setSelectedFiles(prev => [...prev, ...files]);
    if (tool.capabilities?.options && tool.capabilities.options.length > 0) {
      setStep('configure');
    } else {
      setStep('configure'); // Still go to configure to let user press Process
    }
  };

  const handleOptionChange = (id: string, value: string) => {
    setOptionsState(prev => ({ ...prev, [id]: value }));
  };

  const executeApi = async () => {
    if (!tool.capabilities?.api) {
      setErrorMsg("This tool's API is not configured in the registry.");
      return;
    }

    try {
      setProgressStage('preparing');
      const formData = new FormData();
      
      if (tool.capabilities.upload.multiple) {
        selectedFiles.forEach(f => formData.append('files', f));
      } else {
        formData.append('file', selectedFiles[0]);
      }

      // Append dynamic options
      Object.entries(optionsState).forEach(([key, val]) => {
        formData.append(key, val);
      });

      setProgressStage('uploading');
      
      const response = await fetch(tool.capabilities.api.endpoint, {
        method: tool.capabilities.api.method,
        body: formData
      });

      setProgressStage('processing');

      if (!response.ok) {
        let errStr = "Unknown server error.";
        try {
          const errJson = await response.json();
          if (errJson.error) errStr = errJson.error;
        } catch(e) {
          errStr = `Server responded with ${response.status} ${response.statusText}`;
        }
        throw new Error(errStr);
      }

      setProgressStage('downloading');
      
      if (tool.capabilities.api.responseType === 'blob') {
        const disposition = response.headers.get('content-disposition');
        let filename: string | null = null;
        if (disposition) {
          const match = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';\n]+)["']?/i);
          if (match?.[1]) {
            filename = decodeURIComponent(match[1].trim());
          }
        }
        setResultFilename(filename);
        const blob = await response.blob();
        setResultBlob(blob);
        setProgressStage('complete');
        setStep('result');
      } else {
        throw new Error("JSON response type not supported in this unified flow.");
      }

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "An unexpected error occurred during processing.");
    }
  };

  const handleProcess = () => {
    setStep('process');
    executeApi();
  };

  const handleProcessAnother = () => {
    setSelectedFiles([]);
    setResultBlob(null);
    setResultFilename(null);
    setErrorMsg(null);
    setStep('upload');
  };

  if (!tool.capabilities) {
    return (
      <div className="w-full text-center py-24 bg-white rounded-2xl shadow-sm border border-stone-200">
        <h3 className="text-2xl font-bold text-stone-900 mb-2">Coming Soon</h3>
        <p className="text-stone-500 mb-6">This feature is currently under development.</p>
        <button onClick={onBack} className="px-6 py-2 bg-stone-100 hover:bg-stone-200 rounded-xl font-medium">
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="w-full animate-in slide-in-from-bottom-4 fade-in duration-500 ease-out">
      
      {/* Back Button */}
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-stone-500 hover:text-stone-900 mb-6 font-medium transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Tools
      </button>

      {/* Workspace Header */}
      <div className="bg-stone-900 text-white rounded-t-2xl p-8 shadow-lg">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 bg-white/10 rounded-xl">
            <tool.icon className="w-8 h-8 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold mb-1">{tool.name}</h2>
            <p className="text-stone-300">{tool.metadata.description}</p>
          </div>
        </div>
      </div>

      {/* Workspace Body */}
      <div className="bg-white border-x-2 border-b-2 border-stone-200 rounded-b-2xl p-8 shadow-sm min-h-[400px]">
        {errorMsg ? (
          <ErrorCard 
            tool={tool} 
            error={errorMsg} 
            onRetry={handleProcess} 
            onChangeTool={onBack} 
          />
        ) : (
          <>
            {step === 'upload' && (
              <UploadZone 
                tool={tool} 
                selectedFiles={selectedFiles}
                onFilesSelected={handleFilesSelected} 
                onRemoveFile={(idx) => setSelectedFiles(prev => prev.filter((_, i) => i !== idx))}
              />
            )}

            {step === 'configure' && (
              <div className="max-w-2xl mx-auto py-8 animate-in fade-in">
                
                {tool.capabilities.options && tool.capabilities.options.length > 0 && (
                  <div className="mb-8 p-6 bg-stone-50 border border-stone-200 rounded-xl text-left shadow-sm">
                    <h3 className="text-lg font-bold text-stone-900 mb-6">Tool Options</h3>
                    <div className="space-y-6">
                      {tool.capabilities.options.map(opt => (
                        <div key={opt.id} className="flex flex-col gap-2">
                          <label htmlFor={opt.id} className="font-semibold text-stone-700">
                            {opt.label}
                          </label>
                          {opt.type === 'text' && (
                            <input 
                              type="text"
                              id={opt.id}
                              className="px-4 py-3 border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-900 outline-none"
                              placeholder={opt.placeholder}
                              value={optionsState[opt.id] || ''}
                              onChange={(e) => handleOptionChange(opt.id, e.target.value)}
                            />
                          )}
                          {opt.type === 'select' && opt.options && (
                            <select
                              id={opt.id}
                              className="px-4 py-3 border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-900 outline-none bg-white"
                              value={optionsState[opt.id] || ''}
                              onChange={(e) => handleOptionChange(opt.id, e.target.value)}
                            >
                              {opt.options.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <UploadZone 
                  tool={tool} 
                  selectedFiles={selectedFiles}
                  onFilesSelected={handleFilesSelected} 
                  onRemoveFile={(idx) => setSelectedFiles(prev => prev.filter((_, i) => i !== idx))}
                />
                <button 
                  onClick={handleProcess}
                  disabled={selectedFiles.length === 0}
                  className="w-full py-4 bg-stone-900 disabled:opacity-50 hover:bg-stone-800 text-white rounded-xl font-bold text-lg shadow-md hover:shadow-lg transition-all active:scale-95 mt-4"
                >
                  {tool.metadata.ctaText}
                </button>
              </div>
            )}

            {step === 'process' && (
              <ProgressCard tool={tool} stage={progressStage} />
            )}

            {step === 'result' && resultBlob && (
              <ResultCard 
                tool={tool} 
                blob={resultBlob}
                serverFilename={resultFilename || undefined}
                onReset={onBack} 
                onProcessAnother={handleProcessAnother} 
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
