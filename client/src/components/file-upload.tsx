import { useCallback, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CloudUpload, File, FileText, X, FilePen } from "lucide-react";

interface FileUploadProps {
  onFileSelect: (file: File | null) => void;
  selectedFile: File | null;
  disabled?: boolean;
}

export function FileUpload({ onFileSelect, selectedFile, disabled }: FileUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const { toast } = useToast();

  const validateFile = (file: File): boolean => {
    const validTypes = ['application/pdf', 'text/plain'];
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (!validTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF or TXT file.",
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
      input.accept = '.pdf,.txt';
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
    if (file.type === 'application/pdf') {
      return <FilePen className="text-red-500" />;
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
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
            <CloudUpload className="text-2xl text-gray-400" />
          </div>
          
          <div>
            <p className="text-lg font-medium text-slate-700">
              Drop your file here or click to browse
            </p>
            <p className="text-sm text-slate-500">
              Supports PDF and TXT files up to 10MB
            </p>
          </div>
          
          <div className="flex items-center justify-center space-x-4 text-sm text-slate-400">
            <span className="flex items-center">
              <FilePen className="text-red-500 mr-1 h-4 w-4" />
              PDF
            </span>
            <span className="flex items-center">
              <FileText className="text-blue-500 mr-1 h-4 w-4" />
              TXT
            </span>
          </div>
        </div>
      </div>

      {selectedFile && (
        <div className="p-4 bg-gray-50 rounded-lg flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              {getFileIcon(selectedFile)}
            </div>
            <div>
              <p className="font-medium text-slate-800">{selectedFile.name}</p>
              <p className="text-sm text-slate-500">{formatFileSize(selectedFile.size)}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={removeFile}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
