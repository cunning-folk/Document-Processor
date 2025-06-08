import { useCallback, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CloudUpload, File, FileText, X, FilePen, Sparkles } from "lucide-react";

interface FileUploadProps {
  onFileSelect: (file: File | null) => void;
  selectedFile: File | null;
  disabled?: boolean;
}

export function FileUpload({ onFileSelect, selectedFile, disabled }: FileUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const { toast } = useToast();

  const validateFile = (file: File): boolean => {
    const validTypes = ['text/plain', 'text/markdown'];
    const validExtensions = ['.txt', '.md', '.markdown'];
    const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (!validTypes.includes(file.type) && !validExtensions.includes(fileExtension)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a TXT or Markdown file.",
        variant: "destructive",
      });
      return false;
    }

    if (file.size > maxSize) {
      toast({
        title: "File too large",
        description: "Maximum file size is 10MB.",
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  const handleFile = (file: File) => {
    if (validateFile(file)) {
      onFileSelect(file);
      toast({
        title: "File uploaded",
        description: `"${file.name}" uploaded successfully!`,
      });
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragOver(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  }, [disabled]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleClick = () => {
    if (!disabled) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.txt,.md,.markdown';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          handleFile(file);
        }
      };
      input.click();
    }
  };

  const removeFile = () => {
    onFileSelect(null);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (file: File) => {
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.md') || fileName.endsWith('.markdown')) {
      return <FileText className="text-green-500" />;
    }
    return <FileText className="text-blue-500" />;
  };

  return (
    <div className="space-y-4">
      <div
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
          isDragOver 
            ? 'border-primary bg-blue-50' 
            : disabled
            ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
            : 'border-gray-300 hover:border-primary hover:bg-blue-50'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <div className="space-y-4">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto transition-all duration-300 ${
            isDragOver 
              ? 'bg-primary/20 scale-110 animate-pulse' 
              : disabled 
                ? 'bg-gray-100' 
                : 'bg-gray-100 hover:bg-primary/10 hover:scale-105'
          }`}>
            {isDragOver ? (
              <Sparkles className="text-2xl text-primary animate-bounce" />
            ) : (
              <CloudUpload className={`text-2xl transition-colors duration-300 ${
                disabled ? 'text-gray-400' : 'text-gray-400 hover:text-primary'
              }`} />
            )}
          </div>
          
          <div>
            <p className={`text-lg font-medium transition-all duration-300 ${
              isDragOver 
                ? 'text-primary scale-105' 
                : disabled 
                  ? 'text-gray-400' 
                  : 'text-slate-700'
            }`}>
              {isDragOver ? '✨ Drop your file here!' : 'Drop your file here or click to browse'}
            </p>
            <p className={`text-sm transition-colors duration-300 ${
              disabled ? 'text-gray-400' : 'text-slate-500'
            }`}>
              Supports TXT and Markdown files up to 10MB
            </p>
          </div>
          
          <div className="flex items-center justify-center space-x-4 text-sm text-slate-400">
            <span className={`flex items-center transition-transform duration-300 ${
              !disabled ? 'hover:scale-110' : ''
            }`}>
              <FileText className="text-blue-500 mr-1 h-4 w-4" />
              TXT
            </span>
            <span className={`flex items-center transition-transform duration-300 ${
              !disabled ? 'hover:scale-110' : ''
            }`}>
              <FileText className="text-green-500 mr-1 h-4 w-4" />
              Markdown
            </span>
          </div>
        </div>
      </div>

      {selectedFile && (
        <div className="p-4 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg flex items-center justify-between animate-in slide-in-from-bottom-2 duration-500 border border-green-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-100 to-green-100 rounded-lg flex items-center justify-center animate-in zoom-in-75 duration-300 delay-150 shadow-sm">
              {getFileIcon(selectedFile)}
            </div>
            <div className="animate-in slide-in-from-left-2 duration-300 delay-200">
              <p className="font-medium text-slate-800 flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-green-500" />
                {selectedFile.name}
              </p>
              <p className="text-sm text-slate-500">{formatFileSize(selectedFile.size)}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={removeFile}
            className="text-slate-400 hover:text-red-500 transition-all duration-200 hover:scale-110 animate-in fade-in duration-300 delay-300"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
